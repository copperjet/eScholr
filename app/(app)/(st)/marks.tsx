/**
 * ST Marks Overview — tab screen
 * Shows all subject/stream assignments with entry progress.
 * Tap any card → marks-entry screen for that assignment.
 */
import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, ProgressBar, Badge, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { MarksWindowBanner } from '../../../components/modules/MarksWindowBanner';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

function useSTAssignmentsOverview(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['st-assignments-overview', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data: assignments, error } = await (supabase as any)
        .from('subject_teacher_assignments')
        .select(`
          id, subject_id, stream_id, semester_id,
          subjects ( name ),
          streams ( name, grades ( name, school_sections ( name ) ) ),
          semesters ( name, is_active, marks_window_open )
        `)
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId);
      if (error) throw error;

      const asgns = (assignments ?? []) as any[];
      if (asgns.length === 0) return [];

      const streamIds  = [...new Set(asgns.map((a: any) => a.stream_id))];
      const subjectIds = [...new Set(asgns.map((a: any) => a.subject_id))];
      const semIds     = [...new Set(asgns.map((a: any) => a.semester_id))];

      const [studentsRes, marksRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, stream_id')
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .in('stream_id', streamIds),
        supabase
          .from('marks')
          .select('student_id, subject_id, stream_id, semester_id, value')
          .eq('school_id', schoolId)
          .in('semester_id', semIds)
          .in('subject_id', subjectIds)
          .not('value', 'is', null),
      ]);

      const countByStream: Record<string, number> = {};
      ((studentsRes.data ?? []) as any[]).forEach((s: any) => {
        countByStream[s.stream_id] = (countByStream[s.stream_id] ?? 0) + 1;
      });

      return asgns.map((a: any) => {
        const total = countByStream[a.stream_id] ?? 0;
        const enteredStudents = new Set(
          ((marksRes.data ?? []) as any[])
            .filter(
              (m: any) =>
                m.subject_id === a.subject_id &&
                m.stream_id === a.stream_id &&
                m.semester_id === a.semester_id,
            )
            .map((m: any) => m.student_id),
        );
        return {
          ...a,
          total,
          entered: enteredStudents.size,
          isComplete: enteredStudents.size >= total && total > 0,
        };
      });
    },
  });
}

export default function STMarksOverview() {
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const { data, isLoading, isError, refetch } = useSTAssignmentsOverview(
    user?.staffId ?? null,
    user?.schoolId ?? '',
  );

  const anyWindowClosed = (data ?? []).some((a: any) => !a.semesters?.marks_window_open);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load assignments" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="My Marks"
        subtitle={data && data.length > 0 ? `${data.filter((a: any) => a.isComplete).length}/${data.length} complete` : undefined}
      />

      {anyWindowClosed && <MarksWindowBanner isOpen={false} />}

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Skeleton width="50%" height={16} />
              <Skeleton width="30%" height={12} style={{ marginTop: 6 }} />
              <Skeleton width="100%" height={6} radius={3} style={{ marginTop: 12 }} />
            </View>
          ))}
        </View>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No assignments"
          description="You have no subject assignments for this semester."
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {data.map((assignment: any) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              colors={colors}
              onPress={() => {
                haptics.light();
                router.push({
                  pathname: '/(app)/(st)/marks-entry',
                  params: { assignmentId: assignment.id },
                } as any);
              }}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AssignmentCard({
  assignment,
  colors,
  onPress,
}: {
  assignment: any;
  colors: any;
  onPress: () => void;
}) {
  const { entered, total, isComplete } = assignment;
  const isWindowOpen = assignment.semesters?.marks_window_open ?? true;
  const pct = total > 0 ? Math.round((entered / total) * 100) : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Left accent strip */}
      <View
        style={[
          styles.accentStrip,
          {
            backgroundColor: isComplete
              ? Colors.semantic.success
              : !isWindowOpen
              ? Colors.semantic.error
              : colors.brand.primary,
          },
        ]}
      />
      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
              {assignment.subjects?.name ?? '—'}
            </ThemedText>
            <ThemedText variant="caption" color="muted">
              {assignment.streams?.grades?.name ?? ''} · {assignment.streams?.name ?? ''} · {assignment.semesters?.name ?? ''}
            </ThemedText>
          </View>

          {/* Status badge */}
          {isComplete ? (
            <View style={[styles.completeBadge, { backgroundColor: Colors.semantic.successLight }]}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.semantic.success} />
              <ThemedText variant="label" style={{ color: Colors.semantic.success, marginLeft: 4, fontSize: 11 }}>
                COMPLETE
              </ThemedText>
            </View>
          ) : !isWindowOpen ? (
            <View style={[styles.completeBadge, { backgroundColor: Colors.semantic.errorLight }]}>
              <Ionicons name="lock-closed" size={11} color={Colors.semantic.error} />
              <ThemedText variant="label" style={{ color: Colors.semantic.error, marginLeft: 4, fontSize: 11 }}>
                CLOSED
              </ThemedText>
            </View>
          ) : (
            <ThemedText variant="caption" style={{ color: entered === 0 ? colors.textMuted : colors.brand.primary, fontWeight: '600' }}>
              {entered}/{total}
            </ThemedText>
          )}
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <ProgressBar
            value={entered}
            max={total || 1}
            color={isComplete ? Colors.semantic.success : colors.brand.primary}
            height={4}
          />
          <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
            {pct}% entered
          </ThemedText>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ alignSelf: 'center', marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  skeletonList: { padding: 16, gap: 12 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  accentStrip: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  progressRow: { gap: 2 },
});
