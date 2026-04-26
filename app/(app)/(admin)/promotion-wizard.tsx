/**
 * Year-End Promotion Wizard
 * 4 steps: select target semester → review students → assign outcomes → confirm & run.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Avatar, BottomSheet, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  useStudentsForPromotion,
  useSemesters,
  useRunPromotion,
  type StudentPromotionRecord,
  type PromotionOutcome,
} from '../../../hooks/useAdmin';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type Step = 1 | 2 | 3 | 4;

const OUTCOME_META: Record<PromotionOutcome, { label: string; color: string; icon: string; description: string }> = {
  promote:  { label: 'Promote',  color: Colors.semantic.success, icon: 'arrow-up-circle-outline', description: 'Move to next grade' },
  repeat:   { label: 'Repeat',   color: Colors.semantic.warning, icon: 'refresh-circle-outline',  description: 'Stay in current grade' },
  graduate: { label: 'Graduate', color: Colors.semantic.info,    icon: 'school-outline',           description: 'Exit school roll' },
};

function useNextStreams(schoolId: string) {
  return useQuery({
    queryKey: ['streams-next', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('streams')
        .select('id, name, grades ( id, name )')
        .eq('school_id', schoolId)
        .order('name');
      return (data ?? []) as any[];
    },
  });
}

function StepIndicator({ current }: { current: Step }) {
  const { colors } = useTheme();
  const steps = [
    { n: 1, label: 'Semester' },
    { n: 2, label: 'Students' },
    { n: 3, label: 'Outcomes' },
    { n: 4, label: 'Confirm' },
  ];
  return (
    <View style={stepStyles.row}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <View style={stepStyles.step}>
            <View style={[
              stepStyles.circle,
              { backgroundColor: s.n <= current ? colors.brand.primary : colors.surfaceSecondary, borderColor: s.n <= current ? colors.brand.primary : colors.border },
            ]}>
              {s.n < current
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <ThemedText variant="caption" style={{ color: s.n <= current ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 11 }}>{s.n}</ThemedText>
              }
            </View>
            <ThemedText variant="caption" style={{ color: s.n <= current ? colors.brand.primary : colors.textMuted, fontSize: 10, marginTop: 4 }}>
              {s.label}
            </ThemedText>
          </View>
          {i < steps.length - 1 && (
            <View style={[stepStyles.line, { backgroundColor: s.n < current ? colors.brand.primary : colors.border }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  step: { alignItems: 'center', width: 54 },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  line: { flex: 1, height: 1.5, marginTop: 13 },
});

export default function PromotionWizardScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [step, setStep] = useState<Step>(1);
  const [targetSemesterId, setTargetSemesterId] = useState('');
  const [records, setRecords] = useState<StudentPromotionRecord[]>([]);
  const [sheetStudent, setSheetStudent] = useState<StudentPromotionRecord | null>(null);
  const [streamPickStudentId, setStreamPickStudentId] = useState<string | null>(null);

  const { data: semesters = [], isLoading: semLoading } = useSemesters(schoolId);
  const { data: students = [], isLoading: studLoading, isError: studError, refetch: studRefetch } = useStudentsForPromotion(schoolId);
  const { data: streams = [] } = useNextStreams(schoolId);
  const runMutation = useRunPromotion(schoolId);

  // Populate records from students when entering step 2
  const initRecords = useCallback(() => {
    setRecords(students.map((s) => ({ ...s, outcome: null, target_stream_id: null })));
  }, [students]);

  const setOutcome = useCallback((studentId: string, outcome: PromotionOutcome) => {
    setRecords((prev) => prev.map((r) => r.student_id === studentId ? { ...r, outcome } : r));
  }, []);

  const setTargetStream = useCallback((studentId: string, streamId: string) => {
    setRecords((prev) => prev.map((r) => r.student_id === studentId ? { ...r, target_stream_id: streamId } : r));
  }, []);

  const summary = useMemo(() => ({
    promote:  records.filter((r) => r.outcome === 'promote').length,
    repeat:   records.filter((r) => r.outcome === 'repeat').length,
    graduate: records.filter((r) => r.outcome === 'graduate').length,
    unset:    records.filter((r) => !r.outcome).length,
  }), [records]);

  const handleRunPromotion = async () => {
    if (summary.unset > 0) {
      Alert.alert('Unassigned students', `${summary.unset} students have no outcome. Assign an outcome for all students before continuing.`);
      return;
    }
    Alert.alert(
      'Run Year-End Promotion',
      `Promote ${summary.promote}, graduate ${summary.graduate}, repeat ${summary.repeat} students?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Promotion',
          style: 'destructive',
          onPress: async () => {
            haptics.medium();
            try {
              await runMutation.mutateAsync({
                records,
                newSemesterId: targetSemesterId,
                staffId: user!.staffId!,
              });
              haptics.success();
              Alert.alert(
                'Promotion Complete',
                `✓ ${summary.promote} promoted\n✓ ${summary.graduate} graduated\n✓ ${summary.repeat} repeating`,
                [{ text: 'Done', onPress: () => router.back() }],
              );
            } catch (e: any) {
              haptics.error();
              Alert.alert('Error', e.message ?? 'Could not run promotion. Try again.');
            }
          },
        },
      ],
    );
  };

  if (studError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load students" description="Try again." onRetry={studRefetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Promotion Wizard"
        showBack
        onBack={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.back()}
      />

      <StepIndicator current={step} />

      {/* ── Step 1: Select target semester ── */}
      {step === 1 && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText variant="body" color="secondary" style={{ marginBottom: Spacing.base, lineHeight: 22 }}>
            Select the semester students will be enrolled in after promotion. This is typically your next academic term.
          </ThemedText>

          {semLoading ? (
            <View style={{ gap: Spacing.md }}>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} width="100%" height={60} radius={Radius.lg} />)}
            </View>
          ) : (
            semesters
              .filter((s) => !s.is_active)
              .map((sem) => (
                <TouchableOpacity
                  key={sem.id}
                  onPress={() => setTargetSemesterId(sem.id)}
                  style={[
                    styles.semOption,
                    {
                      backgroundColor: targetSemesterId === sem.id ? colors.brand.primary + '12' : colors.surfaceSecondary,
                      borderColor: targetSemesterId === sem.id ? colors.brand.primary : colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={{ fontWeight: '700', color: targetSemesterId === sem.id ? colors.brand.primary : colors.textPrimary }}>
                      {sem.name}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">Academic Year {sem.academic_year}</ThemedText>
                  </View>
                  {targetSemesterId === sem.id && <Ionicons name="checkmark-circle" size={20} color={colors.brand.primary} />}
                </TouchableOpacity>
              ))
          )}

          {!semLoading && semesters.filter((s) => !s.is_active).length === 0 && (
            <View style={[styles.warningBox, { backgroundColor: Colors.semantic.warning + '12', borderColor: Colors.semantic.warning + '40' }]}>
              <Ionicons name="warning-outline" size={16} color={Colors.semantic.warning} />
              <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, flex: 1, marginLeft: 8 }}>
                No inactive semesters found. Create a new semester first before running promotion.
              </ThemedText>
            </View>
          )}

          <TouchableOpacity
            onPress={() => { haptics.medium(); setStep(2); initRecords(); }}
            disabled={!targetSemesterId}
            style={[styles.nextBtn, { backgroundColor: targetSemesterId ? colors.brand.primary : colors.border }]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>Next: Review Students</ThemedText>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 2: Review students ── */}
      {step === 2 && (
        <>
          <View style={[styles.summaryBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <ThemedText variant="caption" color="muted">
              {students.length} active students · tap each to assign outcome
            </ThemedText>
          </View>
          {studLoading ? (
            <View style={{ padding: Spacing.base, gap: Spacing.md }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width={40} height={40} radius={20} />
                  <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                    <Skeleton width="50%" height={13} />
                    <Skeleton width="35%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <FlatList
              data={records}
              keyExtractor={(r) => r.student_id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: rec }) => {
                const outcomeMeta = rec.outcome ? OUTCOME_META[rec.outcome] : null;
                return (
                  <TouchableOpacity
                    onPress={() => { haptics.selection(); setSheetStudent(rec); }}
                    activeOpacity={0.8}
                    style={[styles.studentRow, { backgroundColor: colors.surface, borderColor: outcomeMeta ? outcomeMeta.color + '40' : colors.border }]}
                  >
                    <Avatar name={rec.full_name} photoUrl={rec.photo_url} size={40} />
                    <View style={{ flex: 1, marginLeft: Spacing.md }}>
                      <ThemedText variant="body" style={{ fontWeight: '600' }}>{rec.full_name}</ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {rec.grade_name} · {rec.stream_name}
                        {rec.overall_percentage !== null ? ` · ${rec.overall_percentage.toFixed(1)}%` : ''}
                      </ThemedText>
                    </View>
                    {outcomeMeta ? (
                      <View style={[styles.outcomeChip, { backgroundColor: outcomeMeta.color + '15', borderColor: outcomeMeta.color + '40' }]}>
                        <Ionicons name={outcomeMeta.icon as any} size={12} color={outcomeMeta.color} />
                        <ThemedText variant="caption" style={{ color: outcomeMeta.color, fontWeight: '700', fontSize: 10, marginLeft: 3 }}>
                          {outcomeMeta.label}
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.outcomeChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                        <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 10 }}>Unset</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { haptics.medium(); setStep(3); }}
              style={[styles.nextBtn, { backgroundColor: colors.brand.primary, margin: 0, flex: 1 }]}
            >
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>Next: Summary</ThemedText>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Step 3: Outcome summary ── */}
      {step === 3 && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summaryGrid}>
            {(Object.entries(OUTCOME_META) as [PromotionOutcome, typeof OUTCOME_META[PromotionOutcome]][]).map(([key, meta]) => (
              <View key={key} style={[styles.summaryCard, { backgroundColor: meta.color + '12', borderColor: meta.color + '30' }]}>
                <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                <ThemedText variant="h3" style={{ color: meta.color, marginTop: 4 }}>
                  {summary[key]}
                </ThemedText>
                <ThemedText variant="caption" style={{ color: meta.color + 'CC' }}>{meta.label}</ThemedText>
              </View>
            ))}
            <View style={[styles.summaryCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
              <ThemedText variant="h3" style={{ color: colors.textMuted, marginTop: 4 }}>{summary.unset}</ThemedText>
              <ThemedText variant="caption" color="muted">Unset</ThemedText>
            </View>
          </View>

          {summary.unset > 0 && (
            <View style={[styles.warningBox, { backgroundColor: Colors.semantic.warning + '12', borderColor: Colors.semantic.warning + '40' }]}>
              <Ionicons name="warning-outline" size={16} color={Colors.semantic.warning} />
              <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, flex: 1, marginLeft: 8 }}>
                {summary.unset} student{summary.unset !== 1 ? 's have' : ' has'} no outcome. Go back to assign them.
              </ThemedText>
            </View>
          )}

          <View style={[styles.infoBox, { backgroundColor: Colors.semantic.error + '08', borderColor: Colors.semantic.error + '30' }]}>
            <Ionicons name="alert-circle-outline" size={14} color={Colors.semantic.error} />
            <ThemedText variant="caption" style={{ color: Colors.semantic.error, flex: 1, marginLeft: 6, lineHeight: 16 }}>
              This action is irreversible. Graduated students will be deactivated. Promoted students will move to their new stream. All changes are audit-logged.
            </ThemedText>
          </View>

          <TouchableOpacity
            onPress={() => { haptics.medium(); setStep(4); }}
            disabled={summary.unset > 0}
            style={[styles.nextBtn, { backgroundColor: summary.unset === 0 ? colors.brand.primary : colors.border }]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>Review & Confirm</ThemedText>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 4: Final confirmation ── */}
      {step === 4 && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText variant="body" color="secondary" style={{ marginBottom: Spacing.base, lineHeight: 22 }}>
            Review the final list before running. Tap "Run Promotion" to execute all changes.
          </ThemedText>

          {(Object.entries(OUTCOME_META) as [PromotionOutcome, typeof OUTCOME_META[PromotionOutcome]][]).map(([outcome, meta]) => {
            const group = records.filter((r) => r.outcome === outcome);
            if (!group.length) return null;
            return (
              <View key={outcome} style={{ marginBottom: Spacing.base }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  <ThemedText variant="label" style={{ color: meta.color, fontWeight: '700', fontSize: 11 }}>
                    {meta.label.toUpperCase()} ({group.length})
                  </ThemedText>
                </View>
                {group.map((rec) => (
                  <View key={rec.student_id} style={[styles.confirmRow, { backgroundColor: colors.surface, borderColor: meta.color + '30' }]}>
                    <Avatar name={rec.full_name} photoUrl={rec.photo_url} size={32} />
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{rec.full_name}</ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {rec.grade_name} · {rec.stream_name}
                        {outcome === 'promote' && rec.target_stream_id
                          ? ` → ${streams.find((s: any) => s.id === rec.target_stream_id)?.grades?.name ?? ''} ${streams.find((s: any) => s.id === rec.target_stream_id)?.name ?? ''}`
                          : ''}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}

          <TouchableOpacity
            onPress={handleRunPromotion}
            disabled={runMutation.isPending}
            style={[styles.runBtn, { backgroundColor: runMutation.isPending ? colors.border : Colors.semantic.error }]}
          >
            <Ionicons name="flash-outline" size={18} color="#fff" />
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
              {runMutation.isPending ? 'Running…' : 'Run Promotion'}
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Outcome assignment sheet */}
      <BottomSheet
        visible={!!sheetStudent}
        onClose={() => setSheetStudent(null)}
        title={sheetStudent?.full_name ?? ''}
        snapHeight={380}
      >
        {sheetStudent && (
          <View style={{ gap: Spacing.sm }}>
            <ThemedText variant="caption" color="muted">
              {sheetStudent.grade_name} · {sheetStudent.stream_name}
              {sheetStudent.overall_percentage !== null ? ` · ${sheetStudent.overall_percentage.toFixed(1)}%` : ''}
            </ThemedText>

            {(Object.entries(OUTCOME_META) as [PromotionOutcome, typeof OUTCOME_META[PromotionOutcome]][]).map(([key, meta]) => {
              const current = records.find((r) => r.student_id === sheetStudent.student_id);
              const isSelected = current?.outcome === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setOutcome(sheetStudent.student_id, key);
                    if (key !== 'promote') setSheetStudent(null);
                    else setStreamPickStudentId(sheetStudent.student_id);
                  }}
                  style={[
                    styles.outcomeOption,
                    { backgroundColor: isSelected ? meta.color + '18' : colors.surfaceSecondary, borderColor: isSelected ? meta.color : colors.border },
                  ]}
                >
                  <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <ThemedText variant="body" style={{ fontWeight: '700', color: isSelected ? meta.color : colors.textPrimary }}>
                      {meta.label}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">{meta.description}</ThemedText>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={18} color={meta.color} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </BottomSheet>

      {/* Stream picker for promote */}
      <BottomSheet
        visible={!!streamPickStudentId}
        onClose={() => { setStreamPickStudentId(null); setSheetStudent(null); }}
        title="Select Target Stream"
        snapHeight={420}
      >
        <ThemedText variant="bodySm" color="secondary" style={{ marginBottom: Spacing.md }}>
          Choose the stream this student will move to after promotion.
        </ThemedText>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
          {streams.map((stream: any) => {
            const rec = records.find((r) => r.student_id === streamPickStudentId);
            const isSelected = rec?.target_stream_id === stream.id;
            return (
              <TouchableOpacity
                key={stream.id}
                onPress={() => {
                  if (streamPickStudentId) {
                    setTargetStream(streamPickStudentId, stream.id);
                    setStreamPickStudentId(null);
                    setSheetStudent(null);
                  }
                }}
                style={[
                  styles.streamOption,
                  { backgroundColor: isSelected ? colors.brand.primary + '12' : colors.surfaceSecondary, borderColor: isSelected ? colors.brand.primary : colors.border },
                ]}
              >
                <ThemedText variant="body" style={{ flex: 1, fontWeight: isSelected ? '700' : '400', color: isSelected ? colors.brand.primary : colors.textPrimary }}>
                  {stream.grades?.name} · {stream.name}
                </ThemedText>
                {isSelected && <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheet>
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
  scroll: { padding: Spacing.base, paddingBottom: 40 },
  summaryBar: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 100 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  outcomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: Spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 2,
  },
  semOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.base,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.base,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  outcomeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  streamOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
