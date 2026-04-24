import React from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Avatar, Badge, Skeleton, ErrorState } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

function useAdminDashboard(schoolId: string) {
  return useQuery({
    queryKey: ['admin-dashboard', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const [
        studentsRes, staffRes, pendingReportsRes, semesterRes,
        attendanceTodayRes,
      ] = await Promise.all([
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

function StatCard({ value, label, icon, color, colors }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <ThemedText variant="h2" style={{ color }}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted" style={{ textAlign: 'center' }}>{label}</ThemedText>
    </View>
  );
}

function QuickAction({ icon, label, onPress, colors }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.qaIcon, { backgroundColor: colors.brand.primary + '18' }]}>
        <Ionicons name={icon} size={22} color={colors.brand.primary} />
      </View>
      <ThemedText variant="bodySm" style={{ fontWeight: '600', textAlign: 'center' }}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

export default function AdminHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();
  const { data, isLoading, isError, refetch, isFetching } = useAdminDashboard(user?.schoolId ?? '');

  const TODAY = format(new Date(), 'EEEE, d MMMM yyyy');

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
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="h3">{school?.name ?? 'Admin'}</ThemedText>
            <ThemedText variant="caption" color="muted">{TODAY}</ThemedText>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(app)/search' as any)}
            style={[styles.searchBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <Avatar name={user?.fullName ?? 'A'} size={42} />
        </View>

        {/* Active semester banner */}
        {!isLoading && data?.semester && (
          <View style={[styles.semesterBanner, { backgroundColor: colors.brand.primary + '14', borderColor: colors.brand.primary + '40' }]}>
            <Ionicons name="calendar-outline" size={16} color={colors.brand.primary} />
            <ThemedText variant="bodySm" style={{ color: colors.brand.primary, fontWeight: '600', marginLeft: Spacing.sm }}>
              Active: {data.semester.name}
            </ThemedText>
            <ThemedText variant="caption" style={{ color: colors.brand.primary, marginLeft: 'auto' }}>
              {data.semester.start_date ? format(new Date(data.semester.start_date), 'd MMM') : ''}
              {data.semester.end_date ? ` – ${format(new Date(data.semester.end_date), 'd MMM yyyy')}` : ''}
            </ThemedText>
          </View>
        )}

        {/* Stat grid */}
        <ThemedText variant="label" color="muted" style={styles.sectionLabel}>OVERVIEW</ThemedText>
        {isLoading ? (
          <View style={styles.statGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Skeleton width={36} height={36} radius={8} />
                <Skeleton width={40} height={24} style={{ marginTop: 8 }} />
                <Skeleton width={60} height={12} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.statGrid}>
            <StatCard value={data?.studentCount ?? 0} label="Students" icon="people-outline" color={colors.brand.primary} colors={colors} />
            <StatCard value={data?.staffCount ?? 0} label="Staff" icon="person-outline" color={Colors.semantic.info} colors={colors} />
            <StatCard
              value={data?.pendingReports ?? 0}
              label="Reports Pending"
              icon="document-text-outline"
              color={data?.pendingReports ? Colors.semantic.warning : Colors.semantic.success}
              colors={colors}
            />
            <StatCard
              value={data?.totalAttToday ? `${Math.round((data.presentToday / data.totalAttToday) * 100)}%` : '—'}
              label="Present Today"
              icon="checkmark-circle-outline"
              color={Colors.semantic.success}
              colors={colors}
            />
          </View>
        )}

        {/* Pending reports alert */}
        {!isLoading && (data?.pendingReports ?? 0) > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(app)/(admin)/reports' as any)}
            style={[styles.alertBanner, { backgroundColor: Colors.semantic.warningLight, borderColor: Colors.semantic.warning + '60' }]}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={18} color={Colors.semantic.warning} />
            <ThemedText variant="body" style={{ color: Colors.semantic.warning, fontWeight: '600', flex: 1, marginLeft: Spacing.sm }}>
              {data?.pendingReports} report{(data?.pendingReports ?? 0) > 1 ? 's' : ''} awaiting your approval
            </ThemedText>
            <Ionicons name="chevron-forward" size={16} color={Colors.semantic.warning} />
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <ThemedText variant="label" color="muted" style={styles.sectionLabel}>QUICK ACTIONS</ThemedText>
        <View style={styles.qaGrid}>
          <QuickAction icon="people-outline" label="Manage Staff" onPress={() => router.push('/(app)/(admin)/staff' as any)} colors={colors} />
          <QuickAction icon="school-outline" label="Students" onPress={() => router.push('/(app)/(hrt)/students' as any)} colors={colors} />
          <QuickAction icon="document-text-outline" label="Reports" onPress={() => router.push('/(app)/(admin)/reports' as any)} colors={colors} />
          <QuickAction icon="notifications-outline" label="Notifications" onPress={() => router.push('/(app)/notifications' as any)} colors={colors} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.base,
  },
  semesterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  sectionLabel: {
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
    letterSpacing: 0.6,
    fontSize: 11,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  statCard: {
    width: '47%',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  quickAction: {
    width: '47%',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  qaIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
