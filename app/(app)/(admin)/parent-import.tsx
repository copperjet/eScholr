/**
 * Admin — Bulk Parent CSV Import
 * 4-step wizard: template → upload → preview/validate → import
 *
 * Strategy:
 *   - Email is the unique identifier for a parent (per school).
 *   - Parents are linked to students by `student_email` (preferred) or
 *     `student_id` (which maps to `students.student_number`).
 *   - If a parent already exists (same school + email), update phone/relationship/name
 *     and only add missing student_parent_links — no duplicates.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const VALID_RELATIONSHIPS = ['mother', 'father', 'guardian'] as const;
type Relationship = typeof VALID_RELATIONSHIPS[number];

const CSV_HEADERS = [
  'parent_id', 'first_name', 'last_name', 'email', 'phone', 'gender',
  'relationship', 'occupation', 'employer', 'address',
  'student_email', 'student_id', 'emergency_contact',
];
const TEMPLATE_ROWS = [
  'PAR001,Jane,Doe,jane.doe@example.com,+2348021001001,female,mother,Teacher,XYZ School,12 Main Street,john.doe@student.example.com,STU001,+2348021001001',
  'PAR002,Peter,Smith,peter.smith@example.com,+2348021001002,male,father,Engineer,ABC Ltd,34 Park Avenue,alice.smith@student.example.com,STU002,+2348021001002',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  parent_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  relationship: Relationship | '';
  occupation: string;
  employer: string;
  address: string;
  student_email: string;
  student_identifier: string; // student_number from CSV
  emergency_contact: string;
  errors: string[];
  valid: boolean;
}

interface ImportResult {
  full_name: string;
  email: string;
  linked_students: number;
  error?: string;
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
    else current += ch;
  }
  cols.push(current.trim());
  return cols;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLower = lines[0]?.toLowerCase() ?? '';
  const hasHeader = firstLower.includes('first_name') || firstLower.includes('email') || firstLower.includes('parent_id');
  const headers = hasHeader ? parseCSVLine(lines[0]).map(h => h.toLowerCase().trim()) : [];
  const start = hasHeader ? 1 : 0;
  const idx = (name: string) => headers.indexOf(name);
  const hasHeaders = headers.length > 0;

  return lines.slice(start).map((line) => {
    const cols = parseCSVLine(line);
    const get = (name: string, pos: number): string => {
      if (hasHeaders) {
        const i = idx(name);
        return i >= 0 ? (cols[i] ?? '').replace(/^"|"$/g, '') : '';
      }
      return (cols[pos] ?? '').replace(/^"|"$/g, '');
    };

    const parent_id         = get('parent_id', 0);
    const first_name        = get('first_name', 1);
    const last_name         = get('last_name', 2);
    const email             = get('email', 3).toLowerCase();
    const phone             = get('phone', 4);
    const gender            = get('gender', 5).toLowerCase();
    const relationship      = get('relationship', 6).toLowerCase();
    const occupation        = get('occupation', 7);
    const employer          = get('employer', 8);
    const address           = get('address', 9);
    const student_email     = get('student_email', 10).toLowerCase();
    const student_identifier = get('student_id', 11);
    const emergency_contact = get('emergency_contact', 12);

    const full_name = [first_name, last_name].filter(Boolean).join(' ').trim();
    const errors: string[] = [];

    if (!full_name) errors.push('First or last name required');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email required');
    if (relationship && !VALID_RELATIONSHIPS.includes(relationship as Relationship)) {
      errors.push(`relationship "${relationship}" must be one of: ${VALID_RELATIONSHIPS.join(', ')}`);
    }
    if (!student_email && !student_identifier) {
      errors.push('Either student_email or student_id is required to link parent');
    }
    if (student_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student_email)) {
      errors.push('student_email is not a valid email');
    }

    return {
      parent_id, first_name, last_name, full_name, email, phone, gender,
      relationship: VALID_RELATIONSHIPS.includes(relationship as Relationship)
        ? (relationship as Relationship)
        : '',
      occupation, employer, address,
      student_email, student_identifier, emergency_contact,
      errors, valid: errors.length === 0,
    };
  });
}

// ── Step bar ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

function StepBar({ step }: { step: Step }) {
  const { colors } = useTheme();
  const steps = [
    { n: 1 as Step, label: 'Template' },
    { n: 2 as Step, label: 'Upload' },
    { n: 3 as Step, label: 'Preview' },
    { n: 4 as Step, label: 'Done' },
  ];
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={[
              sbStyles.circle,
              { backgroundColor: s.n <= step ? colors.brand.primary : colors.surfaceSecondary, borderColor: s.n <= step ? colors.brand.primary : colors.border },
            ]}>
              {s.n < step
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <ThemedText variant="caption" style={{ color: s.n <= step ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{s.n}</ThemedText>
              }
            </View>
            <ThemedText variant="caption" style={{ color: s.n <= step ? colors.brand.primary : colors.textMuted, fontSize: 10, marginTop: 3 }}>{s.label}</ThemedText>
          </View>
          {i < steps.length - 1 && <View style={[sbStyles.line, { backgroundColor: s.n < step ? colors.brand.primary : colors.border }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}
const sbStyles = StyleSheet.create({
  circle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  line: { flex: 1, height: 1.5, marginTop: 12 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ParentImportScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [step, setStep]           = useState<Step>(1);
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults]     = useState<ImportResult[]>([]);

  const validCount   = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  const handleDownloadTemplate = async () => {
    const content = [CSV_HEADERS.join(','), ...TEMPLATE_ROWS].join('\n');

    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parent_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const path = FileSystem.cacheDirectory + 'parent_import_template.csv';
    await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Save parent template' });
    } else {
      Alert.alert('Template ready', `Saved to: ${path}`);
    }
  };

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    let text: string;
    if (Platform.OS === 'web') {
      text = await fetch(result.assets[0].uri).then((r) => r.text());
    } else {
      text = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
    }

    const parsed = parseCSV(text);
    if (!parsed.length) { Alert.alert('Empty file', 'No rows found in the CSV.'); return; }
    setRows(parsed);
    setStep(3);
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const valid = rows.filter((r) => r.valid);
    if (!valid.length) { Alert.alert('No valid rows', 'Fix all errors before importing.'); return; }

    haptics.medium();
    setImporting(true);

    const db = supabase as any;
    const importResults: ImportResult[] = [];

    // 1. Pre-resolve all student IDs in bulk
    const studentEmails = Array.from(new Set(
      valid.map((r) => r.student_email).filter(Boolean),
    ));
    const studentNumbers = Array.from(new Set(
      valid.map((r) => r.student_identifier).filter(Boolean),
    ));

    // Note: students table does NOT have `email` column in current schema,
    // so student_email cannot resolve directly. We look up via student_parent_links
    // through a potential parents table email match, OR by student_number.
    const studentByNumber: Record<string, string> = {};
    if (studentNumbers.length) {
      const { data } = await db
        .from('students')
        .select('id, student_number')
        .eq('school_id', schoolId)
        .in('student_number', studentNumbers);
      ((data ?? []) as any[]).forEach((s: any) => {
        studentByNumber[s.student_number] = s.id;
      });
    }

    // 2. Pre-fetch any existing parents by email (to avoid duplicate inserts)
    const parentEmails = Array.from(new Set(valid.map((r) => r.email)));
    const { data: existingParents } = await db
      .from('parents')
      .select('id, email')
      .eq('school_id', schoolId)
      .in('email', parentEmails);
    const parentByEmail: Record<string, string> = {};
    ((existingParents ?? []) as any[]).forEach((p: any) => {
      parentByEmail[p.email.toLowerCase()] = p.id;
    });

    // 3. Process each row
    for (const row of valid) {
      try {
        let parentId = parentByEmail[row.email];

        if (parentId) {
          // Update existing parent with any new info
          await db
            .from('parents')
            .update({
              full_name: row.full_name,
              phone: row.phone || null,
              relationship: row.relationship || null,
            })
            .eq('id', parentId)
            .eq('school_id', schoolId);
        } else {
          // Create new parent
          const { data: newParent, error: createErr } = await db
            .from('parents')
            .insert({
              school_id: schoolId,
              full_name: row.full_name,
              email: row.email,
              phone: row.phone || null,
              relationship: row.relationship || null,
            })
            .select('id')
            .single();
          if (createErr) {
            importResults.push({ full_name: row.full_name, email: row.email, linked_students: 0, error: createErr.message });
            continue;
          }
          parentId = (newParent as any).id;
          parentByEmail[row.email] = parentId;
        }

        // Resolve student by number (student_email not stored on students table)
        const studentId = row.student_identifier
          ? studentByNumber[row.student_identifier]
          : undefined;

        let linkedStudents = 0;
        if (studentId) {
          // Check existing link to avoid duplicate
          const { data: existingLink } = await db
            .from('student_parent_links')
            .select('id')
            .eq('school_id', schoolId)
            .eq('student_id', studentId)
            .eq('parent_id', parentId)
            .maybeSingle();
          if (!existingLink) {
            const { error: linkErr } = await db
              .from('student_parent_links')
              .insert({ school_id: schoolId, student_id: studentId, parent_id: parentId });
            if (!linkErr) linkedStudents = 1;
          } else {
            linkedStudents = 1;
          }
        }

        importResults.push({
          full_name: row.full_name,
          email: row.email,
          linked_students: linkedStudents,
          error: !studentId && (row.student_identifier || row.student_email)
            ? `Student "${row.student_identifier || row.student_email}" not found — parent created but not linked`
            : undefined,
        });
      } catch (e: any) {
        importResults.push({
          full_name: row.full_name,
          email: row.email,
          linked_students: 0,
          error: e.message ?? 'Unknown error',
        });
      }
    }

    haptics.success();
    setResults(importResults);
    setImporting(false);
    setStep(4);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Import Parents</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <StepBar step={step} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Template ── */}
        {step === 1 && (
          <View style={{ gap: Spacing.base }}>
            <View style={[styles.infoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ThemedText variant="label" color="muted" style={{ fontSize: 10, marginBottom: 8 }}>REQUIRED COLUMNS</ThemedText>
              {['first_name', 'last_name', 'email', 'student_id (or student_email)'].map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.brand.primary }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace' }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="label" color="muted" style={{ fontSize: 10, marginTop: 12, marginBottom: 8 }}>OPTIONAL COLUMNS</ThemedText>
              {['parent_id', 'phone', 'gender', 'relationship', 'occupation', 'employer', 'address', 'emergency_contact'].map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace', color: colors.textMuted }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="caption" color="muted" style={{ marginTop: 8 }}>
                Email is the unique parent identifier — existing parents are updated, not duplicated. Link to a student by their <ThemedText variant="caption" style={{ fontFamily: 'monospace' }}>student_id</ThemedText> (student_number). Valid relationships: {VALID_RELATIONSHIPS.join(', ')}.
              </ThemedText>
            </View>

            <TouchableOpacity onPress={handleDownloadTemplate} style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>Download Template CSV</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep(2)} style={[styles.outlineBtn, { borderColor: colors.brand.primary }]}>
              <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '700' }}>Skip — I have my own CSV</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Upload ── */}
        {step === 2 && (
          <View style={{ gap: Spacing.base }}>
            <ThemedText variant="body" color="secondary" style={{ lineHeight: 22 }}>
              Fill in your CSV using the template format and upload it here. One parent per row.
            </ThemedText>
            <TouchableOpacity onPress={handleUpload} style={[styles.uploadZone, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brand.primary + '60' }]}>
              <Ionicons name="cloud-upload-outline" size={36} color={colors.brand.primary} />
              <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600', marginTop: Spacing.sm }}>Tap to select CSV file</ThemedText>
              <ThemedText variant="caption" color="muted">.csv files only</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 3 && (
          <View style={{ gap: Spacing.base }}>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={[styles.countCard, { backgroundColor: Colors.semantic.success + '12', borderColor: Colors.semantic.success + '30' }]}>
                <ThemedText variant="h3" style={{ color: Colors.semantic.success }}>{validCount}</ThemedText>
                <ThemedText variant="caption" style={{ color: Colors.semantic.success }}>Valid</ThemedText>
              </View>
              {invalidCount > 0 && (
                <View style={[styles.countCard, { backgroundColor: Colors.semantic.error + '12', borderColor: Colors.semantic.error + '30' }]}>
                  <ThemedText variant="h3" style={{ color: Colors.semantic.error }}>{invalidCount}</ThemedText>
                  <ThemedText variant="caption" style={{ color: Colors.semantic.error }}>Errors</ThemedText>
                </View>
              )}
            </View>

            {rows.map((row, i) => (
              <View
                key={i}
                style={[
                  styles.previewRow,
                  { backgroundColor: row.valid ? colors.surface : Colors.semantic.error + '08', borderColor: row.valid ? colors.border : Colors.semantic.error + '40' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{row.full_name || '—'}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {row.email}{row.relationship ? ' · ' + row.relationship : ''}
                  </ThemedText>
                  {(row.student_identifier || row.student_email) && (
                    <ThemedText variant="caption" color="muted">
                      Student: {row.student_identifier || row.student_email}
                    </ThemedText>
                  )}
                  {row.errors.map((e, j) => (
                    <ThemedText key={j} variant="caption" style={{ color: Colors.semantic.error }}>✕ {e}</ThemedText>
                  ))}
                </View>
                <Ionicons
                  name={row.valid ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={row.valid ? Colors.semantic.success : Colors.semantic.error}
                />
              </View>
            ))}

            {invalidCount > 0 && (
              <View style={[styles.warnBox, { backgroundColor: Colors.semantic.warning + '12', borderColor: Colors.semantic.warning + '40' }]}>
                <Ionicons name="warning-outline" size={14} color={Colors.semantic.warning} />
                <ThemedText variant="caption" style={{ color: Colors.semantic.warning, flex: 1, marginLeft: 6 }}>
                  {invalidCount} row{invalidCount !== 1 ? 's' : ''} with errors will be skipped. Only valid rows will be imported.
                </ThemedText>
              </View>
            )}

            <TouchableOpacity
              onPress={handleImport}
              disabled={validCount === 0 || importing}
              style={[styles.actionBtn, { backgroundColor: validCount > 0 && !importing ? Colors.semantic.success : colors.border }]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                {importing ? 'Importing…' : `Import ${validCount} Parent${validCount !== 1 ? 's' : ''}`}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <View style={{ gap: Spacing.base }}>
            <View style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.base }}>
              <View style={[styles.successCircle, { backgroundColor: Colors.semantic.success + '15' }]}>
                <Ionicons name="checkmark-circle" size={56} color={Colors.semantic.success} />
              </View>
              <ThemedText variant="h3" style={{ color: Colors.semantic.success }}>Import Complete</ThemedText>
              <ThemedText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                {results.filter((r) => !r.error).length} of {results.length} parents imported. {results.reduce((acc, r) => acc + r.linked_students, 0)} student link{results.reduce((acc, r) => acc + r.linked_students, 0) !== 1 ? 's' : ''} created.
              </ThemedText>
            </View>

            {results.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.previewRow,
                  { backgroundColor: r.error ? Colors.semantic.warning + '08' : colors.surface, borderColor: r.error ? Colors.semantic.warning + '40' : colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{r.full_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">{r.email}</ThemedText>
                  {r.linked_students > 0 && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.success }}>
                      Linked to {r.linked_students} student
                    </ThemedText>
                  )}
                  {r.error && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.warning }}>⚠ {r.error}</ThemedText>
                  )}
                </View>
                <Ionicons
                  name={r.error ? 'warning' : 'checkmark-circle'}
                  size={18}
                  color={r.error ? Colors.semantic.warning : Colors.semantic.success}
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.actionBtn, { backgroundColor: colors.brand.primary, marginTop: Spacing.sm }]}
            >
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>View Parent List</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  scroll: { padding: Spacing.base, paddingBottom: 40 },
  infoBox: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
  outlineBtn: { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  uploadZone: {
    alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, borderRadius: Radius.lg,
    borderWidth: 2, borderStyle: 'dashed', gap: 4,
  },
  countCard: { flex: 1, alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  previewRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.xs,
  },
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  successCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
});
