import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const db = supabase as any;

export type AnnouncementAudience = 'school' | 'grade' | 'stream' | 'role';

export interface Announcement {
  id: string;
  school_id: string;
  author_id: string;
  title: string;
  body: string;
  audience_type: AnnouncementAudience;
  audience_grade_id: string | null;
  audience_stream_id: string | null;
  audience_role: string | null;
  attachment_url: string | null;
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  // joined fields from get_announcements RPC
  author_name?: string;
  audience_label?: string;
}

export interface CreateAnnouncementInput {
  school_id: string;
  author_id: string;
  title: string;
  body: string;
  audience_type: AnnouncementAudience;
  audience_grade_id?: string | null;
  audience_stream_id?: string | null;
  audience_role?: string | null;
  attachment_url?: string | null;
  is_pinned?: boolean;
  expires_at?: string | null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useAnnouncements(schoolId: string) {
  return useQuery<Announcement[]>({
    queryKey: ['announcements', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_announcements', {
        p_school_id: schoolId,
        p_limit: 80,
      });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}

/** Feed for non-admin roles — same RPC, filtered client-side by audience later. */
export function useAnnouncementFeed(schoolId: string, role?: string) {
  return useQuery<Announcement[]>({
    queryKey: ['announcement-feed', schoolId, role],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_announcements', {
        p_school_id: schoolId,
        p_limit: 80,
      });
      if (error) throw error;
      const all = (data ?? []) as Announcement[];
      if (!role) return all;
      return all.filter((a) => {
        if (a.audience_type === 'school') return true;
        if (a.audience_type === 'role') return a.audience_role === role;
        return true; // grade/stream — return all, app can further filter by enrollment
      });
    },
  });
}

export function useReadAnnouncements(userId: string) {
  return useQuery<Set<string>>({
    queryKey: ['announcement-reads', userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await db
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', userId);
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: any) => r.announcement_id as string));
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAnnouncementInput) => {
      const { error } = await db.from('announcements').insert({
        school_id: input.school_id,
        author_id: input.author_id,
        title: input.title.trim(),
        body: input.body.trim(),
        audience_type: input.audience_type,
        audience_grade_id: input.audience_grade_id ?? null,
        audience_stream_id: input.audience_stream_id ?? null,
        audience_role: input.audience_role ?? null,
        attachment_url: input.attachment_url ?? null,
        is_pinned: input.is_pinned ?? false,
        expires_at: input.expires_at ?? null,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['announcements', vars.school_id] });
      qc.invalidateQueries({ queryKey: ['announcement-feed', vars.school_id] });
    },
  });
}

export function useDeleteAnnouncement(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('announcements').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements', schoolId] });
      qc.invalidateQueries({ queryKey: ['announcement-feed', schoolId] });
    },
  });
}

export function useMarkAnnouncementRead(userId: string, schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await db.from('announcement_reads').upsert(
        { announcement_id: announcementId, user_id: userId, read_at: new Date().toISOString() },
        { onConflict: 'announcement_id,user_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcement-reads', userId] });
    },
  });
}

// ── Send push via edge function ───────────────────────────────────────────────

export async function sendAnnouncementPush(opts: {
  school_id: string;
  title: string;
  body: string;
  audience_type: AnnouncementAudience;
  audience_grade_id?: string | null;
  audience_stream_id?: string | null;
  audience_role?: string | null;
  deep_link_url?: string;
}) {
  const type =
    opts.audience_type === 'grade'  ? 'grade'  :
    opts.audience_type === 'stream' ? 'stream' :
    opts.audience_type === 'role'   ? 'role'   : 'school';

  await supabase.functions.invoke('send-push', {
    body: {
      type,
      school_id: opts.school_id,
      grade_id: opts.audience_grade_id ?? undefined,
      stream_id: opts.audience_stream_id ?? undefined,
      roles: opts.audience_role ? [opts.audience_role] : undefined,
      title: opts.title,
      body: opts.body,
      trigger_event: 'announcement',
      deep_link_url: opts.deep_link_url ?? '/(app)/announcements',
    },
  }).then(() => {}).catch(() => {});
}
