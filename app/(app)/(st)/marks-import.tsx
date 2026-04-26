/**
 * Marks Bulk Import — 4-step CSV wizard
 * Step 1: Pick assignment
 * Step 2: Download CSV template / upload CSV
 * Step 3: Preview parsed rows with validation
 * Step 4: Confirm import → upsert marks
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Skeleton, EmptyState,
} from '../../../components/ui';
import {
  useGradingScale, getGradeLabel, computeTotal,
} from '../../../hooks/useMarks';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// ─── types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface Assignment {
  id: string;
  subjectName: string;
  streamName: string;
  semesterName: string;
  semesterId: string;
  isIGCSE: boolean;
  windowOpen: boolean;
}

interface Student {
  id: string;
  fullName: string;
  studentNumber: string;
}

interface ParsedRow {
  studentNumber: string;
  studentId: string | null;
  fullName: string;
  fa1: number | null;
  fa2: number | null;
  sum: number | null;
  errors: string[];
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

function generateTemplate(students: Student[], isIGCSE: boolean): string {
  const headers = isIGCSE
    ? 'student_number,full_name,summative'
    : 'student_number,full_name,fa1,fa2,summative';
  const rows = students.map((s) =>
    isIGCSE
      ? `${s.studentNumber},${s.fullName},`
      : `${s.studentNumber},${s.fullName},,,`,
  );
  return [headers, ...rows].join('\n');
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function validateRow(
  row: Record<string, string>,
  studentMap: Record<string, Student>,
  isIGCSE: boolean,
): ParsedRow {
  const sn = row['student_number'] ?? '';
  const student = studentMap[sn.toLowerCase()];
  const errors: string[] = [];

  if (!sn) errors.push('Missing student_number');
  else if (!student) errors.push(`Student "${sn}" not found`);

  const fa1 = parseNumber(row['fa1']);
  const fa2 = parseNumber(row['fa2']);
  const sum = parseNumber(row['summative']);

  if (!isIGCSE) {
    if (fa1 !== null && (fa1 < 0 || fa1 > 100)) errors.push('FA1 out of range (0–100)');
    if (fa2 !== null && (fa2 < 0 || fa2 > 100)) errors.push('FA2 out of range (0–100)');
  }
  if (sum !== null && (sum < 0 || sum > 100)) errors.push('Summative out of range (0–100)');

  return {
    studentNumber: sn,
    studentId: student?.id ?? null,
    fullName: student?.fullName ?? row['full_name'] ?? sn,
    fa1: isIGCSE ? null : fa1,
    fa2: isIGCSE ? null : fa2,
    sum,
    errors,
  };
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useSTAssignments(staffId: string | null, schoolId: string) {
  return useQuery<Assignment[]>({
    queryKey: ['st-assignments-import', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('subject_teacher_assignments')
        .select(`
          id, semester_id,
          subjects ( name ),
          streams ( name, grades ( name, school_sections ( name ) ) ),
          semesters ( name, marks_window_open )
        `)
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId);
      return ((data ?? []) as any[]).map((a: any): Assignment => {
        const sectionName: string = a.streams?.grades?.school_sections?.name ?? '';
        return {
          id: a.id,
          subjectName: a.subjects?.name ?? '—',
          streamName: a.streams?.name ?? '—',
          semesterName: a.semesters?.name ?? '—',
          semesterId: a.semester_id,
          isIGCSE: /igcse|as level|a level|o level/i.test(sectionName),
          windowOpen: a.semesters?.marks_window_open ?? true,
        };
      });
    },
  });
}

function useStreamStudents(streamId: string | null, schoolId: string) {
  return useQuery<Student[]>({
    queryKey: ['stream-students-import', streamId, schoolId],
    enabled: !!streamId && !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('students')
        .select('id, full_name, student_number, stream_id')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .eq('stream_id', streamId!);
      return ((data ?? []) as any[]).map((s: any): Student => ({
        id: s.id,
        fullName: s.full_name,
        studentNumber: s.student_number,
      }));
    },
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MarksImportScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ assignmentId?: string }>();

  const schoolId = user?.schoolId ?? '';
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(params.assignmentId ? 2 : 1);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: assignments = [], isLoading: loadingAssignments } =
    useSTAssignments(user?.staffId ?? null, schoolId);

  const { data: students = [], isLoading: loadingStudents } =
    useStreamStudents(selectedStreamId, schoolId);

  const { data: scales = [] } = useGradingScale(schoolId);

  // Prefill from params
  React.useEffect(() => {
    if (params.assignmentId && assignments.length > 0) {
      const a = assignments.find((x) => x.id === params.assignmentId);
      if (a) { setSelectedAssignment(a); setStep(2); }
    }
  }, [params.assignmentId, assignments]);

  const studentMap = useMemo(() => {
    const map: Record<string, Student> = {};
    students.forEach((s) => { map[s.studentNumber.toLowerCase()] = s; });
    return map;
  }, [students]);

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);

  // ── Step handlers ──────────────────────────────────────────────────────────

  const handleSelectAssignment = useCallback((a: Assignment) => {
    haptics.selection();
    setSelectedAssignment(a);
    // Fetch the stream — we need stream_id from the assignment
    // Will be resolved via supabase query below
    setStep(2);
  }, []);

  // Fetch stream_id for selected assignment
  useQuery({
    queryKey: ['assignment-stream', selectedAssignment?.id],
    enabled: !!selectedAssignment,
    staleTime: Infinity,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('subject_teacher_assignments')
        .select('stream_id')
        .eq('id', selectedAssignment!.id)
        .single();
      if (data?.stream_id) setSelectedStreamId(data.stream_id);
      return data?.stream_id ?? null;
    },
  });

  const handleDownloadTemplate = useCallback(async () => {
    if (!selectedAssignment || students.length === 0) return;
    haptics.light();
    const csv = generateTemplate(students, selectedAssignment.isIGCSE);
    const fileName = `marks_template_${selectedAssignment.subjectName.replace(/\s/g, '_')}.csv`;
    const path = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Save CSV Template' });
    }
  }, [selectedAssignment, students]);

  const handlePickCSV = useCallback(async () => {
    if (!selectedAssignment) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      haptics.selection();
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const rawRows = parseCSV(text);
      if (rawRows.length === 0) {
        Alert.alert('Invalid CSV', 'No data rows found. Check the file format.');
        return;
      }
      const rows = rawRows.map((r) => validateRow(r, studentMap, selectedAssignment.isIGCSE));
      setParsedRows(rows);
      setStep(3);
    } catch {
      Alert.alert('Error', 'Could not read file. Try again.');
    }
  }, [selectedAssignment, studentMap]);

  const handleImport = useCallback(async () => {
    if (!selectedAssignment || validRows.length === 0) return;
    setImporting(true);
    haptics.medium();
    try {
      const db = supabase as any;
      const upserts = validRows.flatMap((r) => {
        const base = {
          school_id: schoolId,
          student_id: r.studentId!,
          semester_id: selectedAssignment.semesterId,
          entered_by: user!.staffId!,
        };
        const rows: any[] = [];
        if (!selectedAssignment.isIGCSE && r.fa1 !== null) {
          rows.push({ ...base, assessment_type: 'fa1', value: r.fa1 });
        }
        if (!selectedAssignment.isIGCSE && r.fa2 !== null) {
          rows.push({ ...base, assessment_type: 'fa2', value: r.fa2 });
        }
        if (r.sum !== null) {
          rows.push({ ...base, assessment_type: 'summative', value: r.sum });
        }
        return rows;
      });

      if (upserts.length > 0) {
        const { error } = await db
          .from('marks')
          .upsert(upserts, { onConflict: 'student_id,semester_id,assessment_type' });
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ['st-assignments-overview'] });
      qc.invalidateQueries({ queryKey: ['marks-for-assignment'] });
      haptics.success();
      setStep(4);
    } catch {
      haptics.error();
      Alert.alert('Import failed', 'Could not import marks. Try again.');
    } finally {
      setImporting(false);
    }
  }, [selectedAssignment, validRows, schoolId, user, qc]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((step - 1) as Step) : router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText variant="h4">Import Marks</ThemedText>
          <ThemedText variant="caption" color="muted">Step {step} of 4</ThemedText>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Step indicator */}
      <View style={[styles.stepBar, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
        {(['Pick', 'Upload', 'Preview', 'Done'] as const).map((label, i) => {
          const n = (i + 1) as Step;
          const active = step === n;
          const done = step > n;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                {
                  backgroundColor: done
                    ? Colors.semantic.success
                    : active ? colors.brand.primary : colors.border,
                },
              ]}>
                {done
                  ? <Ionicons name="checkmark" size={11} color="#fff" />
                  : <ThemedText variant="label" style={{ color: '#fff', fontSize: 10 }}>{n}</ThemedText>
                }
              </View>
              <ThemedText variant="caption" style={{
                color: active ? colors.textPrimary : colors.textMuted,
                fontSize: 10,
                marginTop: 3,
              }}>
                {label}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Step 1: Pick assignment ────────────────────────────────────────── */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <ThemedText variant="h4" style={{ marginBottom: 4 }}>Select Assignment</ThemedText>
            <ThemedText variant="bodySm" color="muted" style={{ marginBottom: 20 }}>
              Choose the subject and class you want to import marks for.
            </ThemedText>
            {loadingAssignments ? (
              <View style={{ gap: 10 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} width="100%" height={64} radius={Radius.lg} />
                ))}
              </View>
            ) : assignments.length === 0 ? (
              <EmptyState title="No assignments" description="No active assignments found." />
            ) : (
              <View style={{ gap: 10 }}>
                {assignments.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => handleSelectAssignment(a)}
                    disabled={!a.windowOpen}
                    style={[
                      styles.assignmentCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        opacity: a.windowOpen ? 1 : 0.5,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="body" style={{ fontWeight: '700' }}>{a.subjectName}</ThemedText>
                      <ThemedText variant="caption" color="muted">{a.streamName} · {a.semesterName}</ThemedText>
                    </View>
                    {!a.windowOpen && (
                      <View style={[styles.closedChip, { backgroundColor: Colors.semantic.errorLight }]}>
                        <ThemedText variant="label" style={{ color: Colors.semantic.error, fontSize: 10 }}>CLOSED</ThemedText>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Step 2: Download template / upload ────────────────────────────── */}
        {step === 2 && selectedAssignment && (
          <View style={styles.stepContent}>
            <ThemedText variant="h4" style={{ marginBottom: 4 }}>Upload CSV</ThemedText>
            <ThemedText variant="bodySm" color="muted" style={{ marginBottom: 20 }}>
              Download the template pre-filled with your students, enter marks in a spreadsheet, then upload it.
            </ThemedText>

            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>{selectedAssignment.subjectName}</ThemedText>
                <ThemedText variant="caption" color="muted">{selectedAssignment.streamName} · {selectedAssignment.semesterName}</ThemedText>
                <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
                  Columns: {selectedAssignment.isIGCSE ? 'student_number, full_name, summative' : 'student_number, full_name, fa1, fa2, summative'}
                </ThemedText>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleDownloadTemplate}
              disabled={loadingStudents || students.length === 0}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Ionicons name="download-outline" size={18} color={colors.brand.primary} />
              <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600', marginLeft: 10 }}>
                {loadingStudents ? 'Loading students…' : 'Download CSV Template'}
              </ThemedText>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <ThemedText variant="caption" color="muted" style={{ marginHorizontal: 12 }}>OR</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              onPress={handlePickCSV}
              style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 10 }}>
                Pick CSV File
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Preview parsed rows ───────────────────────────────────── */}
        {step === 3 && selectedAssignment && (
          <View style={styles.stepContent}>
            <View style={styles.previewHeader}>
              <ThemedText variant="h4">Preview</ThemedText>
              <View style={styles.previewBadges}>
                <View style={[styles.badge, { backgroundColor: Colors.semantic.successLight }]}>
                  <ThemedText variant="label" style={{ color: Colors.semantic.success, fontSize: 11 }}>
                    {validRows.length} valid
                  </ThemedText>
                </View>
                {errorRows.length > 0 && (
                  <View style={[styles.badge, { backgroundColor: Colors.semantic.errorLight }]}>
                    <ThemedText variant="label" style={{ color: Colors.semantic.error, fontSize: 11 }}>
                      {errorRows.length} errors
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>

            {errorRows.length > 0 && (
              <View style={[styles.errorBanner, { backgroundColor: Colors.semantic.errorLight }]}>
                <Ionicons name="alert-circle" size={14} color={Colors.semantic.error} />
                <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, marginLeft: 8, flex: 1 }}>
                  {errorRows.length} rows have errors and will be skipped. Fix your CSV and re-upload to include them.
                </ThemedText>
              </View>
            )}

            <View style={{ gap: 8, marginTop: 12 }}>
              {parsedRows.map((row, i) => {
                const total = computeTotal(row.fa1, row.fa2, row.sum, selectedAssignment.isIGCSE);
                const grade = getGradeLabel(total, scales);
                const hasError = row.errors.length > 0;
                return (
                  <View
                    key={i}
                    style={[
                      styles.previewRow,
                      {
                        backgroundColor: hasError ? Colors.semantic.errorLight : colors.surface,
                        borderColor: hasError ? Colors.semantic.error + '40' : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="bodySm" style={{ fontWeight: '600', fontSize: 13 }}>
                        {row.fullName}
                      </ThemedText>
                      <ThemedText variant="caption" color="muted">{row.studentNumber}</ThemedText>
                      {hasError && row.errors.map((e, j) => (
                        <ThemedText key={j} variant="caption" style={{ color: Colors.semantic.error, fontSize: 10, marginTop: 2 }}>
                          • {e}
                        </ThemedText>
                      ))}
                    </View>
                    {!hasError && (
                      <View style={styles.previewMark}>
                        {!selectedAssignment.isIGCSE && (
                          <ThemedText variant="caption" color="muted" style={{ fontSize: 11 }}>
                            {row.fa1 ?? '—'} / {row.fa2 ?? '—'}
                          </ThemedText>
                        )}
                        <ThemedText variant="bodySm" style={{ color: colors.brand.primary, fontWeight: '700' }}>
                          {row.sum ?? '—'} → {total ?? '—'} ({grade})
                        </ThemedText>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {validRows.length > 0 && (
              <TouchableOpacity
                onPress={handleImport}
                disabled={importing}
                style={[styles.importBtn, { backgroundColor: colors.brand.primary }]}
              >
                <Ionicons name={importing ? 'hourglass-outline' : 'checkmark-done-outline'} size={18} color="#fff" />
                <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 10 }}>
                  {importing ? 'Importing…' : `Import ${validRows.length} Students`}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Step 4: Done ──────────────────────────────────────────────────── */}
        {step === 4 && (
          <View style={styles.doneContent}>
            <View style={[styles.doneIcon, { backgroundColor: Colors.semantic.successLight }]}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.semantic.success} />
            </View>
            <ThemedText variant="h3" style={{ marginTop: 20, textAlign: 'center' }}>Import Complete</ThemedText>
            <ThemedText variant="body" color="muted" style={{ textAlign: 'center', marginTop: 8 }}>
              {validRows.length} student mark{validRows.length !== 1 ? 's' : ''} imported successfully.
            </ThemedText>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.doneBtn, { backgroundColor: colors.brand.primary }]}
            >
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>Done</ThemedText>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  stepBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepItem: { alignItems: 'center', gap: 3 },
  stepCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: 80 },
  stepContent: { gap: 0 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radius.lg,
    gap: 10,
    ...Shadow.sm,
  },
  closedChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: Radius.lg,
    marginBottom: 20,
    ...Shadow.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  previewBadges: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 12, borderRadius: Radius.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.md,
    gap: 10,
    ...Shadow.sm,
  },
  previewMark: { alignItems: 'flex-end', gap: 2 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: Radius.lg,
    marginTop: 20,
  },
  doneContent: { alignItems: 'center', paddingTop: 60, gap: 4 },
  doneIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  doneBtn: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: Radius.lg,
  },
});
