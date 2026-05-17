-- ──────────────────────────────────────────────────────────────────────────
-- Phase F migrations:
--   1. calendar_events    — holidays, breaks, school events alongside semesters
--   2. timetable_documents — split class vs teacher timetables
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. calendar_events ─────────────────────────────────────────────────────
create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  type         text not null check (type in ('holiday', 'break', 'event', 'exam')),
  title        text not null,
  description  text,
  start_date   date not null,
  end_date     date,
  color        text,           -- optional override
  all_day      boolean not null default true,
  created_at   timestamptz default now(),
  created_by   uuid references public.staff(id) on delete set null
);

create index if not exists calendar_events_school_idx        on public.calendar_events(school_id);
create index if not exists calendar_events_school_start_idx  on public.calendar_events(school_id, start_date);

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events tenant read"    on public.calendar_events;
drop policy if exists "calendar_events admin write"    on public.calendar_events;

create policy "calendar_events tenant read"
  on public.calendar_events for select to authenticated
  using (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
  );

create policy "calendar_events admin write"
  on public.calendar_events for all to authenticated
  using (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    and (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
  )
  with check (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    and (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
  );


-- ── 2. timetable_documents — owner split (class vs teacher) ────────────────
alter table public.timetable_documents
  add column if not exists owner_type text not null default 'class'
    check (owner_type in ('class', 'teacher'));

alter table public.timetable_documents
  add column if not exists staff_id uuid references public.staff(id) on delete cascade;

create index if not exists timetable_docs_owner_idx
  on public.timetable_documents(school_id, owner_type, staff_id);

-- For class timetables: stream_id or grade_id must be present
-- For teacher timetables: staff_id must be present
-- Enforced in app layer; DB allows either.
