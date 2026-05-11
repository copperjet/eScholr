/**
 * generate-timetable — CSP backtrack + SA polish solver
 *
 * Supports chunked execution for large schools (>80 streams):
 *   First call: runs until CHUNK_DEADLINE_MS (55s), writes checkpoint, returns {status:'chunked'}.
 *   Client re-POSTs with {resume:true, run_id} until status !== 'chunked'.
 *
 * POST body:
 *   { school_id, timetable_id, algorithm?, seed?, max_runtime_ms?,
 *     options?: { allow_double_periods, lock_existing_slots: uuid[] },
 *     resume?: boolean, run_id?: string }
 *
 * Returns:
 *   { timetable_id, run_id, status, slots_written, conflicts, cost_score, runtime_ms,
 *     progress?: { processed: number, total: number } }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHUNK_DEADLINE_MS = 55_000; // leave 5s for writes within 60s wall

// ── Types ─────────────────────────────────────────────────────

interface RequestBody {
  school_id: string;
  timetable_id: string;
  academic_year_id?: string | null;
  semester_id?: string | null;
  algorithm?: 'csp_backtrack' | 'csp_hillclimb' | 'simulated_annealing';
  seed?: number;
  max_runtime_ms?: number;
  options?: { allow_double_periods?: boolean; lock_existing_slots?: string[] };
  resume?: boolean;
  run_id?: string;
}

interface ScheduleSlot {
  stream_id: string;
  day_of_week: number;
  period_index: number;
  subject_id: string | null;
  staff_id: string | null;
  room_id: string | null;
  slot_type: string;
  is_locked: boolean;
  /** R3.1: part of a consecutive double-period pair */
  is_double?: boolean;
  /** Not written to DB. True = already exists in DB; skip on insert. */
  _existing?: boolean;
}

interface Checkpoint {
  processed_stream_ids: string[];
  subject_counts: Record<string, Record<string, number>>;
  total_streams: number;
  seed: number;
}

// ── Main ──────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startMs = Date.now();

  try {
    const body: RequestBody = await req.json();
    const {
      school_id,
      timetable_id,
      algorithm = 'csp_backtrack',
      seed: bodySeed,
      max_runtime_ms = 60_000,
      options = {},
      resume = false,
      run_id: bodyRunId,
    } = body;

    if (!school_id || !timetable_id) {
      return json({ error: 'school_id and timetable_id required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader ?? '' } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const appMeta     = (user as any).app_metadata ?? {};
    const jwtSchoolId = appMeta.school_id as string | undefined;
    if (jwtSchoolId !== school_id) return json({ error: 'Forbidden' }, 403);

    // R1.8: require admin-level role to trigger generation
    const userRoles: string[] = appMeta.roles ?? [];
    const ALLOWED = ['super_admin','school_super_admin','admin','principal','coordinator'];
    if (!userRoles.some((r) => ALLOWED.includes(r))) {
      return json({ error: 'Forbidden — admin role required' }, 403);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Run record ────────────────────────────────────────────

    let run_id: string;
    let checkpoint: Checkpoint | null = null;
    let seed = bodySeed ?? Date.now();

    if (resume && bodyRunId) {
      // Load existing run + checkpoint
      run_id = bodyRunId;
      const { data: runRow } = await admin
        .from('timetable_generation_runs')
        .select('input_snapshot, seed, status')
        .eq('id', run_id)
        .single();
      if (!runRow) return json({ error: 'Run not found' }, 404);
      if (runRow.status === 'succeeded') return json({ error: 'Run already succeeded' }, 400);
      checkpoint = runRow.input_snapshot?.checkpoint as Checkpoint ?? null;
      seed = runRow.seed ?? seed;
      await admin.from('timetable_generation_runs').update({
        status: 'running',
        started_at: new Date().toISOString(),
      }).eq('id', run_id);
    } else {
      const { data: runRow, error: runErr } = await admin
        .from('timetable_generation_runs')
        .insert({
          school_id, timetable_id,
          triggered_by: user.id,
          algorithm, seed,
          status: 'running',
          started_at: new Date().toISOString(),
          input_snapshot: { total_streams: 0 },
        })
        .select('id')
        .single();
      if (runErr) throw runErr;
      run_id = runRow.id;
      await admin.from('timetables')
        .update({ status: 'generating', generation_run_id: run_id })
        .eq('id', timetable_id);
    }

    // ── Load inputs ───────────────────────────────────────────

    const [
      settingsRes, periodsRes, streamsRes, requirementsRes,
      teacherAssignmentsRes, availabilityRes, constraintsRes, roomsRes,
    ] = await Promise.all([
      admin.from('timetable_settings').select('*').eq('school_id', school_id).single(),
      admin.from('timetable_periods').select('*').eq('school_id', school_id).order('period_index'),
      admin.from('streams').select('id, name, grade_id').eq('school_id', school_id),
      admin.from('subject_period_requirements').select('*').eq('school_id', school_id),
      admin.from('subject_teacher_assignments').select('staff_id, subject_id, stream_id').eq('school_id', school_id),
      admin.from('teacher_availability').select('*').eq('school_id', school_id),
      admin.from('teacher_constraints').select('*').eq('school_id', school_id),
      admin.from('rooms').select('*').eq('school_id', school_id).eq('is_active', true),
    ]);

    const settings  = settingsRes.data;
    const periods   = periodsRes.data ?? [];
    const allStreams = streamsRes.data ?? [];
    const reqs      = requirementsRes.data ?? [];
    const staAssign = teacherAssignmentsRes.data ?? [];
    const avail     = availabilityRes.data ?? [];
    const constrs   = constraintsRes.data ?? [];
    const rooms     = roomsRes.data ?? [];

    if (!settings) {
      await failRun(admin, run_id, timetable_id, 'No timetable settings found');
      return json({ error: 'Timetable settings not configured', run_id, status: 'failed' }, 400);
    }

    // ── Preflight (first run only) ────────────────────────────

    if (!resume) {
      const preflightErrors: string[] = [];
      if (periods.filter((p: any) => !p.is_break && !p.is_assembly).length === 0) preflightErrors.push('No teaching periods defined');
      if (allStreams.length === 0) preflightErrors.push('No streams found');
      if (reqs.length === 0) preflightErrors.push('No subject period requirements defined');
      if (staAssign.length === 0) preflightErrors.push('No teacher-subject assignments found');
      if (rooms.length === 0) preflightErrors.push('No rooms defined');
      if (preflightErrors.length > 0) {
        await failRun(admin, run_id, timetable_id, preflightErrors.join('; '));
        return json({ error: 'Preflight failed', diagnostics: preflightErrors, run_id, status: 'failed' }, 400);
      }
    }

    // ── Domain maps ───────────────────────────────────────────

    const teachingPeriods = periods.filter((p: any) => !p.is_break && !p.is_assembly);
    const workingDays: number[] = settings.working_days ?? [1,2,3,4,5];

    const staffSubjectsByStream: Record<string, Record<string, string[]>> = {};
    const staffSubjectsGlobal: Record<string, string[]> = {};
    for (const a of staAssign as any[]) {
      if (a.stream_id) {
        if (!staffSubjectsByStream[a.stream_id]) staffSubjectsByStream[a.stream_id] = {};
        if (!staffSubjectsByStream[a.stream_id][a.subject_id]) staffSubjectsByStream[a.stream_id][a.subject_id] = [];
        staffSubjectsByStream[a.stream_id][a.subject_id].push(a.staff_id);
      }
      if (!staffSubjectsGlobal[a.subject_id]) staffSubjectsGlobal[a.subject_id] = [];
      if (!staffSubjectsGlobal[a.subject_id].includes(a.staff_id)) {
        staffSubjectsGlobal[a.subject_id].push(a.staff_id);
      }
    }

    const unavailSet = new Set<string>();
    for (const a of avail as any[]) {
      if (a.status === 'unavailable') unavailSet.add(`${a.staff_id}:${a.day_of_week}:${a.period_index}`);
    }

    const tcMap: Record<string, any> = {};
    for (const c of constrs as any[]) tcMap[c.staff_id] = c;

    const reqsByStream: Record<string, Record<string, number>> = {};
    const reqsByGrade: Record<string, Record<string, number>> = {};
    for (const r of reqs as any[]) {
      if (r.stream_id) {
        if (!reqsByStream[r.stream_id]) reqsByStream[r.stream_id] = {};
        reqsByStream[r.stream_id][r.subject_id] = r.periods_per_week;
      } else if (r.grade_id) {
        if (!reqsByGrade[r.grade_id]) reqsByGrade[r.grade_id] = {};
        reqsByGrade[r.grade_id][r.subject_id] = r.periods_per_week;
      }
    }

    // ── Schedule + booking tracking (R0.2, R0.3) ──────────────

    const schedule: ScheduleSlot[] = [];
    const teacherDayPeriod = new Set<string>();
    const roomDayPeriod    = new Set<string>();
    const teacherDayCount: Record<string, { count: number }> = {};
    const lockSlotIds = new Set<string>(options.lock_existing_slots ?? []);

    // R0.2: On fresh run, clear all non-locked slots so rerun doesn't crash on UNIQUE.
    if (!resume) {
      let deleteQ = (admin as any)
        .from('timetable_slots')
        .delete()
        .eq('timetable_id', timetable_id)
        .eq('is_locked', false);
      // Also preserve any slots explicitly listed in lock_existing_slots.
      if (lockSlotIds.size > 0) {
        deleteQ = deleteQ.not('id', 'in', `(${[...lockSlotIds].join(',')})`);
      }
      const { error: delErr } = await deleteQ;
      if (delErr) throw delErr;
    }

    // R0.3: Load all surviving DB slots (locked or prior-chunk) into schedule +
    // tracking sets, so the solver never overwrites them.
    const { data: dbSlots } = await admin
      .from('timetable_slots')
      .select('id, staff_id, room_id, day_of_week, period_index, stream_id, subject_id, slot_type')
      .eq('timetable_id', timetable_id);

    for (const s of dbSlots ?? []) {
      schedule.push({
        stream_id:    s.stream_id,
        day_of_week:  s.day_of_week,
        period_index: s.period_index,
        subject_id:   s.subject_id,
        staff_id:     s.staff_id,
        room_id:      s.room_id,
        slot_type:    s.slot_type,
        is_locked:    s.is_locked ?? false,
        _existing:    true, // already in DB — skip re-insert
      });
      if (s.staff_id) {
        teacherDayPeriod.add(`${s.staff_id}:${s.day_of_week}:${s.period_index}`);
        const dk = `${s.staff_id}:${s.day_of_week}`;
        if (!teacherDayCount[dk]) teacherDayCount[dk] = { count: 0 };
        teacherDayCount[dk].count++;
      }
      if (s.room_id) roomDayPeriod.add(`${s.room_id}:${s.day_of_week}:${s.period_index}`);
    }

    // ── Determine which streams to process ────────────────────

    const processedStreamIds = new Set<string>(checkpoint?.processed_stream_ids ?? []);
    const streamSubjectCount: Record<string, Record<string, number>> = checkpoint?.subject_counts ?? {};
    const streamsToProcess = (allStreams as any[]).filter((s) => !processedStreamIds.has(s.id));

    // ── PRNG ──────────────────────────────────────────────────

    let rngState = seed;
    function rng(): number {
      rngState = (rngState * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (rngState >>> 0) / 0xFFFFFFFF;
    }
    function shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // deadline: per-chunk limit
    const chunkDeadline = startMs + CHUNK_DEADLINE_MS;
    const hardDeadline  = startMs + Math.min(max_runtime_ms, 90_000);
    const deadline      = Math.min(chunkDeadline, hardDeadline);

    // ── CSP solver helpers ────────────────────────────────────

    // Sorted teaching period indices (for first/last and consecutive checks)
    const sortedPeriodIdxArr: number[] = (teachingPeriods as any[])
      .map((p: any) => p.period_index)
      .sort((a: number, b: number) => a - b);
    const firstPeriodIdx = sortedPeriodIdxArr[0] ?? 0;
    const lastPeriodIdx  = sortedPeriodIdxArr[sortedPeriodIdxArr.length - 1] ?? 99;

    // O(1) slot occupancy map: "streamId:day:period" → true (R3.2 — fixes O(n²) find)
    const schedMap = new Map<string, true>();
    for (const s of schedule) {
      schedMap.set(`${s.stream_id}:${s.day_of_week}:${s.period_index}`, true);
    }

    // R1.3: teacher week period count (total periods placed, including pre-existing)
    const teacherWeekCount: Record<string, number> = {};
    // R1.2: per teacher per day, sorted list of assigned period indices
    const teacherDaySlotsMap: Record<string, number[]> = {};
    for (const s of schedule) { // all pre-existing
      if (s.staff_id) {
        teacherWeekCount[s.staff_id] = (teacherWeekCount[s.staff_id] ?? 0) + 1;
        const dk2 = `${s.staff_id}:${s.day_of_week}`;
        if (!teacherDaySlotsMap[dk2]) teacherDaySlotsMap[dk2] = [];
        teacherDaySlotsMap[dk2].push(s.period_index);
      }
    }

    // R1.2: consecutive run check — returns true if adding newPi is OK
    function checkConsecutive(staffId: string, day: number, newPi: number): boolean {
      const maxConsec = (tcMap[staffId]?.max_consecutive
        ?? settings.max_consecutive_per_teacher ?? 3) as number;
      const dk2 = `${staffId}:${day}`;
      const existing = [...(teacherDaySlotsMap[dk2] ?? []), newPi].sort((a, b) => a - b);
      let run = 1;
      for (let i = 1; i < existing.length; i++) {
        const pPrev = sortedPeriodIdxArr.indexOf(existing[i - 1]);
        const pCurr = sortedPeriodIdxArr.indexOf(existing[i]);
        if (pCurr - pPrev === 1) {
          run++;
          if (run > maxConsec) return false;
        } else {
          run = 1;
        }
      }
      return true;
    }

    // Build merged requirement map per stream (stream overrides grade for room prefs)
    const mergedReqMap: Record<string, Record<string, any>> = {};
    for (const r of reqs as any[]) {
      if (r.stream_id) {
        if (!mergedReqMap[r.stream_id]) mergedReqMap[r.stream_id] = {};
        mergedReqMap[r.stream_id][r.subject_id] = r;
      }
    }
    for (const str of allStreams as any[]) {
      if (!mergedReqMap[str.id]) mergedReqMap[str.id] = {};
      for (const r of reqs as any[]) {
        if (r.grade_id === str.grade_id && !r.stream_id && !mergedReqMap[str.id][r.subject_id]) {
          mergedReqMap[str.id][r.subject_id] = r;
        }
      }
    }

    // R1.4: room picker with preferred_room_type + requires_specific_room_id
    function pickRoomForSubject(
      subjectId: string,
      day: number,
      pi: number,
      streamSubjReqMap: Record<string, any>,
    ): string | null {
      const req = streamSubjReqMap[subjectId];
      const requiredRoomId = req?.requires_specific_room_id as string | null | undefined;
      const preferredType  = req?.preferred_room_type as string | null | undefined;
      if (requiredRoomId) {
        return roomDayPeriod.has(`${requiredRoomId}:${day}:${pi}`) ? null : requiredRoomId;
      }
      if (preferredType) {
        for (const room of rooms as any[]) {
          if (room.room_type === preferredType && !roomDayPeriod.has(`${room.id}:${day}:${pi}`)) {
            return room.id as string;
          }
        }
      }
      for (const room of rooms as any[]) {
        if (!roomDayPeriod.has(`${room.id}:${day}:${pi}`)) return room.id as string;
      }
      return null;
    }

    // R1.1: MRV domain size — number of free (day,period) cells where at least
    // one teacher can still be placed for this stream+subject (fast approximation)
    function computeDomainSize(streamId: string, subjectId: string): number {
      const teachers = [
        ...(staffSubjectsByStream[streamId]?.[subjectId] ?? []),
        ...(staffSubjectsGlobal[subjectId] ?? []).filter(
          (t: string) => !(staffSubjectsByStream[streamId]?.[subjectId] ?? []).includes(t),
        ),
      ];
      let count = 0;
      for (const day of workingDays) {
        for (const pi of sortedPeriodIdxArr) {
          if (schedMap.has(`${streamId}:${day}:${pi}`)) continue;
          for (const staffId of teachers) {
            if (!teacherDayPeriod.has(`${staffId}:${day}:${pi}`)
                && !unavailSet.has(`${staffId}:${day}:${pi}`)) {
              count++; break;
            }
          }
        }
      }
      return count;
    }

    // Core placement function: find first valid (day,period,teacher,room) for a slot.
    function tryPlaceSlot(
      streamId: string,
      day: number,
      pi: number,
      subjectId: string,
      teachers: string[],
      streamSubjReqMap: Record<string, any>,
    ): boolean {
      for (const staffId of teachers) {
        const tc = tcMap[staffId];
        if (tc?.no_first_period && pi === firstPeriodIdx) continue;
        if (tc?.no_last_period  && pi === lastPeriodIdx)  continue;
        if (unavailSet.has(`${staffId}:${day}:${pi}`)) continue;
        if (teacherDayPeriod.has(`${staffId}:${day}:${pi}`)) continue;

        // R1.3 max_periods_per_week
        const maxWeek = (tc?.max_periods_per_week ?? 9999) as number;
        if ((teacherWeekCount[staffId] ?? 0) >= maxWeek) continue;

        // max_periods_per_day
        const maxDay = (tc?.max_periods_per_day ?? settings.max_periods_per_teacher_day ?? 6) as number;
        const dayKey = `${staffId}:${day}`;
        if (!teacherDayCount[dayKey]) teacherDayCount[dayKey] = { count: 0 };
        if (teacherDayCount[dayKey].count >= maxDay) continue;

        // R1.2 max_consecutive
        if (!checkConsecutive(staffId, day, pi)) continue;

        // R1.4 room
        const roomId = pickRoomForSubject(subjectId, day, pi, streamSubjReqMap);
        if ((streamSubjReqMap[subjectId]?.requires_specific_room_id) && roomId === null) continue;

        // ── Commit assignment ──────────────────────────────────
        schedule.push({
          stream_id:    streamId,
          day_of_week:  day,
          period_index: pi,
          subject_id:   subjectId,
          staff_id:     staffId,
          room_id:      roomId,
          slot_type:    'lesson',
          is_locked:    false,
        });
        schedMap.set(`${streamId}:${day}:${pi}`, true);
        teacherDayPeriod.add(`${staffId}:${day}:${pi}`);
        if (roomId) roomDayPeriod.add(`${roomId}:${day}:${pi}`);
        teacherDayCount[dayKey].count++;
        teacherWeekCount[staffId] = (teacherWeekCount[staffId] ?? 0) + 1;
        const dk2 = `${staffId}:${day}`;
        if (!teacherDaySlotsMap[dk2]) teacherDaySlotsMap[dk2] = [];
        teacherDaySlotsMap[dk2].push(pi);
        return true;
      }
      return false;
    }

    // ── R3.3: pre-build domain size cache ────────────────────
    // Compute domain sizes once per (stream, subject) before the loop so MRV
    // sort doesn't redundantly recompute for every stream on every iteration.
    // Stale mid-loop but accurate enough for initial MRV ordering.
    const domainCache = new Map<string, number>();
    for (const stream of streamsToProcess) {
      const streamReqs = reqsByStream[stream.id] ?? reqsByGrade[stream.grade_id] ?? {};
      for (const subjectId of Object.keys(streamReqs)) {
        domainCache.set(`${stream.id}:${subjectId}`, computeDomainSize(stream.id, subjectId));
      }
    }

    // ── R1.1: MRV-ordered placement loop ──────────────────────

    let conflicts = 0;
    let chunked = false;

    for (const stream of streamsToProcess) {
      if (Date.now() > deadline) { chunked = true; break; }

      if (!streamSubjectCount[stream.id]) streamSubjectCount[stream.id] = {};

      const streamSubjReqMap = mergedReqMap[stream.id] ?? {};
      const streamReqs = reqsByStream[stream.id] ?? reqsByGrade[stream.grade_id] ?? {};

      // Build shuffled teacher lists per subject (LCV: stream-specific first)
      const subjectTeacherLists: Record<string, string[]> = {};
      for (const subjectId of Object.keys(streamReqs)) {
        subjectTeacherLists[subjectId] = shuffle([
          ...(staffSubjectsByStream[stream.id]?.[subjectId] ?? []),
          ...(staffSubjectsGlobal[subjectId] ?? []).filter(
            (t: string) => !(staffSubjectsByStream[stream.id]?.[subjectId] ?? []).includes(t),
          ),
        ]);
      }

      // MRV: sort by domain size (most constrained first) — R3.3: use cached sizes
      const subjectList = Object.keys(streamReqs).sort((a, b) =>
        (domainCache.get(`${stream.id}:${a}`) ?? 0) - (domainCache.get(`${stream.id}:${b}`) ?? 0)
      );

      for (const subjectId of subjectList) {
        if (chunked) break;
        const needed = streamReqs[subjectId] ?? 0;
        if (!streamSubjectCount[stream.id][subjectId]) streamSubjectCount[stream.id][subjectId] = 0;
        const teachers = subjectTeacherLists[subjectId];

        for (let i = 0; i < needed; i++) {
          if (Date.now() > deadline) { chunked = true; break; }

          // Build shuffled (day, period) candidate list (forward checking: skip occupied cells)
          const dayPeriodCandidates: Array<{ day: number; pi: number }> = [];
          for (const day of shuffle([...workingDays])) {
            for (const pi of shuffle([...sortedPeriodIdxArr])) {
              if (!schedMap.has(`${stream.id}:${day}:${pi}`)) {
                dayPeriodCandidates.push({ day, pi });
              }
            }
          }

          let placed = false;
          for (const { day, pi } of dayPeriodCandidates) {
            if (tryPlaceSlot(stream.id, day, pi, subjectId, teachers, streamSubjReqMap)) {
              streamSubjectCount[stream.id][subjectId]++;
              placed = true;
              break;
            }
          }
          if (!placed) conflicts++;
        }
      }

      if (!chunked) {
        // Fill free + break/assembly slots for this stream
        for (const day of workingDays) {
          for (const pi of sortedPeriodIdxArr) {
            if (!schedMap.has(`${stream.id}:${day}:${pi}`)) {
              schedule.push({ stream_id: stream.id, day_of_week: day, period_index: pi, subject_id: null, staff_id: null, room_id: null, slot_type: 'free', is_locked: false });
              schedMap.set(`${stream.id}:${day}:${pi}`, true);
            }
          }
          for (const period of periods as any[]) {
            if (!period.is_break && !period.is_assembly) continue;
            if (!schedMap.has(`${stream.id}:${day}:${period.period_index}`)) {
              schedule.push({ stream_id: stream.id, day_of_week: day, period_index: period.period_index, subject_id: null, staff_id: null, room_id: null, slot_type: period.is_assembly ? 'assembly' : 'break', is_locked: true });
              schedMap.set(`${stream.id}:${day}:${period.period_index}`, true);
            }
          }
        }
        processedStreamIds.add(stream.id);
      }
    }

    // ── R3.1: Phase 1.5 — Double-period merger ───────────────
    // After CSP places single-period slots, merge adjacent same-subject,
    // same-teacher consecutive lesson slots into is_double=true pairs.
    // Respects per-subject max_double_periods ceiling.
    if (!chunked && (settings.allow_double_periods ?? false)) {
      for (const stream of allStreams as any[]) {
        const subjReqMap = mergedReqMap[stream.id] ?? {};

        for (const [subjectId, req] of Object.entries(subjReqMap) as [string, any][]) {
          if (!req?.double_period_allowed || !(req.min_double_periods > 0)) continue;
          const maxDoubles = (req.max_double_periods ?? req.min_double_periods) as number;

          // Collect new (non-existing, non-double) lesson slots for this stream+subject
          const slotsByDay: Record<number, Array<{ idx: number; slot: ScheduleSlot }>> = {};
          for (let i = 0; i < schedule.length; i++) {
            const s = schedule[i];
            if (s.stream_id === stream.id && s.subject_id === subjectId
                && s.slot_type === 'lesson' && !s.is_double && !s._existing) {
              if (!slotsByDay[s.day_of_week]) slotsByDay[s.day_of_week] = [];
              slotsByDay[s.day_of_week].push({ idx: i, slot: s });
            }
          }

          let doublesCreated = 0;
          for (const day of workingDays) {
            if (doublesCreated >= maxDoubles) break;
            const daySlots = (slotsByDay[day] ?? [])
              .sort((a, b) => a.slot.period_index - b.slot.period_index);

            for (let k = 0; k < daySlots.length - 1; k++) {
              if (doublesCreated >= maxDoubles) break;
              const { idx: i1, slot: s1 } = daySlots[k];
              const { idx: i2, slot: s2 } = daySlots[k + 1];

              // Must be consecutive in teaching-period sequence
              const tpi1 = sortedPeriodIdxArr.indexOf(s1.period_index);
              const tpi2 = sortedPeriodIdxArr.indexOf(s2.period_index);
              if (tpi2 - tpi1 !== 1) continue;

              // Must be same teacher (double = continuous lesson)
              if (s1.staff_id !== s2.staff_id) continue;

              schedule[i1] = { ...s1, is_double: true };
              schedule[i2] = { ...s2, is_double: true };
              doublesCreated++;
              k++; // skip s2 to avoid overlapping pair detection
            }
          }
        }
      }
    }

    // ── R2.1–R2.3: SA polish (runs only when all streams done in this chunk) ──

    // R2.3: SA runs after CSP (csp_backtrack), or as primary pass (simulated_annealing),
    // or as a hill-climb variant (csp_hillclimb = SA with T_END near T_START → greedy ascent).
    const runSA = !chunked && Date.now() < deadline - 3000
      && (algorithm === 'csp_backtrack' || algorithm === 'csp_hillclimb' || algorithm === 'simulated_annealing');
    if (runSA) {
      const SA_BUDGET_MS = algorithm === 'simulated_annealing'
        ? Math.min(40_000, deadline - Date.now() - 2000) // SA gets more budget when primary
        : Math.min(20_000, deadline - Date.now() - 2000);
      const saStart = Date.now();

      // Prefer availability map: "staffId:day:pi" → true
      const preferredSet = new Set<string>();
      for (const a of avail as any[]) {
        if (a.status === 'preferred') {
          preferredSet.add(`${a.staff_id}:${a.day_of_week}:${a.period_index}`);
        }
      }

      // Cost function: lower is better
      // Components: +5 per same-subject same-day duplicate, +5 per unpreferred violation,
      //             +2 per teacher day gap, +1 per teacher load imbalance unit
      function computeCost(sched: ScheduleSlot[]): number {
        const lessons = sched.filter((s) => s.slot_type === 'lesson' && s.staff_id);
        let cost = 0;

        // Same-subject-per-day clustering penalty
        const streamSubjDay: Record<string, number> = {};
        for (const s of lessons) {
          const k = `${s.stream_id}:${s.subject_id}:${s.day_of_week}`;
          streamSubjDay[k] = (streamSubjDay[k] ?? 0) + 1;
        }
        for (const cnt of Object.values(streamSubjDay)) {
          if ((cnt as number) > 1) cost += ((cnt as number) - 1) * 5;
        }

        // R2.2: preferred slot violations
        for (const s of lessons) {
          if (s.staff_id && !preferredSet.has(`${s.staff_id}:${s.day_of_week}:${s.period_index}`)) {
            cost += 3;
          }
        }

        // Teacher load balance (variance proxy)
        const wk: Record<string, number> = {};
        for (const s of lessons) { if (s.staff_id) wk[s.staff_id] = (wk[s.staff_id] ?? 0) + 1; }
        const vals = Object.values(wk) as number[];
        if (vals.length > 1) {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          for (const v of vals) cost += Math.abs(v - mean);
        }

        // R3.4: min_gap_same_subject_days — penalise placements too close together
        const minGapDays = (settings.min_gap_same_subject_days ?? 0) as number;
        if (minGapDays > 0) {
          const streamSubjDays: Record<string, number[]> = {};
          for (const s of lessons) {
            const k = `${s.stream_id}:${s.subject_id}`;
            if (!streamSubjDays[k]) streamSubjDays[k] = [];
            streamSubjDays[k].push(s.day_of_week);
          }
          for (const daysArr of Object.values(streamSubjDays)) {
            const sorted = [...(daysArr as number[])].sort((a, b) => a - b);
            for (let gi = 1; gi < sorted.length; gi++) {
              const gap = sorted[gi] - sorted[gi - 1];
              if (gap > 0 && gap < minGapDays) cost += (minGapDays - gap) * 3;
            }
          }
        }

        return cost;
      }

      // Lesson indices only (non-existing, non-locked)
      const lessonIdxs = schedule
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.slot_type === 'lesson' && !s._existing && !s.is_locked)
        .map(({ i }) => i);

      let currentCost = computeCost(schedule);
      // csp_hillclimb = SA with very low temperature (greedy ascent only)
      let T = algorithm === 'csp_hillclimb' ? 0.001 : 1.0;
      const T_END = algorithm === 'csp_hillclimb' ? 0.0001 : 0.01;
      const iterations = Math.min(5000, Math.floor(SA_BUDGET_MS / 0.5));
      const alpha = Math.pow(T_END / T, 1 / Math.max(1, iterations));

      for (let iter = 0; iter < iterations; iter++) {
        if (Date.now() - saStart > SA_BUDGET_MS) break;
        if (lessonIdxs.length < 2) break;

        // Pick random neighbor operation: 0 = move, 1 = teacher-swap
        const op = Math.floor(rng() * 2);

        if (op === 0) {
          // Move: pick a lesson slot, move to a different free cell in same stream
          const idx = lessonIdxs[Math.floor(rng() * lessonIdxs.length)];
          const slot = schedule[idx];
          const newDay = workingDays[Math.floor(rng() * workingDays.length)];
          const newPi  = sortedPeriodIdxArr[Math.floor(rng() * sortedPeriodIdxArr.length)];
          if (newDay === slot.day_of_week && newPi === slot.period_index) { T *= alpha; continue; }
          if (schedMap.has(`${slot.stream_id}:${newDay}:${newPi}`)) { T *= alpha; continue; }
          if (teacherDayPeriod.has(`${slot.staff_id}:${newDay}:${newPi}`)) { T *= alpha; continue; }

          // Tentative swap
          schedMap.delete(`${slot.stream_id}:${slot.day_of_week}:${slot.period_index}`);
          teacherDayPeriod.delete(`${slot.staff_id!}:${slot.day_of_week}:${slot.period_index}`);
          const oldDay = slot.day_of_week; const oldPi = slot.period_index;
          schedule[idx] = { ...slot, day_of_week: newDay, period_index: newPi };
          schedMap.set(`${slot.stream_id}:${newDay}:${newPi}`, true);
          teacherDayPeriod.add(`${slot.staff_id!}:${newDay}:${newPi}`);

          const newCost = computeCost(schedule);
          const delta = newCost - currentCost;
          if (delta < 0 || Math.exp(-delta / T) > rng()) {
            currentCost = newCost;
          } else {
            // Revert
            schedMap.delete(`${slot.stream_id}:${newDay}:${newPi}`);
            teacherDayPeriod.delete(`${slot.staff_id!}:${newDay}:${newPi}`);
            schedule[idx] = { ...slot, day_of_week: oldDay, period_index: oldPi };
            schedMap.set(`${slot.stream_id}:${oldDay}:${oldPi}`, true);
            teacherDayPeriod.add(`${slot.staff_id!}:${oldDay}:${oldPi}`);
          }
        } else {
          // Teacher swap: two slots same subject, swap teachers if both free at other's slot
          const i1 = lessonIdxs[Math.floor(rng() * lessonIdxs.length)];
          const i2 = lessonIdxs[Math.floor(rng() * lessonIdxs.length)];
          if (i1 === i2) { T *= alpha; continue; }
          const s1 = schedule[i1]; const s2 = schedule[i2];
          if (s1.subject_id !== s2.subject_id || !s1.staff_id || !s2.staff_id) { T *= alpha; continue; }
          if (s1.staff_id === s2.staff_id) { T *= alpha; continue; }
          // Check mutual availability
          if (teacherDayPeriod.has(`${s2.staff_id}:${s1.day_of_week}:${s1.period_index}`) ||
              teacherDayPeriod.has(`${s1.staff_id}:${s2.day_of_week}:${s2.period_index}`)) {
            T *= alpha; continue;
          }
          // Swap
          teacherDayPeriod.delete(`${s1.staff_id}:${s1.day_of_week}:${s1.period_index}`);
          teacherDayPeriod.delete(`${s2.staff_id}:${s2.day_of_week}:${s2.period_index}`);
          schedule[i1] = { ...s1, staff_id: s2.staff_id };
          schedule[i2] = { ...s2, staff_id: s1.staff_id };
          teacherDayPeriod.add(`${s2.staff_id}:${s1.day_of_week}:${s1.period_index}`);
          teacherDayPeriod.add(`${s1.staff_id}:${s2.day_of_week}:${s2.period_index}`);

          const newCost = computeCost(schedule);
          const delta = newCost - currentCost;
          if (delta < 0 || Math.exp(-delta / T) > rng()) {
            currentCost = newCost;
          } else {
            // Revert
            teacherDayPeriod.delete(`${s2.staff_id}:${s1.day_of_week}:${s1.period_index}`);
            teacherDayPeriod.delete(`${s1.staff_id}:${s2.day_of_week}:${s2.period_index}`);
            schedule[i1] = s1; schedule[i2] = s2;
            teacherDayPeriod.add(`${s1.staff_id}:${s1.day_of_week}:${s1.period_index}`);
            teacherDayPeriod.add(`${s2.staff_id}:${s2.day_of_week}:${s2.period_index}`);
          }
        }
        T *= alpha;
      }
    }

    const runtimeMs = Date.now() - startMs;

    // ── Write slots ───────────────────────────────────────────

    // Write only newly placed slots (_existing=true = already in DB, skip re-insert).
    const newSlots = schedule.filter((s) => !s._existing);
    if (newSlots.length > 0) {
      const period_id_map: Record<number, string> = {};
      for (const p of periods as any[]) period_id_map[p.period_index] = p.id;

      const slotRows = newSlots.map(({ _existing: _x, ...s }) => ({
        school_id, timetable_id,
        stream_id:    s.stream_id,
        day_of_week:  s.day_of_week,
        period_index: s.period_index,
        period_id:    period_id_map[s.period_index] ?? null,
        subject_id:   s.subject_id,
        staff_id:     s.staff_id,
        room_id:      s.room_id,
        slot_type:    s.slot_type,
        is_double:    s.is_double ?? false,  // R3.1
        is_locked:    s.is_locked,
        updated_at:   new Date().toISOString(),
      }));

      const PAGE = 500;
      for (let i = 0; i < slotRows.length; i += PAGE) {
        const { error: insertErr } = await admin.from('timetable_slots').insert(slotRows.slice(i, i + PAGE));
        if (insertErr) throw insertErr;
      }

      // R3.1: Link pair_slot_id for is_double pairs
      if (newSlots.some((s) => s.is_double)) {
        const { data: doubleSlots } = await admin
          .from('timetable_slots')
          .select('id, stream_id, subject_id, day_of_week, period_index, staff_id')
          .eq('timetable_id', timetable_id)
          .eq('is_double', true);

        if (doubleSlots && doubleSlots.length > 0) {
          // Group by (stream, subject, day, teacher)
          const groups: Record<string, Array<{ id: string; period_index: number }>> = {};
          for (const s of doubleSlots as any[]) {
            const k = `${s.stream_id}:${s.subject_id}:${s.day_of_week}:${s.staff_id}`;
            if (!groups[k]) groups[k] = [];
            groups[k].push({ id: s.id, period_index: s.period_index });
          }

          const pairUpdates: Array<{ id: string; pair_slot_id: string }> = [];
          for (const groupSlots of Object.values(groups)) {
            groupSlots.sort((a, b) => a.period_index - b.period_index);
            for (let gi = 0; gi + 1 < groupSlots.length; gi += 2) {
              const a = groupSlots[gi];
              const b = groupSlots[gi + 1];
              const tpi1 = sortedPeriodIdxArr.indexOf(a.period_index);
              const tpi2 = sortedPeriodIdxArr.indexOf(b.period_index);
              if (tpi2 - tpi1 === 1) {
                pairUpdates.push({ id: a.id, pair_slot_id: b.id });
                pairUpdates.push({ id: b.id, pair_slot_id: a.id });
              }
            }
          }

          await Promise.all(
            pairUpdates.map((upd) =>
              admin.from('timetable_slots').update({ pair_slot_id: upd.pair_slot_id }).eq('id', upd.id),
            ),
          );
        }
      }
    }

    // ── Chunked: save checkpoint and return ───────────────────

    const processedCount  = processedStreamIds.size;
    const totalStreams     = allStreams.length;

    if (chunked) {
      const newCheckpoint: Checkpoint = {
        processed_stream_ids: [...processedStreamIds],
        subject_counts:       streamSubjectCount,
        total_streams:        totalStreams,
        seed,
      };
      await admin.from('timetable_generation_runs').update({
        status:           'queued',
        runtime_ms:       runtimeMs,
        conflicts_found:  conflicts,
        input_snapshot:   { checkpoint: newCheckpoint, total_streams: totalStreams },
      }).eq('id', run_id);

      return json({
        timetable_id, run_id,
        status: 'chunked',
        slots_written: newSlots.length,
        conflicts,
        runtime_ms: runtimeMs,
        progress: { processed: processedCount, total: totalStreams },
      });
    }

    // ── Final: detect conflicts ───────────────────────────────

    const conflictRows: any[] = [];
    const { data: writtenSlots } = await admin
      .from('timetable_slots')
      .select('id, staff_id, room_id, day_of_week, period_index, stream_id')
      .eq('timetable_id', timetable_id)
      .not('staff_id', 'is', null);

    const teacherSlotMap: Record<string, string[]> = {};
    for (const slot of writtenSlots ?? []) {
      const k = `${slot.staff_id}:${slot.day_of_week}:${slot.period_index}`;
      if (!teacherSlotMap[k]) teacherSlotMap[k] = [];
      teacherSlotMap[k].push(slot.id);
    }
    for (const ids of Object.values(teacherSlotMap)) {
      if (ids.length > 1) {
        conflictRows.push({
          timetable_id, slot_id: ids[0], conflicting_slot_id: ids[1],
          severity: 'error', kind: 'teacher_clash',
          description: `Teacher double-booked (${ids.length} slots at same time)`,
        });
        conflicts++;
      }
    }

    for (const stream of allStreams as any[]) {
      const streamReqs = reqsByStream[stream.id] ?? reqsByGrade[stream.grade_id] ?? {};
      for (const [subjId, needed] of Object.entries(streamReqs)) {
        const placed = streamSubjectCount[stream.id]?.[subjId] ?? 0;
        if (placed < (needed as number)) {
          conflictRows.push({
            timetable_id, slot_id: null,
            severity: 'warning', kind: 'period_count_short',
            description: `${stream.name}: ${subjId} needs ${needed} periods, only ${placed} placed`,
          });
        }
      }
    }

    if (conflictRows.length > 0) {
      const cPage = 200;
      for (let i = 0; i < conflictRows.length; i += cPage) {
        await admin.from('timetable_conflicts').insert(conflictRows.slice(i, i + cPage));
      }
    }

    const timedOut    = Date.now() > hardDeadline;
    const finalStatus = timedOut ? 'timeout' : conflicts > 0 ? 'partial' : 'succeeded';

    await admin.from('timetable_generation_runs').update({
      status:           finalStatus,
      ended_at:         new Date().toISOString(),
      runtime_ms:       runtimeMs,
      conflicts_found:  conflicts,
      cost_score:       conflicts === 0 ? 100 : Math.max(0, 100 - conflicts * 5),
      input_snapshot:   { total_streams: totalStreams },
    }).eq('id', run_id);

    await admin.from('timetables').update({
      status:            finalStatus === 'succeeded' ? 'generated' : 'draft',
      generated_at:      new Date().toISOString(),
      generator_version: '3.0.0-csp-mrv-r3',
      generation_run_id: run_id,
    }).eq('id', timetable_id);

    return json({
      timetable_id, run_id,
      status:        finalStatus,
      slots_written: newSlots.length,
      conflicts,
      cost_score:    conflicts === 0 ? 100 : Math.max(0, 100 - conflicts * 5),
      runtime_ms:    runtimeMs,
      progress:      { processed: totalStreams, total: totalStreams },
    });

  } catch (err: any) {
    console.error('generate-timetable error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────

async function failRun(admin: any, run_id: string, timetable_id: string, msg: string) {
  await admin.from('timetable_generation_runs').update({
    status: 'failed', ended_at: new Date().toISOString(), error_message: msg,
  }).eq('id', run_id);
  await admin.from('timetables').update({ status: 'draft' }).eq('id', timetable_id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
