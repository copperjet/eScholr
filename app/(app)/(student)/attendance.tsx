import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Badge, EmptyState, ErrorState, SectionHeader, ProgressBar } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors, resolveAttColor } from '../../../constants/Colors';

function useStudentAttendance(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['student-attendance-view', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('attendance_records')
        .select('date, status, semesters(name)')
        .eq('student_id', studentId!)
        .eq('school_id', schoolId)
        .order('date', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function StudentAttendance() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? null;
  const schoolId = user?.schoolId ?? '';

  const { data: records, isLoading, isError, refetch, isRefetching } = useStudentAttendance(studentId, schoolId);

  const presentCount = (records ?? []).filter((r: any) => r.status === 'present').length;
  const total = records?.length ?? 0;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load attendance" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.header}>
          <ThemedText variant="h4">My Attendance</ThemedText>
        </View>

        {isLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}>
            <View style={{ gap: 8 }}>
              <View style={{ height: 16, width: '60%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
              <View style={{ height: 12, width: '40%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
            </View>
          </Card>
        ) : (
          <>
            <Card style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.lg, padding: Spacing.lg }}>
              <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>ATTENDANCE RATE</ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.sm }}>
                <ThemedText variant="h1" style={{ color: rate >= 85 ? Colors.semantic.success : Colors.semantic.error }}>
                  {rate}%
                </ThemedText>
                <ThemedText variant="body" color="muted" style={{ marginLeft: Spacing.sm }}>
                  ({presentCount} of {total} days)
                </ThemedText>
              </View>
              <ProgressBar value={rate} max={100} color={rate >= 85 ? Colors.semantic.success : Colors.semantic.error} />
            </Card>

            <SectionHeader title="Recent Records" />
            {records?.length === 0 ? (
              <EmptyState title="No records" description="Attendance records appear once teachers submit." icon="calendar-outline" />
            ) : (
              records?.map((r: any, i: number) => (
                <Card key={i} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <ThemedText style={{ fontWeight: '600' }}>{r.date ? format(new Date(r.date), 'EEEE dd/MM/yy') : ''}</ThemedText>
                      <ThemedText variant="caption" color="muted">{r.semesters?.name}</ThemedText>
                    </View>
                    <Badge
                      label={(r.status ?? '').toUpperCase()}
                      preset={r.status === 'present' ? 'success' : r.status === 'absent' ? 'error' : 'warning'}
                    />
                  </View>
                </Card>
              ))
            )}
          </>
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
  },
});
