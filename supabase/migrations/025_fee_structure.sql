-- ============================================================
-- 025_fee_structure.sql
-- Fee categories, schedules, invoices
-- ============================================================

-- 1. Fee categories (tuition, transport, uniform, etc.)
CREATE TABLE IF NOT EXISTS fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'Tuition', 'Transport', 'Uniform Fee', 'Lunch', etc.
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- 2. Fee schedules — amount per category per grade per semester
CREATE TABLE IF NOT EXISTS fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_category_id UUID NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
  grade_id UUID REFERENCES grades(id), -- null = applies to all grades
  stream_id UUID REFERENCES streams(id), -- null = applies to all streams
  semester_id UUID NOT NULL REFERENCES semesters(id),
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fee_category_id, grade_id, stream_id, semester_id)
);

-- 3. Invoices — generated per student per semester
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES semesters(id),
  invoice_number TEXT NOT NULL, -- e.g., INV-2025-001
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance DECIMAL(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  notes TEXT,
  pdf_url TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, invoice_number)
);

-- 4. Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  fee_category_id UUID NOT NULL REFERENCES fee_categories(id),
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RLS policies
ALTER TABLE fee_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS si_fee_categories ON fee_categories;
CREATE POLICY si_fee_categories ON fee_categories FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

DROP POLICY IF EXISTS si_fee_schedules ON fee_schedules;
CREATE POLICY si_fee_schedules ON fee_schedules FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

DROP POLICY IF EXISTS si_invoices ON invoices;
CREATE POLICY si_invoices ON invoices FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Students can see own invoices (via parent_finance_visible config checked in app)
DROP POLICY IF EXISTS invoices_student_own ON invoices;
CREATE POLICY invoices_student_own ON invoices FOR SELECT TO authenticated
  USING (student_id IN (
    SELECT id FROM students WHERE auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS si_invoice_items ON invoice_items;
CREATE POLICY si_invoice_items ON invoice_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id
    AND invoices.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
  ));

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_fee_cat_school ON fee_categories(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_sched_school ON fee_schedules(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_sched_semester ON fee_schedules(semester_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_semester ON invoices(semester_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 7. Invoice number generator trigger
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  next_num INTEGER;
BEGIN
  year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '.*?-(\d+)$') AS INTEGER)), 0) + 1
  INTO next_num
  FROM invoices
  WHERE school_id = NEW.school_id
  AND invoice_number LIKE 'INV-' || year_prefix || '-%';
  
  NEW.invoice_number := 'INV-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_number ON invoices;
CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW WHEN (NEW.invoice_number IS NULL)
  EXECUTE FUNCTION generate_invoice_number();

-- 8. Update finance_records to link to invoices (optional enhancement)
-- Add invoice_id to payment_transactions for receipt generation
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payment_transactions(invoice_id);
