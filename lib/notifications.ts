import { Platform } from 'react-native';
import { supabase } from './supabase';

// ── Push token registration ───────────────────────────────────

export async function registerPushToken(
  token: string,
  deviceId: string,
  schoolId: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await (supabase as any).from('push_tokens').upsert(
    {
      school_id: schoolId,
      user_id: user.id,
      device_id: deviceId,
      push_token: token,
      platform: Platform.OS,
    } as any,
    { onConflict: 'user_id,device_id' },
  );
}

// ── Absence notification trigger ─────────────────────────────

export async function triggerAbsenceNotification(params: {
  school_id: string;
  student_id: string;
  stream_id: string;
  date: string;
  marked_by_name: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-absence-notification', { body: params });
  } catch {
    // Fire-and-forget — don't block UI on notification failure
  }
}

// ── Homework notification triggers ─────────────────────────

export async function triggerHomeworkAssignedNotification(params: {
  school_id: string;
  homework_id: string;
  subject_name: string;
  title: string;
  due_date: string;
  stream_id: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-homework-notification', { 
      body: { ...params, event_type: 'assigned' }
    });
  } catch {
    // Fire-and-forget — don't block UI on notification failure
  }
}

export async function triggerHomeworkGradedNotification(params: {
  school_id: string;
  homework_id: string;
  student_id: string;
  score: number;
  max_score: number;
  title: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-homework-notification', { 
      body: { ...params, event_type: 'graded' }
    });
  } catch {
    // Fire-and-forget — don't block UI on notification failure
  }
}
