import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ── Greedy cover allocator ────────────────────────────────────

async function allocateCover(
  db: ReturnType<typeof createClient>,
  absenceId: string,
  schoolId: string,
  dryRun: boolean,
) {
  // Load absence
  const { data: absence, error: absErr } = await (db as any)
    .from('teacher_absences')
    .select('id, staff_id, start_date, end_date, cover_strategy, reported_by')
    .eq('id', absenceId)
    .eq('school_id', schoolId)
    .single();
  if (absErr || !absence) throw new Error('Absence not found');

  const { staff_id: absentStaffId, start_date, end_date, cover_strategy, reported_by } = absence as any;

  // Load published timetable
  const { data: tt } = await (db as any)
    .from('timetables')
    .select('id')
    .eq('school_id', schoolId)
    .eq('status', 'published')
    .limit(1)
    .single();
  if (!tt) return { proposed: [], unfilled: [], message: 'No published timetable' };

  const timetableId = (tt as any).id;

  // Get all slots for absent teacher
  const { data: absentSlots } = await (db as any)
    .from('timetable_slots')
    .select('id, stream_id, day_of_week, period_index, subject_id, room_id')
    .eq('timetable_id', timetableId)
    .eq('staff_id', absentStaffId)
    .eq('slot_type', 'lesson');

  if (!absentSlots?.length) return { proposed: [], unfilled: [], message: 'No slots for this teacher' };

  // R0.7: Load working_days from school settings (defaults Mon–Fri if not configured)
  const { data: ttSettings } = await (db as any)
    .from('timetable_settings')
    .select('working_days')
    .eq('school_id', schoolId)
    .maybeSingle();
  const workingDaysSet = new Set<number>(ttSettings?.working_days ?? [1, 2, 3, 4, 5]);

  // Build date range → days-of-week mapping using working_days
  const startMs = new Date(start_date).getTime();
  const endMs   = new Date(end_date).getTime();
  const affectedDates: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const d = new Date(ms);
    // ISODOW: Mon=1 … Sun=7
    const dow = d.getDay() || 7;
    if (workingDaysSet.has(dow)) affectedDates.push(d.toISOString().slice(0, 10));
  }

  // Load all active staff in school
  const { data: allStaff } = await (db as any)
    .from('staff')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .neq('id', absentStaffId);

  const staffIds: string[] = (allStaff ?? []).map((s: any) => s.id);

  // Load subject-teacher assignments (who can teach what)
  const { data: staAssignments } = await (db as any)
    .from('subject_teacher_assignments')
    .select('staff_id, subject_id')
    .eq('school_id', schoolId);
  const subjectTeachersMap: Record<string, Set<string>> = {};
  for (const a of (staAssignments ?? [])) {
    if (!subjectTeachersMap[a.subject_id]) subjectTeachersMap[a.subject_id] = new Set();
    subjectTeachersMap[a.subject_id].add(a.staff_id);
  }

  // Load teaching periods (for first/last period detection in R1.7)
  const { data: teachingPeriods } = await (db as any)
    .from('timetable_periods')
    .select('period_index')
    .eq('school_id', schoolId)
    .eq('is_break', false)
    .eq('is_assembly', false)
    .order('period_index');
  const sortedPeriodIdx: number[] = (teachingPeriods ?? []).map((p: any) => p.period_index);
  const firstPeriodIdx = sortedPeriodIdx[0] ?? 0;
  const lastPeriodIdx  = sortedPeriodIdx[sortedPeriodIdx.length - 1] ?? 99;

  // Load all published slots (to detect bookings + stream continuity)
  const { data: allSlots } = await (db as any)
    .from('timetable_slots')
    .select('id, staff_id, day_of_week, period_index, stream_id')
    .eq('timetable_id', timetableId)
    .eq('slot_type', 'lesson');

  // Build: staffId → set of "day:period" booked in base TT
  // Also build: staffId → set of stream_ids (for R1.6 continuity)
  const baseBookings: Record<string, Set<string>> = {};
  const staffStreams: Record<string, Set<string>> = {};
  for (const s of (allSlots ?? [])) {
    if (!s.staff_id) continue;
    if (!baseBookings[s.staff_id]) baseBookings[s.staff_id] = new Set();
    baseBookings[s.staff_id].add(`${s.day_of_week}:${s.period_index}`);
    if (!staffStreams[s.staff_id]) staffStreams[s.staff_id] = new Set();
    staffStreams[s.staff_id].add(s.stream_id);
  }

  // Load teacher constraints (max_periods_per_day, no_first/last)
  const { data: constraints } = await (db as any)
    .from('teacher_constraints')
    .select('staff_id, max_periods_per_day, no_first_period, no_last_period')
    .eq('school_id', schoolId);
  const constraintMap: Record<string, any> = {};
  for (const c of (constraints ?? [])) constraintMap[c.staff_id] = c;

  // Load teacher availability (unavailable + preferred slots)
  const { data: availability } = await (db as any)
    .from('teacher_availability')
    .select('staff_id, day_of_week, period_index, status')
    .eq('school_id', schoolId);
  const unavailable: Set<string> = new Set();
  const preferred:   Set<string> = new Set();
  for (const a of (availability ?? [])) {
    if (a.status === 'unavailable') unavailable.add(`${a.staff_id}:${a.day_of_week}:${a.period_index}`);
    if (a.status === 'preferred')   preferred.add(`${a.staff_id}:${a.day_of_week}:${a.period_index}`);
  }

  const proposed: any[] = [];
  const unfilled: any[] = [];

  for (const date of affectedDates) {
    const dow = (new Date(date).getDay() || 7);

    // Existing overrides on this date (already booked substitutes)
    // R0.4: join timetable_slots to get period_index for each override's base slot.
    const { data: existingOverrides } = await (db as any)
      .from('slot_overrides')
      .select('base_slot_id, override_staff_id, override_date, timetable_slots!base_slot_id(period_index, day_of_week)')
      .eq('school_id', schoolId)
      .eq('override_date', date)
      .eq('status', 'active');
    // overrideBookings: staffId → Set<"dow:periodIndex">
    const overrideBookings: Record<string, Set<string>> = {};
    const alreadyCovered: Set<string> = new Set();
    for (const o of (existingOverrides ?? [])) {
      if (o.override_staff_id && o.timetable_slots) {
        const pi   = (o.timetable_slots as any).period_index;
        const odow = (o.timetable_slots as any).day_of_week;
        if (!overrideBookings[o.override_staff_id]) overrideBookings[o.override_staff_id] = new Set();
        overrideBookings[o.override_staff_id].add(`${odow}:${pi}`);
      }
      alreadyCovered.add(o.base_slot_id);
    }

    // Per-date: track how many covers we've assigned to each teacher
    const coversToday: Record<string, number> = {};

    const daySlots = absentSlots.filter((s: any) => s.day_of_week === dow);

    for (const slot of daySlots) {
      if (alreadyCovered.has(slot.id)) continue;

      if (cover_strategy === 'cancel') {
        proposed.push({
          base_slot_id: slot.id,
          override_date: date,
          override_type: 'cancel',
          source: 'absence_auto',
          linked_absence_id: absenceId,
        });
        continue;
      }

      if (cover_strategy === 'study_hall') {
        proposed.push({
          base_slot_id: slot.id,
          override_date: date,
          override_type: 'substitute',
          override_staff_id: null,
          source: 'absence_auto',
          linked_absence_id: absenceId,
          notes: 'Study hall — HRT to supervise',
        });
        continue;
      }

      // auto_substitute: score candidates (R1.5, R1.6, R1.7)
      const candidates: Array<{ staffId: string; score: number; tier: number }> = [];

      for (const staffId of staffIds) {
        // Free in base TT?
        const baseKey = `${dow}:${slot.period_index}`;
        if (baseBookings[staffId]?.has(baseKey)) continue;

        // Not explicitly unavailable
        if (unavailable.has(`${staffId}:${dow}:${slot.period_index}`)) continue;

        // R0.4: check using matching key format "dow:periodIndex"
        const overrideKey = `${dow}:${slot.period_index}`;
        if (overrideBookings[staffId]?.has(overrideKey)) continue;

        // R1.7: respect no_first_period / no_last_period constraints
        const c = constraintMap[staffId];
        if (c?.no_first_period && slot.period_index === firstPeriodIdx) continue;
        if (c?.no_last_period  && slot.period_index === lastPeriodIdx)  continue;

        // Max periods per day
        const maxPd = c?.max_periods_per_day ?? 8;
        // R0.5: count only today's base slots (keys that start with "dow:")
        const baseLoad = Array.from(baseBookings[staffId] ?? []).filter((k) => k.startsWith(`${dow}:`)).length;
        const coverLoad = coversToday[staffId] ?? 0;
        if (baseLoad + coverLoad >= maxPd) continue;

        let score = 0;
        let tier  = 2; // Tier 2: any free teacher

        // Tier 1: teaches same subject (+100)
        const teachesSameSubject = slot.subject_id && subjectTeachersMap[slot.subject_id]?.has(staffId);
        if (teachesSameSubject) { score += 100; tier = 1; }

        // R1.6: already teaches this stream (+50, continuity)
        if (staffStreams[staffId]?.has(slot.stream_id)) score += 50;

        // R1.6: adjacent period free — no classes immediately before/after (+20)
        const prevFree = !baseBookings[staffId]?.has(`${dow}:${slot.period_index - 1}`);
        const nextFree = !baseBookings[staffId]?.has(`${dow}:${slot.period_index + 1}`);
        if (prevFree && nextFree) score += 20;

        // Load balance penalty
        score -= (coversToday[staffId] ?? 0) * 10;

        // Penalise if preferred slot violated
        if (!preferred.has(`${staffId}:${dow}:${slot.period_index}`)) score -= 5;

        candidates.push({ staffId, score, tier });
      }

      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const winner = candidates[0];
        coversToday[winner.staffId] = (coversToday[winner.staffId] ?? 0) + 1;
        const tierNote = winner.tier === 1
          ? 'same-subject specialist'
          : 'any available teacher (load balanced)';
        proposed.push({
          base_slot_id:       slot.id,
          override_date:      date,
          override_type:      'substitute',
          override_staff_id:  winner.staffId,
          source:             'absence_auto',
          linked_absence_id:  absenceId,
          school_id:          schoolId,
          timetable_id:       timetableId,
          created_by:         reported_by,
          notes:              `Auto-assigned (${tierNote}, score ${winner.score})`,
        });
      } else {
        // Tier 3: study_hall fallback — no substitute available
        proposed.push({
          base_slot_id:      slot.id,
          override_date:     date,
          override_type:     'substitute',
          override_staff_id: null,
          source:            'absence_auto',
          linked_absence_id: absenceId,
          school_id:         schoolId,
          timetable_id:      timetableId,
          created_by:        reported_by,
          notes:             'No substitute available — study hall (HRT to supervise)',
        });
        unfilled.push({ slot_id: slot.id, date, period_index: slot.period_index, stream_id: slot.stream_id });
      }
    }
  }

  if (!dryRun && proposed.length > 0) {
    const rows = proposed.map((p) => ({
      school_id:          p.school_id     ?? schoolId,
      timetable_id:       p.timetable_id  ?? timetableId,
      base_slot_id:       p.base_slot_id,
      override_date:      p.override_date,
      override_type:      p.override_type,
      override_staff_id:  p.override_staff_id ?? null,
      source:             p.source,
      linked_absence_id:  p.linked_absence_id,
      created_by:         p.created_by   ?? null,
      notes:              p.notes        ?? null,
      status:             'active',
    }));

    const { error: insertErr } = await (db as any)
      .from('slot_overrides')
      .upsert(rows, { onConflict: 'base_slot_id,override_date', ignoreDuplicates: true });
    if (insertErr) throw new Error(insertErr.message);

    // Update absence status
    const newStatus = unfilled.length === 0 ? 'covered' : 'partial';
    await (db as any)
      .from('teacher_absences')
      .update({ status: newStatus })
      .eq('id', absenceId);

    // R2.5: Notification fan-out via send-push ─────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const pushUrl     = `${supabaseUrl}/functions/v1/send-push`;

    // Collect unique substitute staff IDs and cancelled stream IDs
    const substituteStaffIds = new Set<string>();
    const cancelledStreamIds = new Set<string>();
    for (const p of proposed) {
      if (p.override_staff_id) substituteStaffIds.add(p.override_staff_id);
      if (p.override_type === 'cancel' && p.stream_id) cancelledStreamIds.add(p.stream_id);
    }

    // Notify each substitute teacher
    for (const staffId of substituteStaffIds) {
      // Resolve user_id from staff table
      const { data: staffRow } = await (db as any)
        .from('staff')
        .select('user_id, full_name')
        .eq('id', staffId)
        .single();
      if (staffRow?.user_id) {
        await fetch(pushUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            type:          'user',
            school_id:     schoolId,
            user_ids:      [staffRow.user_id],
            title:         'Cover assignment',
            body:          'You have been assigned to cover a class. Check your schedule.',
            data:          { absence_id: absenceId },
            trigger_event: 'generic',
          }),
        }).catch(() => {}); // non-fatal
      }
    }

    // Notify stream HRTs of cancelled lessons
    for (const streamId of cancelledStreamIds) {
      await fetch(pushUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          type:          'stream',
          school_id:     schoolId,
          stream_id:     streamId,
          title:         'Class cancelled',
          body:          'A lesson has been cancelled due to teacher absence.',
          data:          { absence_id: absenceId },
          trigger_event: 'generic',
        }),
      }).catch(() => {}); // non-fatal
    }
  }

  return { proposed, unfilled };
}

// ── Handler ───────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  let body: { absence_id: string; school_id: string; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { absence_id, school_id, dry_run = false } = body;
  if (!absence_id || !school_id) return json({ error: 'absence_id and school_id required' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey);

  // Verify caller auth + school
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
  const appMeta     = (user.app_metadata as any) ?? {};
  const jwtSchoolId = appMeta.school_id as string | undefined;
  if (jwtSchoolId && jwtSchoolId !== school_id) return json({ error: 'Forbidden' }, 403);

  // R1.8: require admin-level role
  const userRoles: string[] = appMeta.roles ?? [];
  const ALLOWED_ROLES = ['super_admin','school_super_admin','admin','principal','coordinator','hod'];
  if (!userRoles.some((r) => ALLOWED_ROLES.includes(r))) {
    return json({ error: 'Forbidden — admin role required' }, 403);
  }

  try {
    const result = await allocateCover(db, absence_id, school_id, dry_run);
    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
