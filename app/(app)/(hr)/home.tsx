import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Badge, StatCard, Card,
  EmptyState, ErrorState, SectionHeader, QuickActionCard, Skeleton,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

// TODAY computed inside component to avoid stale dates

function useHRDashboard(schoolId: string) {
  return useQuery({
    queryKey: ['hr-dashboard', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const [staffRes, pendingLeaveRes, allLeaveRes] = await Promise.all([
        (supabase as any).from('staff').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
        (supabase as any).from('leave_requests').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'pending'),
        (supabase as any).from('leave_requests').select('*, staff:staff_id(full_name)').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(5),
      ]);
      return {
        staffCount: staffRes.count ?? 0,
        pendingLeaveCount: pendingLeaveRes.count ?? 0,
        recentLeaves: allLeaveRes.data ?? [],
      };
    },
  });
}

export default function HRHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();
  const TODAY = useMemo(() => format(new Date(), 'EEEE, d MMM'), []);
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isError, refetch, isRefetching } = useHRDashboard(schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Check connection." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.topBar}>
          <View>
            <ThemedText variant="caption" color="muted">{TODAY}</ThemedText>
            <ThemedText variant="h2">HR Dashboard</ThemedText>
          </View>
          <Pressable onPress={() => router.push('/(app)/notifications' as any)} style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
            <Avatar name={user?.fullName ?? 'HR'} photoUrl={school?.logo_url} size={40} />
          </Pressable>
        </View>

        {/* Stats */}
        {isLoading ? (
          <View style={styles.statRow}>
            <View style={[styles.statCell, { height: 80, backgroundColor: colors.surfaceSecondary, borderRadius: 12 }]} />
            <View style={[styles.statCell, { height: 80, backgroundColor: colors.surfaceSecondary, borderRadius: 12 }]} />
          </View>
        ) : (
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
              label="Pending Leave"
              value={data?.pendingLeaveCount ?? 0}
              icon="calendar"
              iconBg={Colors.semantic.warningLight}
              iconColor={Colors.semantic.warning}
              style={styles.statCell}
            />
          </View>
        )}

        {/* Quick Actions */}
        <SectionHeader title="Quick Actions" />
        <View style={styles.quickRow}>
          <QuickActionCard
            title="Leave"
            subtitle="Review requests"
            icon="calendar-outline"
            onPress={() => router.push('/(app)/(hr)/leave' as any)}
            style={styles.qaCard}
          />
          <QuickActionCard
            title="Staff"
            subtitle="Directory"
            icon="people-outline"
            onPress={() => router.push('/(app)/(hr)/staff' as any)}
            style={styles.qaCard}
          />
        </View>

        {/* Recent Leave Requests */}
        <SectionHeader title="Recent Leave Requests" />
        {isLoading ? (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm }}>
                <Skeleton width={42} height={42} radius={21} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="35%" height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : data?.recentLeaves.length === 0 ? (
          <EmptyState title="No leave requests" description="Staff leave requests appear here." icon="calendar-outline" />
        ) : (
          data?.recentLeaves.map((leave: any) => (
            <Card key={leave.id} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>
                    {leave.staff?.full_name ?? 'Staff'}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {leave.start_date ? format(new Date(leave.start_date), 'd MMM') : '—'} – {leave.end_date ? format(new Date(leave.end_date), 'd MMM') : '—'} · {leave.leave_type}
                  </ThemedText>
                </View>
                <Badge
                  label={leave.status}
                  preset={leave.status === 'approved' ? 'success' : leave.status === 'pending' ? 'warning' : 'neutral'}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  statCell: { flex: 1 },
  quickRow: { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.md, marginBottom: Spacing.lg },
  qaCard:   { flex: 1 },
});
