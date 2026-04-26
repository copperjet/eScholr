/**
 * HRT Report Approve Screen
 * One student at a time. Validates marks complete + CREED entered.
 * Saves comment, locks marks + CREED, submits for admin approval.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Badge, Skeleton, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  useApproveReport, STATUS_META, type ReportSummary,
} from '../../../hooks/useReports';
import { useMarksCompletionForStream } from '../../../hooks/useReports';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

function useReportDetail(reportId: string, schoolId: string) {
  return useQuery<ReportSummary | null>({
    queryKey: ['report-detail', reportId, schoolId],
    enabled: !!reportId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('reports')
        .select(`id, status, hrt_comment, overall_percentage, class_position, pdf_url, released_at, updated_at,
                 students ( id, full_name, student_number, photo_url ),
                 semesters ( id, name )`)
        .eq('id', reportId)
        .eq('school_id', schoolId)
        .single();
      if (!data) return null;
      return {
        id: data.id,
        status: data.status,
        hrt_comment: data.hrt_comment ?? null,
        overall_percentage: data.overall_percentage ?? null,
        class_position: data.class_position ?? null,
        pdf_url: data.pdf_url ?? null,
        released_at: data.released_at ?? null,
        updated_at: data.updated_at,
        student: {
          id: data.students?.id ?? '',
          full_name: data.students?.full_name ?? '—',
          student_number: data.students?.student_number ?? '',
          photo_url: data.students?.photo_url ?? null,
        },
        semester: data.semesters ? { id: data.semesters.id, name: data.semesters.name } : null,
      };
    },
  });
}

function useStudentMarksComplete(
  studentId: string | null,
  semesterId: string | null,
  schoolId: string,
) {
  return useQuery<boolean>({
    queryKey: ['student-marks-complete', studentId, semesterId, schoolId],
    enabled: !!studentId && !!semesterId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      // Get all subjects assigned for this student's stream
      const { data: student } = await db
        .from('students')
        .select('stream_id')
        .eq('id', studentId!)
        .single();
      if (!student?.stream_id) return false;

      const [assignmentsRes, marksRes] = await Promise.all([
        db.from('subject_teacher_assignments')
          .select('subject_id')
          .eq('stream_id', student.stream_id)
          .eq('semester_id', semesterId!)
          .eq('school_id', schoolId),
        db.from('marks')
          .select('subject_id')
          .eq('student_id', studentId!)
          .eq('semester_id', semesterId!)
          .eq('school_id', schoolId)
          .not('value', 'is', null),
      ]);

      const assignedSubjects = new Set(
        ((assignmentsRes.data ?? []) as any[]).map((a: any) => a.subject_id),
      );
      const enteredSubjects = new Set(
        ((marksRes.data ?? []) as any[]).map((m: any) => m.subject_id),
      );
      return assignedSubjects.size > 0 &&
        [...assignedSubjects].every((s) => enteredSubjects.has(s));
    },
  });
}

function useStudentCreedComplete(
  studentId: string | null,
  semesterId: string | null,
  schoolId: string,
) {
  return useQuery<boolean>({
    queryKey: ['student-creed-complete', studentId, semesterId, schoolId],
    enabled: !!studentId && !!semesterId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('character_records')
        .select('id, creativity, respect, excellence, empathy, discipline')
        .eq('student_id', studentId!)
        .eq('semester_id', semesterId!)
        .eq('school_id', schoolId)
        .single();
      if (!data) return false;
      return ['creativity', 'respect', 'excellence', 'empathy', 'discipline'].every(
        (k) => !!data[k],
      );
    },
  });
}

export default function ReportsApproveScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: report, isLoading, isError, refetch } = useReportDetail(reportId ?? '', schoolId);
  const semesterId = report?.semester?.id ?? null;
  const studentId = report?.student?.id ?? null;

  const { data: marksComplete } = useStudentMarksComplete(studentId, semesterId, schoolId);
  const { data: creedComplete } = useStudentCreedComplete(studentId, semesterId, schoolId);

  const approveMutation = useApproveReport(schoolId);
  const [comment, setComment] = useState(report?.hrt_comment ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Sync comment when report loads
  React.useEffect(() => {
    if (report?.hrt_comment && !comment) setComment(report.hrt_comment);
  }, [report?.hrt_comment]);

  const canApprove = marksComplete && creedComplete && comment.trim().length >= 10;

  const handleApprove = useCallback(async () => {
    if (!report || !canApprove) return;
    Alert.alert(
      'Submit for Approval',
      `Submit ${report.student.full_name}'s report? This will lock all marks and CREED entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            haptics.medium();
            try {
              await approveMutation.mutateAsync({
                reportId: report.id,
                hrtComment: comment.trim(),
                staffId: user!.staffId!,
              });
              haptics.success();
              router.back();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not submit report. Try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }, [report, canApprove, comment, approveMutation, user]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load report" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const isEditable = report?.status === 'draft';
  const statusMeta = report ? (STATUS_META[report.status] ?? STATUS_META.draft) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={isLoading ? '—' : report?.student.full_name ?? '—'} showBack />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isLoading ? (
            <View style={{ gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={60} radius={Radius.lg} />)}
            </View>
          ) : report ? (
            <>
              {/* Student card */}
              <View style={[styles.studentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Avatar name={report.student.full_name} photoUrl={report.student.photo_url} size={48} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <ThemedText variant="body" style={{ fontWeight: '700' }}>{report.student.full_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">{report.student.student_number} · {report.semester?.name ?? '—'}</ThemedText>
                  {report.overall_percentage !== null && (
                    <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '600' }}>
                      {report.overall_percentage.toFixed(1)}%
                      {report.class_position ? ` · Position #${report.class_position}` : ''}
                    </ThemedText>
                  )}
                </View>
                {statusMeta && <Badge label={statusMeta.label} preset={statusMeta.preset} />}
              </View>

              {/* Readiness checks */}
              <View style={{ gap: 8 }}>
                <ReadinessRow
                  label="Marks complete"
                  ok={marksComplete ?? false}
                  colors={colors}
                  onFix={() => router.push('/(app)/(hrt)/marks' as any)}
                />
                <ReadinessRow
                  label="CREED entered"
                  ok={creedComplete ?? false}
                  colors={colors}
                  onFix={() => router.push('/(app)/(hrt)/creed' as any)}
                />
              </View>

              {/* HRT Comment */}
              <View>
                <View style={styles.commentLabel}>
                  <ThemedText variant="label" color="muted" style={{ fontSize: 11 }}>
                    CLASS TEACHER COMMENT
                  </ThemedText>
                  <ThemedText
                    variant="caption"
                    style={{
                      color: comment.length > 500 ? Colors.semantic.warning : colors.textMuted,
                    }}
                  >
                    {comment.length}/600
                  </ThemedText>
                </View>
                <TextInput
                  value={comment}
                  onChangeText={(t) => { if (t.length <= 600) setComment(t); }}
                  placeholder="Write your class teacher comment (min 10 characters)…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={5}
                  editable={isEditable}
                  style={[
                    styles.commentInput,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: comment.trim().length > 0 && comment.trim().length < 10
                        ? Colors.semantic.error
                        : colors.border,
                    },
                  ]}
                />
                {comment.trim().length > 0 && comment.trim().length < 10 && (
                  <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: 4 }}>
                    Minimum 10 characters required.
                  </ThemedText>
                )}
              </View>

              {/* PDF preview link */}
              {report.pdf_url && (
                <TouchableOpacity
                  onPress={() => {
                    haptics.light();
                    router.push({
                      pathname: '/(app)/report-viewer' as any,
                      params: {
                        report_id: report.id,
                        pdf_url: report.pdf_url!,
                        student_name: report.student.full_name,
                        is_draft: report.status !== 'released' ? 'true' : 'false',
                      },
                    });
                  }}
                  style={[styles.previewBtn, { borderColor: colors.brand.primary }]}
                >
                  <Ionicons name="document-text-outline" size={16} color={colors.brand.primary} />
                  <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600', marginLeft: 8 }}>
                    Preview PDF
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Approve button */}
              {isEditable && (
                <TouchableOpacity
                  onPress={handleApprove}
                  disabled={!canApprove || submitting}
                  style={[
                    styles.approveBtn,
                    {
                      backgroundColor: canApprove ? colors.brand.primary : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Ionicons
                    name={submitting ? 'hourglass-outline' : 'checkmark-circle-outline'}
                    size={20}
                    color={canApprove ? '#fff' : colors.textMuted}
                  />
                  <ThemedText
                    variant="body"
                    style={{
                      color: canApprove ? '#fff' : colors.textMuted,
                      fontWeight: '700',
                      marginLeft: 10,
                    }}
                  >
                    {submitting ? 'Submitting…' : 'Submit for Approval'}
                  </ThemedText>
                </TouchableOpacity>
              )}

              {!isEditable && (
                <View style={[styles.lockedBanner, { backgroundColor: Colors.semantic.infoLight ?? Colors.semantic.info + '20' }]}>
                  <Ionicons name="information-circle" size={16} color={Colors.semantic.info} />
                  <ThemedText variant="bodySm" style={{ color: Colors.semantic.info, marginLeft: 8, flex: 1 }}>
                    This report has been submitted and is awaiting admin approval.
                  </ThemedText>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReadinessRow({
  label,
  ok,
  colors,
  onFix,
}: {
  label: string;
  ok: boolean;
  colors: any;
  onFix: () => void;
}) {
  return (
    <View style={[
      styles.readinessRow,
      {
        backgroundColor: ok ? Colors.semantic.successLight : Colors.semantic.errorLight,
        borderColor: ok ? Colors.semantic.success + '40' : Colors.semantic.error + '40',
      },
    ]}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'close-circle'}
        size={18}
        color={ok ? Colors.semantic.success : Colors.semantic.error}
      />
      <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: 8, color: ok ? Colors.semantic.success : Colors.semantic.error }}>
        {label}
      </ThemedText>
      {!ok && (
        <TouchableOpacity onPress={onFix}>
          <ThemedText variant="label" style={{ color: Colors.semantic.error, fontWeight: '700', fontSize: 11 }}>
            FIX →
          </ThemedText>
        </TouchableOpacity>
      )}
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
  content: { padding: Spacing.base, gap: 16, paddingBottom: 60 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  commentLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentInput: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    padding: 12,
    minHeight: 110,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: Radius.lg,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.md,
  },
});
