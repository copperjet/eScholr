-- Migration 030: Parent-Teacher Messaging
-- Phase 2: Academic Depth

-- Two-way messaging between staff and parents
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('staff', 'parent')),
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('staff', 'parent')),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  parent_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_school ON messages(school_id);
CREATE INDEX idx_messages_sender ON messages(sender_id, sender_type);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, recipient_type);
CREATE INDEX idx_messages_student ON messages(student_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- RLS policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Staff can see messages where they are sender or recipient
CREATE POLICY "Staff can access messages"
  ON messages
  USING (
    (sender_type = 'staff' AND sender_id IN (SELECT id FROM staff WHERE auth_user_id = auth.uid()))
    OR
    (recipient_type = 'staff' AND recipient_id IN (SELECT id FROM staff WHERE auth_user_id = auth.uid()))
    OR
    school_id IN (SELECT school_id FROM staff WHERE auth_user_id = auth.uid())
  );

-- Parents can see messages where they are sender or recipient
CREATE POLICY "Parents can access messages"
  ON messages
  USING (
    (sender_type = 'parent' AND sender_id IN (SELECT id FROM parents WHERE auth_user_id = auth.uid()))
    OR
    (recipient_type = 'parent' AND recipient_id IN (SELECT id FROM parents WHERE auth_user_id = auth.uid()))
  );

-- Staff can insert messages
CREATE POLICY "Staff can send messages"
  ON messages FOR INSERT
  WITH CHECK (sender_type = 'staff' AND sender_id IN (SELECT id FROM staff WHERE auth_user_id = auth.uid()));

-- Parents can insert messages
CREATE POLICY "Parents can send messages"
  ON messages FOR INSERT
  WITH CHECK (sender_type = 'parent' AND sender_id IN (SELECT id FROM parents WHERE auth_user_id = auth.uid()));

-- Update only to mark as read
CREATE POLICY "Recipients can mark as read"
  ON messages FOR UPDATE
  USING (
    (recipient_type = 'staff' AND recipient_id IN (SELECT id FROM staff WHERE auth_user_id = auth.uid()))
    OR
    (recipient_type = 'parent' AND recipient_id IN (SELECT id FROM parents WHERE auth_user_id = auth.uid()))
  );
