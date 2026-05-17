/**
 * Messaging hooks - parent-teacher communication
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  school_id: string;
  sender_id: string;
  sender_type: 'staff' | 'parent';
  recipient_id: string;
  recipient_type: 'staff' | 'parent';
  student_id: string | null;
  subject: string | null;
  body: string;
  is_read: boolean;
  read_at: string | null;
  parent_message_id: string | null;
  created_at: string;
  sender?: { full_name: string } | null;
  recipient?: { full_name: string } | null;
  student?: { full_name: string } | null;
}

export interface Conversation {
  otherPartyId: string;
  otherPartyName: string;
  otherPartyType: 'staff' | 'parent';
  studentId: string | null;
  studentName: string | null;
  lastMessage: Message;
  unreadCount: number;
}

// ─── queries ─────────────────────────────────────────────────────────────────

async function resolveNames(
  db: any,
  ids: string[],
  table: 'staff' | 'parents'
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const unique = [...new Set(ids)];
  const { data } = await db.from(table).select('id, full_name').in('id', unique);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id, row.full_name);
  return map;
}

export function useConversations(
  schoolId: string,
  userId: string | null,
  userType: 'staff' | 'parent' | null
) {
  return useQuery<Conversation[]>({
    queryKey: ['conversations', schoolId, userId, userType],
    enabled: !!schoolId && !!userId && !!userType,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;

      const { data: messages, error } = await db
        .from('messages')
        .select(`
          id, school_id, sender_id, sender_type, recipient_id, recipient_type,
          student_id, subject, body, is_read, read_at, parent_message_id, created_at
        `)
        .eq('school_id', schoolId)
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!messages?.length) return [];

      // Collect IDs to resolve names
      const staffIds: string[] = [];
      const parentIds: string[] = [];
      const studentIds: string[] = [];

      for (const m of messages as any[]) {
        if (m.sender_type === 'staff') staffIds.push(m.sender_id);
        else parentIds.push(m.sender_id);
        if (m.recipient_type === 'staff') staffIds.push(m.recipient_id);
        else parentIds.push(m.recipient_id);
        if (m.student_id) studentIds.push(m.student_id);
      }

      const [staffNames, parentNames, studentData] = await Promise.all([
        resolveNames(db, staffIds, 'staff'),
        resolveNames(db, parentIds, 'parents'),
        resolveNames(db, studentIds, 'students' as any),
      ]);

      const getName = (id: string, type: 'staff' | 'parent') =>
        type === 'staff' ? staffNames.get(id) ?? 'Unknown' : parentNames.get(id) ?? 'Unknown';

      // Group by conversation (other party + student)
      const convoMap = new Map<string, Conversation>();

      for (const m of messages as any[]) {
        const isSender = m.sender_id === userId;
        const otherId = isSender ? m.recipient_id : m.sender_id;
        const otherType = isSender ? m.recipient_type : m.sender_type;
        const key = `${otherId}-${m.student_id || 'none'}`;

        if (!convoMap.has(key)) {
          convoMap.set(key, {
            otherPartyId: otherId,
            otherPartyName: getName(otherId, otherType),
            otherPartyType: otherType,
            studentId: m.student_id,
            studentName: m.student_id ? studentData.get(m.student_id) ?? null : null,
            lastMessage: m as Message,
            unreadCount: 0,
          });
        }

        if (!isSender && !m.is_read) {
          const convo = convoMap.get(key)!;
          convo.unreadCount++;
        }
      }

      return Array.from(convoMap.values()).sort(
        (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
      );
    },
  });
}

export function useMessages(
  schoolId: string,
  userId: string | null,
  otherPartyId: string | null,
  studentId: string | null
) {
  return useQuery<Message[]>({
    queryKey: ['messages', schoolId, userId, otherPartyId, studentId],
    enabled: !!schoolId && !!userId && !!otherPartyId,
    staleTime: 1000 * 10,
    queryFn: async () => {
      const db = supabase as any;

      let query = db
        .from('messages')
        .select(`
          id, school_id, sender_id, sender_type, recipient_id, recipient_type,
          student_id, subject, body, is_read, read_at, parent_message_id, created_at
        `)
        .eq('school_id', schoolId)
        .or(
          `and(sender_id.eq.${userId},recipient_id.eq.${otherPartyId}),and(sender_id.eq.${otherPartyId},recipient_id.eq.${userId})`
        );

      if (studentId) {
        query = query.eq('student_id', studentId);
      } else {
        query = query.is('student_id', null);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useSendMessage(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      senderId: string;
      senderType: 'staff' | 'parent';
      recipientId: string;
      recipientType: 'staff' | 'parent';
      studentId?: string | null;
      subject?: string;
      body: string;
      parentMessageId?: string | null;
    }) => {
      const db = supabase as any;
      const { data, error } = await db
        .from('messages')
        .insert({
          school_id: schoolId,
          sender_id: params.senderId,
          sender_type: params.senderType,
          recipient_id: params.recipientId,
          recipient_type: params.recipientType,
          student_id: params.studentId || null,
          subject: params.subject || null,
          body: params.body.trim(),
          parent_message_id: params.parentMessageId || null,
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Message;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['conversations', schoolId] });
      qc.invalidateQueries({
        queryKey: ['messages', schoolId, vars.senderId, vars.recipientId],
      });
    },
  });
}

export function useMarkAsRead(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { messageIds: string[] }) => {
      const db = supabase as any;
      const { error } = await db
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', params.messageIds);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations', schoolId] });
      qc.invalidateQueries({ queryKey: ['messages', schoolId] });
    },
  });
}
