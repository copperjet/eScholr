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
