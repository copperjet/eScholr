import React from 'react';
import { View, SafeAreaView, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, ErrorState, StatCard, SectionHeader,
  QuickActionCard, ListItemSkeleton, StatCardSkeleton,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

function useAdminDashboard(schoolId: string) {
  return useQuery({
    queryKey: ['admin-dashboard', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const [studentsRes, staffRes, pendingReportsRes, semesterRes, attendanceTodayRes] =
        await Promise.all([
          supabase.from('students').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('status', 'active'),
          (supabase as any).from('staff').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('status', 'active'),
          (supabase as any).from('reports').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('status', 'pending_approval'),
          (supabase as any).from('semesters').select('id, name, start_date, end_date, is_active')
            .eq('school_id', schoolId).eq('is_active', true).limit(1).maybeSingle(),
          supabase.from('attendance_records').select('student_id, status')
            .eq('school_id', schoolId).eq('date', format(new Date(), 'yyyy-MM-dd')),
        ]);

      const attData = (attendanceTodayRes.data ?? []) as any[];
      const presentToday = attData.filter((a: any) => a.status === 'present').length;
      const totalAttToday = attData.length;

      return {
        studentCount: studentsRes.count ?? 0,
        staffCount: staffRes.count ?? 0,
        pendingReports: pendingReportsRes.count ?? 0,
        semester: semesterRes.data as any,
        presentToday,
        totalAttToday,
      };
    },
  });
}

export default function AdminHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();
  const { data, isLoading, isError, refetch, isFetching } = useAdminDashboard(user?.schoolId ?? '');

  const TODAY = format(new Date(), 'EEEE, d MMM');
  const attPct = data?.totalAttToday
    ? Math.round((data.presentToday / data.totalAttToday) * 100)
    : null;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="caption" color="muted">{TODAY}</ThemedText>
            <ThemedText variant="h2" numberOfLines={1}>{school?.name ?? 'Dashboard'}</ThemedText>
          </View>
          <Pressable
            onPress={() => router.push('/(app)/notifications' as any)}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
            <Avatar name={user?.fullName ?? 'A'} size={42} />
          </Pressable>
        </View>

        {/* ── Hero stat card ── */}
        <View style={styles.heroPad}>
          {isLoading ? (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.brand.primary }]}>
              <StatCardSkeleton />
            </View>
          ) : (
            <StatCard
              variant="hero"
              label="Students enrolled"
              value={data?.studentCount ?? 0}
              icon="people"
              caption={data?.semester ? `Active: ${data.semester.name}` : undefined}
              trend={
                attPct !== null
                  ? { direction: 'up', label: `${attPct}% present today` }
                  : undefined
              }
              style={{ marginHorizontal: Spacing.screen }}
            />
          )}
        </View>

        {/* ── Stat grid ── */}
        <SectionHeader title="Overview" noTopMargin />
        {isLoading ? (
          <View style={styles.statRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.statCell, { backgroundColor: colors.surface }]}>
                <StatCardSkeleton />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.statRow}>
            <StatCard
              label="Staff"
              value={data?.staffCount ?? 0}
              icon="person"
              iconBg={Colors.semantic.infoLight}
              iconColor={Colors.semantic.info}
              style={styles.statCell}
            />
            <StatCard
              label="Reports Pending"
              value={data?.pendingReports ?? 0}
              icon="document-text"
              iconBg={Colors.semantic.warningLight}
              iconColor={Colors.semantic.warning}
              style={styles.statCell}
            />
            <StatCard
              label="Present Today"
              value={attPct !== null ? `${attPct}%` : '—'}
              icon="checkmark-circle"
              iconBg={Colors.semantic.successLight}
              iconColor={Colors.semantic.success}
              style={styles.statCell}
            />
          </View>
        )}

        {/* ── Pending reports alert ── */}
        {!isLoading && (data?.pendingReports ?? 0) > 0 && (
          <Pressable
            onPress={() => router.push('/(app)/(admin)/reports' as any)}
            style={({ pressed }) => [
              styles.alertBanner,
              {
                backgroundColor: Colors.semantic.warningLight,
                borderColor: Colors.semantic.warning + '50',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons name="time-outline" size={18} color={Colors.semantic.warning} />
            <ThemedText style={{ color: Colors.semantic.warning, fontWeight: '600', flex: 1, fontSize: 14, marginLeft: Spacing.sm }}>
              {data?.pendingReports} report{(data?.pendingReports ?? 0) > 1 ? 's' : ''} awaiting approval
            </ThemedText>
            <Ionicons name="chevron-forward" size={16} color={Colors.semantic.warning} />
          </Pressable>
        )}

        {/* ── Quick actions — gated by role ── */}
        <SectionHeader title="Quick Actions" />
        <View style={styles.qaGrid}>
          {(['super_admin', 'admin'] as const).includes(user?.activeRole as any) && (
            <QuickActionCard
              title="Students"
              subtitle="Manage enrolment"
              icon="school-outline"
              variant="surface"
              onPress={() => router.push('/(app)/(hrt)/students' as any)}
              style={styles.qaCard}
            />
          )}
          {(['super_admin', 'admin'] as const).includes(user?.activeRole as any) && (
            <QuickActionCard
              title="Staff"
              subtitle="Roles & access"
              icon="people-outline"
              variant="surface"
              onPress={() => router.push('/(app)/(admin)/staff' as any)}
              style={styles.qaCard}
            />
          )}
          {(['super_admin', 'admin', 'principal', 'coordinator', 'hod'] as const).includes(user?.activeRole as any) && (
            <QuickActionCard
              title="Reports"
              subtitle="Approve & release"
              icon="document-text-outline"
              variant="surface"
              onPress={() => router.push('/(app)/(admin)/reports' as any)}
              style={styles.qaCard}
            />
          )}
          {(['super_admin', 'admin', 'principal', 'coordinator'] as const).includes(user?.activeRole as any) && (
            <QuickActionCard
              title="Attendance"
              subtitle="View overview"
              icon="calendar-outline"
              variant="surface"
              onPress={() => router.push('/(app)/(admin)/attendance-overview' as any)}
              style={styles.qaCard}
            />
          )}
          {(['super_admin', 'admin', 'principal', 'coordinator', 'hod'] as const).includes(user?.activeRole as any) && (
            <QuickActionCard
              title="Marks Matrix"
              subtitle="Class completion view"
              icon="grid-outline"
              variant="surface"
              onPress={() => router.push('/(app)/(admin)/marks-matrix' as any)}
              style={styles.qaCard}
            />
          )}
          {(['super_admin', 'admin', 'principal', 'coordinator', 'hod'] as const).includes(user?.activeRole as any) && (
            <QuickActionCard
              title="Day Book"
              subtitle="Student notes"
              icon="book-outline"
              variant="surface"
              onPress={() => router.push('/(app)/(admin)/daybook' as any)}
              style={styles.qaCard}
            />
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.base,
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPad: {
    paddingBottom: Spacing.base,
  },
  heroPlaceholder: {
    marginHorizontal: Spacing.screen,
    borderRadius: 22,
    overflow: 'hidden',
    minHeight: 140,
  },
  statRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screen,
    gap: Spacing.sm,
  },
  statCell: {
    flex: 1,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.screen,
    marginTop: Spacing.base,
    padding: Spacing.base,
    borderRadius: 16,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  qaGrid: {
    paddingHorizontal: Spacing.screen,
    gap: Spacing.sm,
  },
  qaCard: {
    flex: undefined,
  },
});
