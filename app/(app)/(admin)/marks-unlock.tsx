/**
 * Admin Marks Unlock / Correction
 * Shows marks for an assignment. Admin can unlock locked marks or
 * directly correct individual student marks with a mandatory note.
 * Every change is written to mark_audit_logs.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, BottomSheet, Skeleton, EmptyState, ErrorState,
} from '../../../components/ui';
import {
  useGradingScale, getGradeLabel, computeTotal,
} from '../../../hooks/useMarks';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// ─── types ────────────────────────────────────────────────────────────────────

interface AssignmentDetail {
  id: string;
  subjectName: string;
  streamName: string;
  gradeName: string;
  semesterName: string;
  semesterId: string;
  isLocked: boolean;
  windowOpen: boolean;
  isIGCSE: boolean;
}

interface StudentMark {
  studentId: string;
  fullName: string;
  studentNumber: string;
  photoUrl: string | null;
  markId: string | null;
  fa1: number | null;
  fa2: number | null;
  sum: number | null;
  isExcused: boolean;
  isLocked: boolean;
}

// ─── hooks ────────────────────────────────────────────────────────────────────

function useAssignmentDetail(assignmentId: string, schoolId: string) {
  return useQuery<AssignmentDetail | null>({
    queryKey: ['admin-assignment-detail', assignmentId, schoolId],
    enabled: !!assignmentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('subject_teacher_assignments')
        .select(`
          id, is_locked, semester_id,
          subjects ( name ),
          streams ( name, grades ( name, school_sections ( name ) ) ),
          semesters ( name, marks_window_open )
        `)
        .eq('id', assignmentId)
        .eq('school_id', schoolId)
        .single();
      if (!data) return null;
      const sectionName: string = data.streams?.grades?.school_sections?.name ?? '';
      const isIGCSE = /igcse|as level|a level|o level/i.test(sectionName);
      return {
        id: data.id,
        subjectName: data.subjects?.name ?? '—',
        streamName: data.streams?.name ?? '—',
        gradeName: data.streams?.grades?.name ?? '—',
        semesterName: data.semesters?.name ?? '—',
        semesterId: data.semester_id,
        isLocked: data.is_locked ?? false,
        windowOpen: data.semesters?.marks_window_open ?? true,
        isIGCSE,
      };
    },
  });
}

function useAssignmentMarks(
  assignmentId: string,
  assignment: AssignmentDetail | null | undefined,
  schoolId: string,
) {
  return useQuery<StudentMark[]>({
    queryKey: ['admin-assignment-marks', assignmentId, schoolId],
    enabled: !!assignment,
    staleTime: 1000 * 30,
    queryFn: async () => {
      if (!assignment) return [];
      const db = supabase as any;
      const [studentsRes, marksRes] = await Promise.all([
        db.from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('status', 'active'),
        db.from('marks')
          .select('id, student_id, assessment_type, value, is_excused, is_locked')
          .eq('school_id', schoolId)
          .eq('semester_id', assignment.semesterId),
      ]);

      const students: any[] = studentsRes.data ?? [];
      const marks: any[] = marksRes.data ?? [];

      return students.map((s: any): StudentMark => {
        const studentMarks = marks.filter((m: any) => m.student_id === s.id);
        const getVal = (type: string) => {
          const m = studentMarks.find((x: any) => x.assessment_type === type);
          return m ? { id: m.id, value: m.value, isExcused: m.is_excused, isLocked: m.is_locked } : null;
        };
        const fa1m = getVal('fa1');
        const fa2m = getVal('fa2');
        const summ = getVal('summative');
        const anyMark = fa1m ?? fa2m ?? summ;
        return {
          studentId: s.id,
          fullName: s.full_name,
          studentNumber: s.student_number,
          photoUrl: s.photo_url ?? null,
          markId: anyMark?.id ?? null,
          fa1: fa1m?.value ?? null,
          fa2: fa2m?.value ?? null,
          sum: summ?.value ?? null,
          isExcused: anyMark?.isExcused ?? false,
          isLocked: anyMark?.isLocked ?? false,
        };
      });
    },
  });
}

function useUnlockAssignment(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const db = supabase as any;
      const { error } = await db
        .from('subject_teacher_assignments')
        .update({ is_locked: false })
        .eq('id', assignmentId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-assignment-detail'] });
      qc.invalidateQueries({ queryKey: ['admin-marks-matrix'] });
    },
  });
}

function useCorrectMark(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      semesterId: string;
      assessmentType: 'fa1' | 'fa2' | 'summative';
      value: number | null;
      note: string;
      correctedBy: string;
      existingMarkId?: string;
    }) => {
      const db = supabase as any;
      const payload = {
        school_id: schoolId,
        student_id: params.studentId,
        semester_id: params.semesterId,
        assessment_type: params.assessmentType,
        value: params.value,
        entered_by: params.correctedBy,
        corrected_by: params.correctedBy,
        corrected_at: new Date().toISOString(),
        correction_note: params.note,
        is_locked: false,
      };
      const { data, error } = params.existingMarkId
        ? await db.from('marks').update(payload).eq('id', params.existingMarkId).select('id').single()
        : await db.from('marks').insert({ ...payload }).select('id').single();
      if (error) throw error;

      // Audit log — fire-and-forget
      db.from('mark_audit_logs').insert({
        school_id: schoolId,
        mark_id: data?.id ?? params.existingMarkId,
        changed_by: params.correctedBy,
        change_type: 'admin_correction',
        note: params.note,
        changed_at: new Date().toISOString(),
      }).then(() => {});
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-assignment-marks'] });
      qc.invalidateQueries({ queryKey: ['admin-marks-matrix'] });
    },
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MarksUnlockScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();

  const schoolId = user?.schoolId ?? '';

  const { data: assignment, isLoading: loadingDetail, isError: errDetail, refetch: refetchDetail } =
    useAssignmentDetail(assignmentId ?? '', schoolId);

  const { data: students = [], isLoading: loadingMarks, isError: errMarks, refetch: refetchMarks } =
    useAssignmentMarks(assignmentId ?? '', assignment, schoolId);

  const { data: scales = [] } = useGradingScale(schoolId);
  const unlockMutation = useUnlockAssignment(schoolId);
  const correctMutation = useCorrectMark(schoolId);

  // Sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetStudent, setSheetStudent] = useState<StudentMark | null>(null);
  const [editFA1, setEditFA1] = useState('');
  const [editFA2, setEditFA2] = useState('');
  const [editSum, setEditSum] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isLoading = loadingDetail || loadingMarks;
  const isError = errDetail || errMarks;

  const openStudentSheet = useCallback((s: StudentMark) => {
    haptics.selection();
    setSheetStudent(s);
    setEditFA1(s.fa1 !== null ? String(s.fa1) : '');
    setEditFA2(s.fa2 !== null ? String(s.fa2) : '');
    setEditSum(s.sum !== null ? String(s.sum) : '');
    setCorrectionNote('');
    setSheetVisible(true);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!assignment) return;
    Alert.alert(
      'Unlock Marks',
      `Unlock marks for ${assignment.subjectName} — ${assignment.streamName}? The subject teacher will be able to make corrections.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock',
          style: 'destructive',
          onPress: async () => {
            try {
              haptics.medium();
              await unlockMutation.mutateAsync(assignment.id);
              haptics.success();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not unlock marks. Try again.');
            }
          },
        },
      ],
    );
  }, [assignment, unlockMutation]);

  const handleSaveCorrection = useCallback(async () => {
    if (!sheetStudent || !assignment) return;
    if (correctionNote.trim().length < 5) {
      Alert.alert('Note required', 'Please enter a correction note (min 5 characters).');
      return;
    }
    setSaving(true);
    try {
      const types: Array<'fa1' | 'fa2' | 'summative'> = assignment.isIGCSE
        ? ['summative']
        : ['fa1', 'fa2', 'summative'];
      const vals = { fa1: editFA1, fa2: editFA2, summative: editSum };
      const origVals = { fa1: sheetStudent.fa1, fa2: sheetStudent.fa2, summative: sheetStudent.sum };

      for (const type of types) {
        const raw = vals[type === 'summative' ? 'summative' : type];
        const parsed = raw.trim() === '' ? null : parseFloat(raw);
        const orig = origVals[type === 'summative' ? 'summative' : type];
        if (parsed === orig) continue; // no change
        await correctMutation.mutateAsync({
          studentId: sheetStudent.studentId,
          semesterId: assignment.semesterId,
          assessmentType: type,
          value: parsed,
          note: correctionNote.trim(),
          correctedBy: user!.staffId!,
          existingMarkId: sheetStudent.markId ?? undefined,
        });
      }
      haptics.success();
      setSheetVisible(false);
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not save correction. Try again.');
    } finally {
      setSaving(false);
    }
  }, [sheetStudent, assignment, correctionNote, editFA1, editFA2, editSum, correctMutation, user]);

  // Preview total from current inputs
  const previewTotal = useMemo(() => {
    if (!assignment) return null;
    const fa1 = parseFloat(editFA1) || null;
    const fa2 = parseFloat(editFA2) || null;
    const sum = parseFloat(editSum) || null;
    return computeTotal(fa1, fa2, sum, assignment.isIGCSE);
  }, [editFA1, editFA2, editSum, assignment]);

  const previewGrade = previewTotal !== null ? getGradeLabel(previewTotal, scales) : '—';

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load marks" description="Try again." onRetry={() => { refetchDetail(); refetchMarks(); }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText variant="h4" numberOfLines={1}>
            {assignment?.subjectName ?? '—'}
          </ThemedText>
          <ThemedText variant="caption" color="muted">
            {assignment?.streamName ?? '—'} · {assignment?.semesterName ?? '—'}
          </ThemedText>
        </View>
        {/* Unlock button */}
        {assignment?.isLocked && (
          <TouchableOpacity
            onPress={handleUnlock}
            style={[styles.unlockBtn, { borderColor: Colors.semantic.warning }]}
            disabled={unlockMutation.isPending}
          >
            <Ionicons name="lock-open-outline" size={15} color={Colors.semantic.warning} />
            <ThemedText variant="label" style={{ color: Colors.semantic.warning, marginLeft: 4, fontSize: 11 }}>
              UNLOCK
            </ThemedText>
          </TouchableOpacity>
        )}
        {!assignment?.isLocked && assignment && (
          <View style={[styles.unlockBtn, { borderColor: Colors.semantic.success }]}>
            <Ionicons name="lock-open" size={15} color={Colors.semantic.success} />
          </View>
        )}
      </View>

      {/* Status banner */}
      {assignment && (
        <View style={[
          styles.statusBanner,
          {
            backgroundColor: assignment.isLocked
              ? Colors.semantic.warningLight
              : Colors.semantic.successLight,
          },
        ]}>
          <Ionicons
            name={assignment.isLocked ? 'lock-closed' : 'lock-open'}
            size={13}
            color={assignment.isLocked ? Colors.semantic.warning : Colors.semantic.success}
          />
          <ThemedText variant="caption" style={{
            color: assignment.isLocked ? Colors.semantic.warning : Colors.semantic.success,
            marginLeft: 8,
          }}>
            {assignment.isLocked
              ? 'Marks are locked. Tap UNLOCK to enable corrections.'
              : 'Marks are unlocked. Tap a student to correct their marks.'}
          </ThemedText>
        </View>
      )}

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="45%" height={13} />
                <Skeleton width="25%" height={11} />
              </View>
              {Array.from({ length: 3 }).map((__, j) => (
                <Skeleton key={j} width={40} height={32} radius={Radius.sm} style={{ marginLeft: 6 }} />
              ))}
            </View>
          ))}
        </View>
      ) : students.length === 0 ? (
        <EmptyState title="No students" description="No active students found." />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}>
          {/* Column headers */}
          <View style={[styles.colHeader, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
            <View style={styles.studentCol}>
              <ThemedText variant="label" color="muted" style={{ fontSize: 9 }}>STUDENT</ThemedText>
            </View>
            {!assignment?.isIGCSE && (
              <>
                <ThemedText variant="label" color="muted" style={styles.markColHeader}>FA1</ThemedText>
                <ThemedText variant="label" color="muted" style={styles.markColHeader}>FA2</ThemedText>
              </>
            )}
            <ThemedText variant="label" color="muted" style={styles.markColHeader}>SUM</ThemedText>
            <ThemedText variant="label" color="muted" style={styles.markColHeader}>TOT</ThemedText>
            <ThemedText variant="label" color="muted" style={styles.markColHeader}>GRD</ThemedText>
          </View>

          {students.map((s, idx) => {
            const total = computeTotal(s.fa1, s.fa2, s.sum, assignment?.isIGCSE ?? false);
            const grade = getGradeLabel(total, scales);
            return (
              <TouchableOpacity
                key={s.studentId}
                onPress={() => openStudentSheet(s)}
                disabled={assignment?.isLocked}
                activeOpacity={assignment?.isLocked ? 1 : 0.75}
                style={[
                  styles.studentRow,
                  {
                    backgroundColor: idx % 2 === 0 ? colors.background : colors.surface,
                    borderBottomColor: colors.border,
                    opacity: assignment?.isLocked ? 0.6 : 1,
                  },
                ]}
              >
                <View style={styles.studentCol}>
                  <Avatar name={s.fullName} photoUrl={s.photoUrl} size={30} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
                      {s.fullName}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted" style={{ fontSize: 10 }}>
                      {s.studentNumber}
                    </ThemedText>
                  </View>
                </View>

                {!assignment?.isIGCSE && (
                  <>
                    <ThemedText variant="bodySm" style={[styles.markCell, { color: s.fa1 !== null ? colors.textPrimary : colors.textMuted }]}>
                      {s.isExcused ? 'N/A' : (s.fa1 !== null ? String(s.fa1) : '—')}
                    </ThemedText>
                    <ThemedText variant="bodySm" style={[styles.markCell, { color: s.fa2 !== null ? colors.textPrimary : colors.textMuted }]}>
                      {s.isExcused ? 'N/A' : (s.fa2 !== null ? String(s.fa2) : '—')}
                    </ThemedText>
                  </>
                )}
                <ThemedText variant="bodySm" style={[styles.markCell, { color: s.sum !== null ? colors.textPrimary : colors.textMuted }]}>
                  {s.isExcused ? 'N/A' : (s.sum !== null ? String(s.sum) : '—')}
                </ThemedText>
                <ThemedText variant="bodySm" style={[styles.markCell, { color: total !== null ? colors.brand.primary : colors.textMuted, fontWeight: '700' }]}>
                  {s.isExcused ? 'N/A' : (total !== null ? String(total) : '—')}
                </ThemedText>
                <ThemedText variant="label" style={[styles.markCell, { color: grade !== '—' ? colors.brand.primary : colors.textMuted, fontWeight: '800', fontSize: 12 }]}>
                  {s.isExcused ? 'N/A' : grade}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Correction sheet */}
      <BottomSheet
        visible={sheetVisible && !!sheetStudent}
        onClose={() => setSheetVisible(false)}
        title={sheetStudent?.fullName ?? ''}
        snapHeight={520}
      >
        {sheetStudent && assignment && (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.sheetBody}>
              {/* Mark inputs */}
              <View style={[styles.inputGroup, { backgroundColor: colors.surfaceSecondary, borderRadius: Radius.md }]}>
                {!assignment.isIGCSE && (
                  <>
                    <MarkInputRow
                      label="FA1"
                      value={editFA1}
                      onChange={setEditFA1}
                      colors={colors}
                    />
                    <View style={[styles.inputDivider, { backgroundColor: colors.border }]} />
                    <MarkInputRow
                      label="FA2"
                      value={editFA2}
                      onChange={setEditFA2}
                      colors={colors}
                    />
                    <View style={[styles.inputDivider, { backgroundColor: colors.border }]} />
                  </>
                )}
                <MarkInputRow
                  label="Summative"
                  value={editSum}
                  onChange={setEditSum}
                  colors={colors}
                />
              </View>

              {/* Preview */}
              {previewTotal !== null && (
                <View style={[styles.previewRow, { backgroundColor: colors.surfaceSecondary, borderRadius: Radius.md }]}>
                  <ThemedText variant="caption" color="muted">Preview total</ThemedText>
                  <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '700' }}>
                    {previewTotal} — {previewGrade}
                  </ThemedText>
                </View>
              )}

              {/* Correction note */}
              <View>
                <ThemedText variant="label" color="muted" style={{ marginBottom: 6, fontSize: 11 }}>
                  CORRECTION NOTE (required)
                </ThemedText>
                <TextInput
                  value={correctionNote}
                  onChangeText={setCorrectionNote}
                  placeholder="Reason for correction…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  style={[
                    styles.noteInput,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: correctionNote.trim().length > 0 && correctionNote.trim().length < 5
                        ? Colors.semantic.error
                        : colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                />
                {correctionNote.trim().length > 0 && correctionNote.trim().length < 5 && (
                  <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: 4 }}>
                    Note must be at least 5 characters.
                  </ThemedText>
                )}
              </View>

              <TouchableOpacity
                onPress={handleSaveCorrection}
                disabled={saving || correctionNote.trim().length < 5}
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: correctionNote.trim().length >= 5
                      ? colors.brand.primary
                      : colors.surfaceSecondary,
                  },
                ]}
              >
                <Ionicons
                  name={saving ? 'hourglass-outline' : 'save-outline'}
                  size={16}
                  color={correctionNote.trim().length >= 5 ? '#fff' : colors.textMuted}
                />
                <ThemedText
                  variant="body"
                  style={{
                    color: correctionNote.trim().length >= 5 ? '#fff' : colors.textMuted,
                    fontWeight: '700',
                    marginLeft: 8,
                  }}
                >
                  {saving ? 'Saving…' : 'Save Correction'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function MarkInputRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: any;
}) {
  return (
    <View style={styles.markInputRow}>
      <ThemedText variant="body" style={{ fontWeight: '600', width: 90 }}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        style={[styles.markInput, { color: colors.textPrimary, borderColor: colors.border }]}
      />
    </View>
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
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skeletonList: { padding: Spacing.base, gap: 10 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  markColHeader: { width: 44, textAlign: 'center', fontSize: 9 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  studentCol: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 130, paddingRight: 8 },
  markCell: { width: 44, textAlign: 'center', fontSize: 12 },
  sheetBody: { gap: 16, paddingBottom: 20 },
  inputGroup: { overflow: 'hidden' },
  markInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  markInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  inputDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    marginTop: 4,
  },
});
