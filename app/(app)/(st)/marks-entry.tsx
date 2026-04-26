/**
 * Marks Entry — full per-assignment screen
 * Shows all students with FA1 / FA2 / Summative inputs side-by-side.
 * Grade + total auto-compute client-side from cached grading_scales.
 * Deviation warning if |mark - classAvg| > 30.
 * N/A toggle via long-press.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { MarksWindowBanner } from '../../../components/modules/MarksWindowBanner';
import { ClassAverageBanner } from '../../../components/modules/ClassAverageBanner';
import {
  useGradingScale, useMarksForAssignment, useUpdateMark, useExcuseMark,
  getGradeLabel, computeTotal, type StudentMarkRow,
} from '../../../hooks/useMarks';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const DEVIATION_THRESHOLD = 30;

// ── Save state per cell ───────────────────────────────────────
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function MarksEntryScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ assignmentId: string }>();

  // Look up the full assignment from ST assignments
  const { data: assignmentRaw, isLoading: assignLoading } = useQuery({
    queryKey: ['st-assignment-detail', params.assignmentId, user?.schoolId],
    enabled: !!params.assignmentId && !!user?.schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subject_teacher_assignments')
        .select(`
          id, subject_id, stream_id, semester_id,
          subjects ( name ),
          streams ( name, grades ( name, school_sections ( name ) ) ),
          semesters ( name, is_active, marks_window_open )
        `)
        .eq('id', params.assignmentId!)
        .eq('school_id', user!.schoolId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: marksData, isLoading: marksLoading, isError, refetch } = useMarksForAssignment(
    assignmentRaw,
    user?.schoolId ?? '',
  );
  const { data: gradingScales = [] } = useGradingScale(user?.schoolId ?? '');
  const updateMark = useUpdateMark(user?.schoolId ?? '');
  const excuseMark = useExcuseMark(user?.schoolId ?? '');

  // Local edits: studentId → { fa1, fa2, summative }
  const [localEdits, setLocalEdits] = useState<Record<string, Record<string, string>>>({});
  // Save states per cell key "studentId:type"
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  const detail = marksData?.detail ?? null;
  const students = marksData?.students ?? [];
  const isWindowOpen = detail?.isWindowOpen ?? true;
  const isIGCSE = detail?.isIGCSE ?? false;

  // Compute class averages from server data + local edits
  const classAverages = useMemo(() => {
    const types = isIGCSE ? ['summative'] : ['fa1', 'fa2', 'summative'];
    const avgs: Record<string, number | null> = {};
    types.forEach((type) => {
      const vals: number[] = [];
      students.forEach((s) => {
        // Prefer local edit, fall back to server value
        const local = localEdits[s.id]?.[type];
        const server = (s as any)[type === 'summative' ? 'summative' : type]?.value;
        const v = local !== undefined ? parseFloat(local) : server;
        if (v !== null && v !== undefined && !isNaN(v) && !isExcusedStudent(s)) {
          vals.push(v);
        }
      });
      avgs[type] = vals.length > 0
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
    });
    return avgs;
  }, [students, localEdits, isIGCSE]);

  // Total entered count (any mark saved)
  const enteredCount = useMemo(() => {
    const withMarks = students.filter((s) => {
      if (isExcusedStudent(s)) return false;
      if (isIGCSE) {
        const local = localEdits[s.id]?.summative;
        return local !== undefined ? local !== '' : s.summative?.value !== null && s.summative?.value !== undefined;
      }
      const types = ['fa1', 'fa2', 'summative'] as const;
      return types.every((t) => {
        const local = localEdits[s.id]?.[t];
        return local !== undefined ? local !== '' : (s as any)[t]?.value !== null && (s as any)[t]?.value !== undefined;
      });
    });
    return withMarks.length;
  }, [students, localEdits, isIGCSE]);

  function isExcusedStudent(s: StudentMarkRow): boolean {
    return s.fa1?.is_excused === true || s.fa2?.is_excused === true || s.summative?.is_excused === true;
  }

  const handleBlur = useCallback(
    async (studentId: string, type: string) => {
      const rawVal = localEdits[studentId]?.[type];
      if (rawVal === undefined) return;

      // Clamp to 0-100
      let num = parseFloat(rawVal);
      if (isNaN(num)) {
        setLocalEdits((prev) => {
          const next = { ...prev };
          if (next[studentId]) { const copy = { ...next[studentId] }; delete copy[type]; next[studentId] = copy; }
          return next;
        });
        return;
      }
      if (num > 100) { num = 100; setLocalEdits((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [type]: '100' } })); }
      if (num < 0)   { num = 0;   setLocalEdits((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [type]: '0' } })); }

      const cellKey = `${studentId}:${type}`;
      setSaveStates((prev) => ({ ...prev, [cellKey]: 'saving' }));

      // Deviation check
      const avg = classAverages[type];
      if (avg !== null && Math.abs(num - avg) > DEVIATION_THRESHOLD) {
        const direction = num > avg ? 'above' : 'below';
        // Non-blocking: just log a mark_note (fire-and-forget)
        supabase.from('mark_notes').insert({
          school_id:  user?.schoolId,
          note_type:  'deviation_warning',
          note_text:  `Mark ${num} is ${direction} class average ${avg} by ${Math.abs(num - avg)} points.`,
          created_by: user?.staffId,
        } as any).then(() => {});
      }

      const student = students.find((s) => s.id === studentId);
      const existingMark = (student as any)?.[type];

      try {
        await updateMark.mutateAsync({
          studentId,
          subjectId:      detail!.subject_id,
          streamId:       detail!.stream_id,
          semesterId:     detail!.semester_id,
          assessmentType: type,
          value:          num,
          enteredBy:      user!.staffId!,
          oldValue:       existingMark?.value ?? null,
          markId:         existingMark?.id,
        });
        haptics.selection();
        setSaveStates((prev) => ({ ...prev, [cellKey]: 'saved' }));
        setTimeout(() => {
          setSaveStates((prev) => ({ ...prev, [cellKey]: 'idle' }));
        }, 2000);
      } catch {
        haptics.error();
        setSaveStates((prev) => ({ ...prev, [cellKey]: 'error' }));
      }
    },
    [localEdits, classAverages, students, detail, user, updateMark],
  );

  const handleExcuse = useCallback(
    (studentId: string, currentlyExcused: boolean) => {
      if (currentlyExcused) {
        // Only admin can remove N/A — show message
        Alert.alert('Contact Admin', 'Only an Admin can remove the N/A designation from a mark.');
        return;
      }
      Alert.alert(
        'Mark as N/A (Excused)?',
        'This will mark all assessment components for this student as excused (N/A). Enter a reason.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark N/A',
            onPress: () => {
              Alert.prompt(
                'Reason',
                'Required — why is this student excused?',
                (reason) => {
                  if (!reason?.trim()) return;
                  haptics.medium();
                  excuseMark.mutate({
                    studentId,
                    subjectId:  detail!.subject_id,
                    streamId:   detail!.stream_id,
                    semesterId: detail!.semester_id,
                    enteredBy:  user!.staffId!,
                    isExcused:  true,
                    reason,
                  });
                },
                'plain-text',
              );
            },
          },
        ],
      );
    },
    [detail, user, excuseMark],
  );

  // Refs for keyboard navigation: fa1_idx → fa2_idx → sum_idx → fa1_(idx+1) → ...
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const getNextRef = useCallback(
    (studentId: string, type: string): TextInput | null => {
      const idx = students.findIndex((s) => s.id === studentId);
      if (isIGCSE) {
        // Next student summative
        if (idx + 1 < students.length) return inputRefs.current[`${students[idx + 1].id}:summative`] ?? null;
        return null;
      }
      const typeOrder = ['fa1', 'fa2', 'summative'];
      const typeIdx = typeOrder.indexOf(type);
      if (typeIdx < 2) return inputRefs.current[`${studentId}:${typeOrder[typeIdx + 1]}`] ?? null;
      if (idx + 1 < students.length) return inputRefs.current[`${students[idx + 1].id}:fa1`] ?? null;
      return null;
    },
    [students, isIGCSE],
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load marks" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const avgForBanner = isIGCSE ? classAverages.summative : (() => {
    const avgs = ['fa1', 'fa2', 'summative'].map((t) => classAverages[t]).filter((v): v is number => v !== null);
    return avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length * 10) / 10 : null;
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={detail?.subjectName ?? '—'}
          subtitle={`${detail?.streamName ?? '—'} · ${detail?.semesterName ?? '—'}`}
          showBack
          right={
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(app)/(st)/marks-import', params: { assignmentId: params.assignmentId } } as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={colors.brand.primary} />
            </TouchableOpacity>
          }
        />

        {/* Window banner */}
        <MarksWindowBanner isOpen={isWindowOpen} />

        {/* Class average banner */}
        {!assignLoading && !marksLoading && (
          <ClassAverageBanner
            average={avgForBanner}
            entered={enteredCount}
            total={students.length}
          />
        )}

        {/* Column headers */}
        {!marksLoading && students.length > 0 && (
          <View style={[styles.colHeader, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
            <ThemedText variant="label" color="muted" style={styles.nameColHeader}>STUDENT</ThemedText>
            {!isIGCSE && <>
              <ThemedText variant="label" color="muted" style={styles.markColHeader}>FA 1</ThemedText>
              <ThemedText variant="label" color="muted" style={styles.markColHeader}>FA 2</ThemedText>
            </>}
            <ThemedText variant="label" color="muted" style={styles.markColHeader}>SUM</ThemedText>
            <ThemedText variant="label" color="muted" style={styles.totalColHeader}>TOT</ThemedText>
            <ThemedText variant="label" color="muted" style={styles.gradeColHeader}>GRD</ThemedText>
          </View>
        )}

        {marksLoading || assignLoading ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={36} height={36} radius={18} />
                <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                  <Skeleton width="50%" height={13} />
                  <Skeleton width="30%" height={10} />
                </View>
                <Skeleton width={48} height={32} radius={Radius.md} />
                {!isIGCSE && <Skeleton width={48} height={32} radius={Radius.md} style={{ marginLeft: 6 }} />}
                <Skeleton width={48} height={32} radius={Radius.md} style={{ marginLeft: 6 }} />
              </View>
            ))}
          </View>
        ) : students.length === 0 ? (
          <EmptyState title="No students" description="No active students in this class." />
        ) : (
          <FlatList
            data={students}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: student }) => {
              const isExcused = isExcusedStudent(student);

              // Compute current values (local edit takes priority over server)
              const getValue = (type: string) => {
                const local = localEdits[student.id]?.[type];
                if (local !== undefined) return local;
                const server = (student as any)[type]?.value;
                return server !== null && server !== undefined ? String(server) : '';
              };

              const fa1Val  = getValue('fa1');
              const fa2Val  = getValue('fa2');
              const sumVal  = getValue('summative');

              const totalNum = computeTotal(
                fa1Val ? parseFloat(fa1Val) : null,
                fa2Val ? parseFloat(fa2Val) : null,
                sumVal ? parseFloat(sumVal) : null,
                isIGCSE,
              );
              const grade = isExcused ? 'N/A' : getGradeLabel(totalNum, gradingScales);

              const renderInput = (type: string, val: string) => {
                const cellKey = `${student.id}:${type}`;
                const saveState = saveStates[cellKey] ?? 'idle';
                const avg = classAverages[type];
                const numVal = parseFloat(val);
                const hasDeviation = !isNaN(numVal) && avg !== null && Math.abs(numVal - avg) > DEVIATION_THRESHOLD;

                return (
                  <View key={type} style={styles.inputWrap}>
                    <TextInput
                      ref={(r) => { inputRefs.current[cellKey] = r; }}
                      value={isExcused ? '' : val}
                      onChangeText={(v) => {
                        if (!isWindowOpen || isExcused) return;
                        const clean = v.replace(/[^0-9.]/g, '');
                        setLocalEdits((prev) => ({
                          ...prev,
                          [student.id]: { ...prev[student.id], [type]: clean },
                        }));
                      }}
                      onBlur={() => { if (isWindowOpen && !isExcused) handleBlur(student.id, type); }}
                      onSubmitEditing={() => {
                        if (isWindowOpen && !isExcused) handleBlur(student.id, type);
                        getNextRef(student.id, type)?.focus();
                      }}
                      placeholder={isExcused ? 'N/A' : '—'}
                      placeholderTextColor={isExcused ? colors.brand.primary : colors.textMuted}
                      keyboardType="decimal-pad"
                      returnKeyType={getNextRef(student.id, type) ? 'next' : 'done'}
                      editable={isWindowOpen && !isExcused}
                      style={[
                        styles.markInput,
                        {
                          color: colors.textPrimary,
                          backgroundColor: isExcused
                            ? colors.brand.primary + '14'
                            : !isWindowOpen
                            ? colors.surfaceSecondary
                            : val
                            ? colors.surface
                            : colors.surfaceSecondary,
                          borderColor:
                            saveState === 'error'
                              ? Colors.semantic.warning
                              : saveState === 'saved'
                              ? Colors.semantic.success
                              : val && isWindowOpen
                              ? colors.brand.primary + '80'
                              : colors.border,
                        },
                      ]}
                    />
                    {/* Save micro-indicator */}
                    {saveState === 'saved' && (
                      <View style={styles.saveIndicator}>
                        <Ionicons name="checkmark-circle" size={10} color={Colors.semantic.success} />
                      </View>
                    )}
                    {saveState === 'error' && (
                      <TouchableOpacity
                        style={styles.saveIndicator}
                        onPress={() => handleBlur(student.id, type)}
                      >
                        <Ionicons name="refresh-circle" size={10} color={Colors.semantic.warning} />
                      </TouchableOpacity>
                    )}
                    {/* Deviation warning */}
                    {hasDeviation && saveState === 'idle' && (
                      <Ionicons
                        name="warning-outline"
                        size={10}
                        color={Colors.semantic.warning}
                        style={styles.deviationIcon}
                      />
                    )}
                  </View>
                );
              };

              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onLongPress={() => handleExcuse(student.id, isExcused)}
                  delayLongPress={500}
                  style={[styles.studentRow, { backgroundColor: colors.surface, borderColor: isExcused ? colors.brand.primary + '40' : colors.border }]}
                >
                  {/* Avatar + name */}
                  <View style={styles.nameCol}>
                    <Avatar name={student.full_name} photoUrl={student.photo_url} size={34} />
                    <View style={styles.nameText}>
                      <ThemedText variant="bodySm" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {student.full_name}
                      </ThemedText>
                      <ThemedText variant="caption" color="muted">{student.student_number}</ThemedText>
                    </View>
                  </View>

                  {/* Mark inputs */}
                  {!isIGCSE && renderInput('fa1', fa1Val)}
                  {!isIGCSE && renderInput('fa2', fa2Val)}
                  {renderInput('summative', sumVal)}

                  {/* Total */}
                  <View style={styles.totalCol}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '700', color: totalNum !== null ? colors.textPrimary : colors.textMuted }}>
                      {totalNum !== null ? String(totalNum) : '—'}
                    </ThemedText>
                  </View>

                  {/* Grade */}
                  <View style={[styles.gradeCol, { backgroundColor: grade === '—' ? 'transparent' : colors.brand.primary + '18' }]}>
                    <ThemedText
                      variant="label"
                      style={{
                        fontWeight: '800',
                        fontSize: 12,
                        color: grade === 'N/A' ? colors.brand.primary : grade !== '—' ? colors.brand.primary : colors.textMuted,
                      }}
                    >
                      {grade}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameColHeader: { flex: 1, fontSize: 10 },
  markColHeader: { width: 52, textAlign: 'center', fontSize: 10 },
  totalColHeader: { width: 38, textAlign: 'center', fontSize: 10 },
  gradeColHeader: { width: 32, textAlign: 'center', fontSize: 10 },
  skeletonList: { padding: Spacing.base, gap: Spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  list: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 80 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  nameCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  nameText: { flex: 1, gap: 1, minWidth: 0 },
  inputWrap: { width: 52, position: 'relative' },
  markInput: {
    width: 48,
    height: 34,
    borderRadius: Radius.md,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  saveIndicator: {
    position: 'absolute',
    top: -4,
    right: -2,
  },
  deviationIcon: {
    position: 'absolute',
    bottom: -4,
    right: -2,
  },
  totalCol: {
    width: 38,
    alignItems: 'center',
  },
  gradeCol: {
    width: 32,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
