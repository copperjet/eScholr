/**
 * Admin — Bulk Student CSV Import
 * 4-step wizard: template → upload → preview/validate → import
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, FlatList, Alert,
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

const CSV_HEADERS = ['full_name', 'student_number', 'stream_name', 'date_of_birth', 'gender'];
const TEMPLATE_ROWS = [
  'Jane Wanjiku,2026001,Form 1A,2010-03-15,female',
  'John Omondi,2026002,Form 1A,2010-07-22,male',
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
  full_name: string;
  student_number: string;
  stream_name: string;
  date_of_birth: string;
  gender: string;
  stream_id: string | null;
  errors: string[];
  valid: boolean;
}

function parseCSV(text: string, streams: any[]): ParsedRow[] {
  const streamMap: Record<string, string> = {};
  streams.forEach((s: any) => {
    streamMap[s.name.toLowerCase()] = s.id;
    if (s.grades?.name) streamMap[(s.grades.name + ' ' + s.name).toLowerCase()] = s.id;
  });

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = lines[0]?.toLowerCase().includes('full_name') ? 1 : 0;

  return lines.slice(start).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const [full_name = '', student_number = '', stream_name = '', date_of_birth = '', gender = ''] = cols;
    const errors: string[] = [];

    if (!full_name) errors.push('Name required');
    if (!student_number) errors.push('Student number required');

    const stream_id = streamMap[stream_name.toLowerCase()] ?? null;
    if (!stream_id) errors.push(`Stream "${stream_name}" not found`);

    if (date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
      errors.push('DOB must be yyyy-mm-dd');
    }

    if (gender && !['male', 'female', 'other'].includes(gender.toLowerCase())) {
      errors.push('Gender must be male/female/other');
    }

    return { full_name, student_number, stream_name, date_of_birth, gender, stream_id, errors, valid: errors.length === 0 };
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
    const text = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
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
      const result = await importMutation.mutateAsync({
        rows: valid.map((r) => ({
          full_name: r.full_name,
          student_number: r.student_number,
          stream_id: r.stream_id!,
          date_of_birth: r.date_of_birth || undefined,
          gender: r.gender || undefined,
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
              {CSV_HEADERS.map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 }}>
                  <View style={[styles.dot, { backgroundColor: colors.brand.primary }]} />
                  <ThemedText variant="bodySm" style={{ fontFamily: 'monospace' }}>{h}</ThemedText>
                </View>
              ))}
              <ThemedText variant="caption" color="muted" style={{ marginTop: 8 }}>
                stream_name must exactly match your configured stream names. date_of_birth format: yyyy-mm-dd.
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
                    {row.student_number} · {row.stream_name}
                  </ThemedText>
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
