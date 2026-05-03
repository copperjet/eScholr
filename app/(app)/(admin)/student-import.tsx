/**
 * Admin — Bulk Student CSV Import
 * 4-step wizard: template → upload → preview/validate → import
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
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Skeleton } from '../../../components/ui';
import { useBulkImportStudents } from '../../../hooks/useStudents';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// Required: first_name, last_name, class. Others are optional.
// Class can be "Form 1A" (full stream) or class+arm ("JSS1" + "A" => "JSS1 A").
const CSV_HEADERS = [
  'student_id', 'first_name', 'last_name', 'email', 'date_of_birth', 'gender',
  'class', 'arm', 'admission_date', 'status', 'address', 'parent_email', 'parent_phone',
];
const TEMPLATE_ROWS = [
  'STU001,Jane,Wanjiku,jane@student.edu,2010-03-15,female,Form 1,A,2024-09-01,active,123 School Road,parent.jane@example.com,+254700000000',
  'STU002,John,Omondi,john@student.edu,2010-07-22,male,Form 1,A,2024-09-01,active,456 Education Ave,parent.john@example.com,+254700000001',
];

function useStreams(schoolId: string) {
  return useQuery({
    queryKey: ['streams-filter', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db.from('streams').select('id, name, grades(name)').eq('school_id', schoolId).order('name');
      return (data ?? []) as any[];
    },
  });
}

function useActiveSemester(schoolId: string) {
  return useQuery({
    queryKey: ['active-semester', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db.from('semesters').select('id, name').eq('school_id', schoolId).eq('is_active', true).limit(1).single();
      return data as any;
    },
  });
}

interface ParsedRow {
  student_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  class_name: string;
  arm: string;
  date_of_birth: string;
  gender: string;
  email: string;
  admission_date: string;
  status: string;
  address: string;
  parent_email: string;
  parent_phone: string;
  stream_id: string | null;
  errors: string[];
  valid: boolean;
}

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

function parseCSV(text: string, streams: any[]): ParsedRow[] {
  // Build stream lookup by multiple keys: "Form 1A", "form 1 a", "jss1 a", etc.
  const streamMap: Record<string, string> = {};
  streams.forEach((s: any) => {
    streamMap[s.name.toLowerCase().trim()] = s.id;
    if (s.grades?.name) {
      const grade = s.grades.name.toLowerCase().trim();
      const arm = s.name.toLowerCase().trim();
      streamMap[`${grade} ${arm}`] = s.id;
      streamMap[`${grade}${arm}`] = s.id;
    }
  });

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLower = lines[0]?.toLowerCase() ?? '';
  const hasHeader = firstLower.includes('first_name') || firstLower.includes('student_id') || firstLower.includes('class');
  const headers = hasHeader ? parseCSVLine(lines[0]).map(h => h.toLowerCase().trim()) : [];
  const start = hasHeader ? 1 : 0;

  // Build a header-indexed row reader so column order can vary
  const idx = (name: string) => headers.indexOf(name);
  const hasHeaders = headers.length > 0;

  return lines.slice(start).map((line) => {
    const cols = parseCSVLine(line);
    const get = (name: string, fallbackPos: number): string => {
      if (hasHeaders) {
        const i = idx(name);
        return i >= 0 ? (cols[i] ?? '').replace(/^"|"$/g, '') : '';
      }
      return (cols[fallbackPos] ?? '').replace(/^"|"$/g, '');
    };

    const student_id      = get('student_id', 0);
    const first_name      = get('first_name', 1);
    const last_name       = get('last_name', 2);
    const email           = get('email', 3).toLowerCase();
    const date_of_birth   = get('date_of_birth', 4);
    const gender          = get('gender', 5).toLowerCase();
    const class_name      = get('class', 6);
    const arm             = get('arm', 7);
    const admission_date  = get('admission_date', 8);
    const status          = get('status', 9).toLowerCase();
    const address         = get('address', 10);
    const parent_email    = get('parent_email', 11).toLowerCase();
    const parent_phone    = get('parent_phone', 12);

    const full_name = [first_name, last_name].filter(Boolean).join(' ').trim();
    const errors: string[] = [];

    if (!full_name) errors.push('First or last name required');

    // Resolve stream: try combined "class arm", then class alone
    const combinedKey = [class_name, arm].filter(Boolean).join(' ').toLowerCase().trim();
    const stream_id =
      streamMap[combinedKey] ??
      streamMap[class_name.toLowerCase().trim()] ??
      null;
    if (!stream_id) {
      errors.push(`Class "${[class_name, arm].filter(Boolean).join(' ')}" not found — check stream names in School Structure`);
    }

    if (date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
      errors.push('date_of_birth must be yyyy-mm-dd');
    }
    if (admission_date && !/^\d{4}-\d{2}-\d{2}$/.test(admission_date)) {
      errors.push('admission_date must be yyyy-mm-dd');
    }
    if (gender && !['male', 'female', 'other'].includes(gender)) {
      errors.push('gender must be male/female/other');
    }
    if (parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent_email)) {
      errors.push('parent_email is not a valid email');
    }

    return {
      student_id, first_name, last_name, full_name, class_name, arm,
      date_of_birth, gender, email, admission_date, status, address,
      parent_email, parent_phone,
      stream_id, errors, valid: errors.length === 0,
    };
  });
}

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
    <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: 0 }}>
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

export default function StudentImportScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [step, setStep] = useState<Step>(1);
  const [rows, setRows] = useState<ParsedRow[]>([]);

  const { data: streams = [] } = useStreams(schoolId);
  const { data: semester } = useActiveSemester(schoolId);
  const importMutation = useBulkImportStudents(schoolId);

  const handleDownloadTemplate = async () => {
    const content = [CSV_HEADERS.join(','), ...TEMPLATE_ROWS].join('\n');

    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student_import_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    const path = FileSystem.cacheDirectory + 'student_import_template.csv';
    await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Save student template' });
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

    const parsed = parseCSV(text, streams);
    if (!parsed.length) { Alert.alert('Empty file', 'No rows found in the CSV.'); return; }
    setRows(parsed);
    setStep(3);
  };

  const handleImport = async () => {
    const valid = rows.filter((r) => r.valid);
    if (!valid.length) { Alert.alert('No valid rows', 'Fix all errors before importing.'); return; }
    if (!semester?.id) { Alert.alert('No active semester', 'Activate a semester before importing students.'); return; }
    haptics.medium();
    try {
      await importMutation.mutateAsync({
        rows: valid.map((r) => ({
          full_name: r.full_name,
          student_number: r.student_id || undefined,
          stream_id: r.stream_id!,
          date_of_birth: r.date_of_birth || undefined,
          gender: r.gender || undefined,
          admission_date: r.admission_date || undefined,
          status: r.status || undefined,
          parent_email: r.parent_email || undefined,
          parent_phone: r.parent_phone || undefined,
        })),
        semesterId: semester.id,
      });
      haptics.success();
      setStep(4);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Import failed', e.message ?? 'Could not import students.');
    }
  };

  const validCount   = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Import Students</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <StepBar step={step} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Step 1: Template ── */}
        {step === 1 && (
          <View style={{ gap: Spacing.base }}>
            <View style={[styles.infoBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ThemedText variant="label" color="muted" style={{ fontSize: 10, marginBottom: 8 }}>REQUIRED COLUMNS</ThemedText>
              {['first_name', 'last_name', 'class'].map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.brand.primary }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace' }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="label" color="muted" style={{ fontSize: 10, marginTop: 12, marginBottom: 8 }}>OPTIONAL COLUMNS</ThemedText>
              {['student_id', 'email', 'date_of_birth', 'gender', 'arm', 'admission_date', 'status', 'address', 'parent_email', 'parent_phone'].map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace', color: colors.textMuted }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="caption" color="muted" style={{ marginTop: 8 }}>
                Class must match stream names (e.g. "Form 1A"), or provide class + arm separately (e.g. "JSS1" + "A"). Dates: yyyy-mm-dd. student_id is stored as student_number; if omitted, it is auto-generated. parent_email links/creates a parent record and links them to the student.
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
              Fill in your CSV using the template format and upload it here. One student per row.
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
                    {row.class_name}{row.date_of_birth ? ' · ' + row.date_of_birth : ''}{row.gender ? ' · ' + row.gender : ''}
                  </ThemedText>
                  {row.parent_email ? (
                    <ThemedText variant="caption" color="muted">Parent: {row.parent_email}</ThemedText>
                  ) : null}
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
              disabled={validCount === 0 || importMutation.isPending}
              style={[styles.actionBtn, { backgroundColor: validCount > 0 && !importMutation.isPending ? Colors.semantic.success : colors.border }]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                {importMutation.isPending ? 'Importing…' : `Import ${validCount} Student${validCount !== 1 ? 's' : ''}`}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <View style={{ alignItems: 'center', gap: Spacing.base, paddingTop: Spacing.lg }}>
            <View style={[styles.successCircle, { backgroundColor: Colors.semantic.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.semantic.success} />
            </View>
            <ThemedText variant="h3" style={{ color: Colors.semantic.success }}>Import Complete</ThemedText>
            <ThemedText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {validCount} student{validCount !== 1 ? 's' : ''} added successfully.
            </ThemedText>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.actionBtn, { backgroundColor: colors.brand.primary, marginTop: Spacing.base }]}
            >
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>View Student List</ThemedText>
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
