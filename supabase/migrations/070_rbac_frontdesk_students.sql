-- Add converted_student_id to inquiries (used when inquiry is converted to enrollment)
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS converted_student_id uuid REFERENCES students(id);

-- Add SELECT policy for front_desk on inquiries (they need to read inquiries, not just update them)
CREATE POLICY "frontdesk_select_inquiries" ON inquiries
  FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Add INSERT policy for front_desk on inquiries (they create inquiries)
CREATE POLICY "frontdesk_insert_inquiries" ON inquiries
  FOR INSERT
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Add SELECT policy for front_desk on admissions_applications
CREATE POLICY "frontdesk_select_applications" ON admissions_applications
  FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Extend RLS on students to allow front_desk INSERT/UPDATE
CREATE POLICY "frontdesk_manage_students" ON students
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Extend RLS on parents to allow front_desk INSERT/UPDATE
CREATE POLICY "frontdesk_manage_parents" ON parents
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Extend RLS on student_parent_links to allow front_desk INSERT/UPDATE
CREATE POLICY "frontdesk_manage_links" ON student_parent_links
  FOR ALL
  USING (
    (SELECT school_id FROM students WHERE id = student_id) IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  )
  WITH CHECK (
    (SELECT school_id FROM students WHERE id = student_id) IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Allow front_desk to UPDATE inquiries (assigned_to, status)
CREATE POLICY "frontdesk_manage_inquiries" ON inquiries
  FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );

-- Allow front_desk to UPDATE admissions_applications
CREATE POLICY "frontdesk_manage_applications" ON admissions_applications
  FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role = 'front_desk'
    )
  );
