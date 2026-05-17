-- ──────────────────────────────────────────────────────────────────────────
-- 042_timetable_owner_index_and_assets_bucket.sql
-- Phase F follow-up:
--   1. Recreate timetable_documents "current" unique index to include
--      owner_type + staff_id (so multiple teacher timetables can coexist
--      and class vs teacher don't collide).
--   2. Widen timetable_documents RLS to include school_super_admin.
--   3. Ensure 'school-assets' storage bucket exists with proper policies
--      (used for school logos uploaded from the client).
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Replace unique "current" index ──────────────────────────────────────
drop index if exists public.idx_timetable_current;

-- For class timetables: one current per (school, grade, stream)
create unique index if not exists idx_timetable_current_class
  on public.timetable_documents (school_id, grade_id, stream_id)
  where is_current = true and owner_type = 'class';

-- For teacher timetables: one current per (school, staff)
create unique index if not exists idx_timetable_current_teacher
  on public.timetable_documents (school_id, staff_id)
  where is_current = true and owner_type = 'teacher';


-- ── 2. Widen timetable RLS to include school_super_admin ───────────────────
drop policy if exists "timetable_insert" on public.timetable_documents;
drop policy if exists "timetable_update" on public.timetable_documents;
drop policy if exists "timetable_delete" on public.timetable_documents;

create policy "timetable_insert" on public.timetable_documents
  for insert to authenticated
  with check (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    and (auth.jwt()->'app_metadata'->'roles') ?| array['admin','coordinator','super_admin','school_super_admin']
  );

create policy "timetable_update" on public.timetable_documents
  for update to authenticated
  using (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    and (auth.jwt()->'app_metadata'->'roles') ?| array['admin','coordinator','super_admin','school_super_admin']
  );

create policy "timetable_delete" on public.timetable_documents
  for delete to authenticated
  using (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    and (auth.jwt()->'app_metadata'->'roles') ?| array['admin','coordinator','super_admin','school_super_admin']
  );


-- ── 3. school-assets storage bucket + policies ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-assets',
  'school-assets',
  true,
  10485760,  -- 10 MB
  array['image/png','image/jpeg','image/jpg','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Public read (logos, transcripts hosted publicly)
drop policy if exists "school_assets_public_read" on storage.objects;
create policy "school_assets_public_read"
  on storage.objects for select to public
  using (bucket_id = 'school-assets');

-- Authenticated members of the school can write under their schoolId/* prefix.
-- Path convention: <schoolId>/<...>
drop policy if exists "school_assets_write_school_members" on storage.objects;
create policy "school_assets_write_school_members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-assets'
    and (
      -- platform super admin can write anywhere
      (auth.jwt()->'app_metadata'->'roles') ? 'super_admin'
      or (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
    )
  );

-- Update / overwrite same path
drop policy if exists "school_assets_update_school_members" on storage.objects;
create policy "school_assets_update_school_members"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'school-assets'
    and (
      (auth.jwt()->'app_metadata'->'roles') ? 'super_admin'
      or (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
    )
  );

-- Delete (super_admin / school_super_admin)
drop policy if exists "school_assets_delete_admins" on storage.objects;
create policy "school_assets_delete_admins"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-assets'
    and (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin']
  );

-- Service role bypass (edge functions)
drop policy if exists "school_assets_service_role_all" on storage.objects;
create policy "school_assets_service_role_all"
  on storage.objects for all to service_role
  using (bucket_id = 'school-assets')
  with check (bucket_id = 'school-assets');
