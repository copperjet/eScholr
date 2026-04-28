export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'ap' | 'sick';
export type UserRole =
  | 'super_admin' | 'school_super_admin' | 'admin' | 'front_desk' | 'finance' | 'hr'
  | 'principal' | 'coordinator' | 'hod' | 'hrt' | 'st' | 'parent' | 'student';
export type ReportStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'finance_pending' | 'under_review' | 'released';
export type SubscriptionPlan = 'starter' | 'growth' | 'scale' | 'enterprise';

export interface School {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  country: string | null;
  timezone: string | null;
  currency: string | null;
  subscription_plan: SubscriptionPlan;
  subscription_status: string;
  created_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  student_number: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  section_id: string | null;
  grade_id: string | null;
  stream_id: string | null;
  enrollment_date: string | null;
  status: string;
  auth_user_id: string | null;
  email: string | null;
  created_at: string;
}

export interface Staff {
  id: string;
  school_id: string;
  auth_user_id: string | null;
  full_name: string;
  staff_number: string;
  email: string;
  department: string | null;
  photo_url: string | null;
  status: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  school_id: string;
  student_id: string;
  stream_id: string;
  semester_id: string;
  date: string;
  status: AttendanceStatus;
  submitted_by: string;
  submitted_at: string;
  register_locked: boolean;
  corrected_by: string | null;
  correction_note: string | null;
  corrected_at: string | null;
}

export interface Mark {
  id: string;
  school_id: string;
  student_id: string;
  subject_id: string;
  stream_id: string;
  semester_id: string;
  assessment_type: 'fa1' | 'fa2' | 'summative' | 'biweekly';
  value: number | null;
  raw_total: number | null;
  is_excused: boolean;
  excused_reason: string | null;
  is_locked: boolean;
  entered_by: string | null;
  updated_at: string;
}

export interface Report {
  id: string;
  school_id: string;
  student_id: string;
  semester_id: string;
  status: ReportStatus;
  hrt_comment: string | null;
  overall_percentage: number | null;
  class_position: number | null;
  pdf_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  released_at: string | null;
  finance_cleared_by: string | null;
  finance_cleared_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DayBookEntry {
  id: string;
  school_id: string;
  student_id: string;
  date: string;
  category: string;
  description: string;
  created_by: string;
  send_to_parent: boolean;
  edit_window_closes_at: string;
  created_at: string;
}

// ── Supplementary interfaces ──────────────────────────────────

export interface PushToken {
  id: string;
  school_id: string;
  user_id: string;
  device_id: string;
  push_token: string;
  platform: 'ios' | 'android' | 'web' | null;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  school_id: string;
  recipient_user_id: string;
  trigger_event: string;
  channel: 'push' | 'in_app';
  title: string;
  body: string;
  deep_link_url: string | null;
  delivery_status: 'delivered' | 'failed' | 'no_device_registered';
  is_safeguarding: boolean;
  is_read: boolean;
  related_student_id: string | null;
  created_at: string;
  expires_at: string;
}

export interface CharacterRecord {
  id: string;
  school_id: string;
  student_id: string;
  semester_id: string;
  creativity: string | null;
  respect: string | null;
  excellence: string | null;
  empathy: string | null;
  discipline: string | null;
  extra_values: Record<string, string>;
  entered_by: string;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceRecord {
  id: string;
  school_id: string;
  student_id: string;
  semester_id: string;
  status: 'paid' | 'unpaid';
  balance: number;
  updated_by: string | null;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  school_id: string;
  finance_record_id: string;
  amount: number;
  paid_at: string;
  recorded_by: string;
  note: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  school_id: string;
  event_type: string;
  actor_id: string | null;
  student_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Inquiry {
  id: string;
  school_id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  nature_of_inquiry: string | null;
  date: string;
  status: 'new' | 'in_progress' | 'enrolled' | 'closed';
  converted_student_id: string | null;
  created_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      schools:             { Row: School;            Insert: Partial<School>;            Update: Partial<School> };
      students:            { Row: Student;           Insert: Partial<Student>;           Update: Partial<Student> };
      staff:               { Row: Staff;             Insert: Partial<Staff>;             Update: Partial<Staff> };
      attendance_records:  { Row: AttendanceRecord;  Insert: Partial<AttendanceRecord>;  Update: Partial<AttendanceRecord> };
      marks:               { Row: Mark;              Insert: Partial<Mark>;              Update: Partial<Mark> };
      reports:             { Row: Report;            Insert: Partial<Report>;            Update: Partial<Report> };
      day_book_entries:    { Row: DayBookEntry;       Insert: Partial<DayBookEntry>;      Update: Partial<DayBookEntry> };
      push_tokens:         { Row: PushToken;          Insert: Partial<PushToken>;         Update: Partial<PushToken> };
      notification_logs:   { Row: NotificationLog;   Insert: Partial<NotificationLog>;   Update: Partial<NotificationLog> };
      character_records:   { Row: CharacterRecord;   Insert: Partial<CharacterRecord>;   Update: Partial<CharacterRecord> };
      finance_records:     { Row: FinanceRecord;     Insert: Partial<FinanceRecord>;     Update: Partial<FinanceRecord> };
      payment_transactions:{ Row: PaymentTransaction; Insert: Partial<PaymentTransaction>; Update: Partial<PaymentTransaction> };
      audit_logs:          { Row: AuditLog;           Insert: Partial<AuditLog>;          Update: Partial<AuditLog> };
      inquiries:           { Row: Inquiry;            Insert: Partial<Inquiry>;           Update: Partial<Inquiry> };
    };
    Views: {};
    Functions: {
      search_students:        { Args: { p_query: string; p_limit?: number }; Returns: unknown[] };
      search_staff:           { Args: { p_query: string; p_limit?: number }; Returns: unknown[] };
      resolve_school:         { Args: { p_code: string };                    Returns: unknown[] };
      get_marks_completion:   { Args: { p_semester_id: string };             Returns: unknown[] };
      get_attendance_summary: { Args: { p_student_id: string; p_semester_id: string }; Returns: unknown[] };
      calculate_student_total:{ Args: { p_student_id: string; p_semester_id: string; p_subject_id: string }; Returns: unknown[] };
      get_class_average:      { Args: { p_subject_id: string; p_stream_id: string; p_semester_id: string; p_assessment_type: string }; Returns: number };
    };
    Enums: {};
  };
}
