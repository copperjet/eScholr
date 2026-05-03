import React, { useState, useMemo } from 'react';
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
  QuickActionCard, ListItemSkeleton, StatCardSkeleton, FadeIn,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { useCanAccess } from '../../../lib/roleScope';
import { StreamPicker } from '../../../components/modules/StreamPicker';

/**
 * Single RPC `get_admin_dashboard` replaces the old 5-query waterfall.
 * Falls back to an empty payload while migration 036 is being deployed
 * so the screen never crashes on missing function.
 */
function useAdminDashboard(schoolId: string, streamId?: string | null) {
  return useQuery({
    queryKey: ['admin-dashboard', schoolId, streamId ?? 'all'],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      if (!streamId) {
        const { data, error } = await (supabase.rpc as any)('get_admin_dashboard', {
          p_school_id: schoolId,
        });
        if (!error) {
          return data as {
            studentCount: number; staffCount: number; pendingReports: number;
            semester: any; presentToday: number; totalAttToday: number;
            teacherCount?: number;
          };
        }
      }

      let studentsQuery = (supabase as any).from('students').select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId).eq('status', 'active');
      if (streamId) studentsQuery = studentsQuery.eq('stream_id', streamId);

      let reportsQuery = (supabase as any).from('reports').select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId).eq('status', 'pending_approval');
      if (streamId) reportsQuery = reportsQuery.eq('stream_id', streamId);

      let attQuery = (supabase as any).from('attendance_records').select('student_id, status')
        .eq('school_id', schoolId).eq('date', format(new Date(), 'yyyy-MM-dd'));
      if (streamId) attQuery = attQuery.eq('stream_id', streamId);

      const [studentsRes, staffRes, pendingReportsRes, semesterRes, attendanceTodayRes] =
        await Promise.all([
          studentsQuery,
          (supabase as any).from('staff').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('status', 'active'),
          reportsQuery,
          (supabase as any).from('semesters').select('id, name, start_date, end_date, is_active')
            .eq('school_id', schoolId).eq('is_active', true).limit(1).maybeSingle(),
          attQuery,
        ]);
      const attData = (attendanceTodayRes.data ?? []) as any[];
      return {
        studentCount: studentsRes.count ?? 0,
        staffCount: staffRes.count ?? 0,
        pendingReports: pendingReportsRes.count ?? 0,
        semester: semesterRes.data as any,
        presentToday: attData.filter((a: any) => a.status === 'present').length,
        totalAttToday: attData.length,
        teacherCount: 0,
      };
    },
  });
}

const SUPER_ROLES = ['super_admin', 'school_super_admin'];
const SCOPED_ADMIN_ROLES = ['principal', 'coordinator', 'hod']; // These see class picker

export default function AdminHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();

  const isSuper = user ? SUPER_ROLES.includes(user.activeRole) : false;
  const isScopedAdmin = user ? SCOPED_ADMIN_ROLES.includes(user.activeRole) : false;
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useAdminDashboard(user?.schoolId ?? '', isScopedAdmin ? selectedStreamId : null);
  const canStudents = useCanAccess('students');
  const canStaff = useCanAccess('staff');
  const canParents = useCanAccess('parents');
  const canReports = useCanAccess('reports');
  const canAttendance = useCanAccess('attendance');
  const canMarksMatrix = useCanAccess('marks_matrix');
  const canDaybook = useCanAccess('daybook');
  const canSchoolStructure = useCanAccess('school_structure');
  const canCalendar = useCanAccess('calendar_events');

  const TODAY = useMemo(() => format(new Date(), 'EEEE, d MMM'), []);
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
            <Avatar name={user?.fullName ?? 'A'} photoUrl={school?.logo_url} size={42} />
          </Pressable>
        </View>

        {/* ── Class picker for HOD / Coordinator / Principal ── */}
        {isScopedAdmin && (
          <FadeIn delay={30} style={{ marginHorizontal: Spacing.screen, marginTop: Spacing.md }}>
            <StreamPicker
              schoolId={user?.schoolId ?? ''}
              selectedStreamId={selectedStreamId}
              onSelect={setSelectedStreamId}
              showAllOption
              label="Filter by Class"
            />
          </FadeIn>
        )}

        {/* ── Hero stat card (non-super only) ── */}
        {!isSuper && (
          <FadeIn delay={40} style={styles.heroPad}>
            {isLoading ? (
              <View style={[styles.heroPlaceholder, { backgroundColor: colors.brand.primary }]}>
                <StatCardSkeleton />
              </View>
            ) : (
              <StatCard
                variant="hero"
                label={attPct !== null ? "Today's Attendance" : "Active Semester"}
                value={attPct !== null ? `${attPct}%` : (data?.semester?.name ?? '—')}
                icon={attPct !== null ? 'checkmark-circle' : 'calendar'}
                caption={
                  attPct !== null
                    ? (data?.semester ? `${data.semester.name} · ${data.studentCount ?? 0} students` : `${data?.studentCount ?? 0} students enrolled`)
                    : 'No attendance data yet for today'
                }
                trend={
                  attPct !== null && attPct >= 80
                    ? { direction: 'up', label: 'Good attendance' }
                    : attPct !== null && attPct < 80
                      ? { direction: 'down', label: 'Below 80% target' }
                      : undefined
                }
                style={{ marginHorizontal: Spacing.screen }}
              />
            )}
          </FadeIn>
        )}

        {/* ── Stat grid ── */}
        <FadeIn delay={120}>
          <SectionHeader title="Overview" noTopMargin />
          {isLoading ? (
            <View style={styles.statRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.statCell, { backgroundColor: colors.surface }]}>
                  <StatCardSkeleton />
                </View>
              ))}
            </View>
          ) : isSuper ? (
            // Super admin: Staff, Students, Teachers
            <View style={styles.statRow}>
              <StatCard
                label="Staff"
                value={data?.staffCount ?? 0}
                icon="people"
                iconBg={Colors.semantic.infoLight}
                iconColor={Colors.semantic.info}
                style={styles.statCell}
              />
              <StatCard
                label="Students"
                value={data?.studentCount ?? 0}
                icon="school"
                iconBg={Colors.semantic.successLight}
                iconColor={Colors.semantic.success}
                style={styles.statCell}
              />
              <StatCard
                label="Teachers"
                value={data?.teacherCount ?? 0}
                icon="id-card"
                iconBg={Colors.semantic.warningLight}
                iconColor={Colors.semantic.warning}
                style={styles.statCell}
              />
            </View>
          ) : (
            // Regular admin: Staff, Students, Reports Pending
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
                label="Students"
                value={data?.studentCount ?? 0}
                icon="school"
                iconBg={Colors.semantic.successLight}
                iconColor={Colors.semantic.success}
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
            </View>
          )}
        </FadeIn>

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
        <FadeIn delay={200}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.qaGrid}>
          {isSuper ? (
            // Super admin: Staff, Students, Parents
            <>
              {canStaff && (
                <QuickActionCard
                  title="Staff"
                  subtitle="Manage staff"
                  icon="people-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/staff' as any)}
                  style={styles.qaCard}
                />
              )}
              {canStudents && (
                <QuickActionCard
                  title="Students"
                  subtitle="Manage enrolment"
                  icon="school-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/students' as any)}
                  style={styles.qaCard}
                />
              )}
              {canParents && (
                <QuickActionCard
                  title="Parents"
                  subtitle="Manage parents"
                  icon="people-circle-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/parents' as any)}
                  style={styles.qaCard}
                />
              )}
              {canSchoolStructure && (
                <QuickActionCard
                  title="Structure"
                  subtitle="Sections & grades"
                  icon="business-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/school-structure' as any)}
                  style={styles.qaCard}
                />
              )}
              {canCalendar && (
                <QuickActionCard
                  title="Calendar"
                  subtitle="Semesters & events"
                  icon="calendar-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/calendar-events' as any)}
                  style={styles.qaCard}
                />
              )}
            </>
          ) : (
            // Regular admin: Students, Staff, Attendance only
            <>
              {canStudents && (
                <QuickActionCard
                  title="Students"
                  subtitle="Manage enrolment"
                  icon="school-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/students' as any)}
                  style={styles.qaCard}
                />
              )}
              {canStaff && (
                <QuickActionCard
                  title="Staff"
                  subtitle="Roles & access"
                  icon="people-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/staff' as any)}
                  style={styles.qaCard}
                />
              )}
              {canAttendance && (
                <QuickActionCard
                  title="Attendance"
                  subtitle="View overview"
                  icon="calendar-outline"
                  variant="surface"
                  onPress={() => router.push('/(app)/(admin)/attendance-overview' as any)}
                  style={styles.qaCard}
                />
              )}
            </>
          )}
        </View>
        </FadeIn>

        <View style={{ height: TAB_BAR_HEIGHT }} />
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
