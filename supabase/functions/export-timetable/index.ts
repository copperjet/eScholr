import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAY_NAMES: Record<number, string> = {
  1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU',
};

function pad(n: number, len = 2) { return String(n).padStart(len, '0'); }

function icalDate(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`
  );
}

function nextWeekday(dayOfWeek: number): Date {
  const now = new Date();
  const today = now.getUTCDay() || 7; // Sun=7
  const diff = ((dayOfWeek - today) + 7) % 7 || 7;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return d;
}

function parseTime(timeStr: string): [number, number] {
  const [h, m] = timeStr.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

function buildIcal(slots: any[], periodMap: Record<string, any>, subjectMap: Record<string, string>, staffMap: Record<string, string>, streamMap: Record<string, string>, timetableName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//eScholr//Timetable Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${timetableName}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const slot of slots) {
    if (slot.slot_type !== 'lesson' || !slot.subject_id) continue;

    const period = periodMap[slot.period_index as number];
    if (!period) continue;

    const [startH, startM] = parseTime(period.start_time ?? '08:00');
    const [endH, endM]     = parseTime(period.end_time   ?? '08:45');
    const baseDate = nextWeekday(slot.day_of_week as number);
    const dtstart  = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), startH, startM));
    const dtend    = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), endH,   endM));

    const subjectName = subjectMap[slot.subject_id as string] ?? 'Lesson';
    const teacherName = slot.staff_id   ? (staffMap[slot.staff_id   as string] ?? '') : '';
    const streamName  = slot.stream_id  ? (streamMap[slot.stream_id as string] ?? '') : '';
    const description = [
      teacherName ? `Teacher: ${teacherName}` : '',
      streamName  ? `Class: ${streamName}`    : '',
    ].filter(Boolean).join(' · ');

    const byday = DAY_NAMES[slot.day_of_week as number] ?? 'MO';

    lines.push(
      'BEGIN:VEVENT',
      `UID:escholr-slot-${slot.id}@escholr`,
      `DTSTART:${icalDate(dtstart)}`,
      `DTEND:${icalDate(dtend)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      `SUMMARY:${subjectName}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${slot.room_id ?? ''}`,
      `CATEGORIES:Timetable`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  let body: { timetable_id: string; school_id: string; stream_id?: string; staff_id?: string; format?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const { timetable_id, school_id, stream_id, staff_id } = body;
  if (!timetable_id || !school_id) {
    return new Response(JSON.stringify({ error: 'Missing timetable_id or school_id' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey);

  // Verify caller has access to this school via JWT
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
  const jwtSchoolId = (user.app_metadata as any)?.school_id;
  if (jwtSchoolId && jwtSchoolId !== school_id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Fetch timetable metadata
  const { data: tt, error: ttErr } = await db
    .from('timetables')
    .select('id, name, school_id')
    .eq('id', timetable_id)
    .eq('school_id', school_id)
    .single();
  if (ttErr || !tt) {
    return new Response(JSON.stringify({ error: 'Timetable not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Fetch slots
  let slotsQ = db
    .from('timetable_slots')
    .select('id, day_of_week, period_index, subject_id, staff_id, room_id, slot_type, stream_id')
    .eq('timetable_id', timetable_id)
    .eq('school_id', school_id)
    .eq('slot_type', 'lesson');
  if (stream_id) slotsQ = slotsQ.eq('stream_id', stream_id);
  if (staff_id)  slotsQ = slotsQ.eq('staff_id',  staff_id);
  const { data: slots, error: slotsErr } = await slotsQ;
  if (slotsErr) {
    return new Response(JSON.stringify({ error: slotsErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Fetch lookup tables in parallel
  const [periodsRes, subjectsRes, staffRes, streamsRes] = await Promise.all([
    db.from('timetable_periods').select('period_index, start_time, end_time, name').eq('school_id', school_id),
    db.from('subjects').select('id, name').eq('school_id', school_id),
    db.from('staff').select('id, full_name').eq('school_id', school_id),
    db.from('streams').select('id, name').eq('school_id', school_id),
  ]);

  const periodMap:  Record<number, any>   = {};
  const subjectMap: Record<string, string> = {};
  const staffMap:   Record<string, string> = {};
  const streamMap:  Record<string, string> = {};

  for (const p of (periodsRes.data ?? []))  periodMap[p.period_index]  = p;
  for (const s of (subjectsRes.data ?? [])) subjectMap[s.id]           = s.name;
  for (const s of (staffRes.data ?? []))    staffMap[s.id]             = s.full_name;
  for (const s of (streamsRes.data ?? []))  streamMap[s.id]            = s.name;

  const ical = buildIcal(slots ?? [], periodMap, subjectMap, staffMap, streamMap, (tt as any).name);

  return new Response(ical, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="timetable.ics"`,
      ...CORS,
    },
  });
});
