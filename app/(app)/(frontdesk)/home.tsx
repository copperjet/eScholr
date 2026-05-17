import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Avatar, FAB, ErrorState, SectionHeader, StatCard, IconChip, Card } from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

// Dates computed inside component to avoid stale values after midnight

const STATUS_META = [
  { key: 'new',         label: 'New',         color: Colors.semantic.info,    icon: 'add-circle-outline',       iconFilled: 'add-circle' },
  { key: 'in_progress', label: 'In Progress', color: Colors.semantic.warning, icon: 'time-outline',             iconFilled: 'time' },
  { key: 'enrolled',    label: 'Enrolled',    color: Colors.semantic.success,  icon: 'checkmark-circle-outline', iconFilled: 'checkmark-circle' },
  { key: 'closed',      label: 'Closed',      color: '#9CA3AF',                icon: 'close-circle-outline',     iconFilled: 'close-circle' },
] as const;

function useFrontDeskDashboard(schoolId: string, todayDate: string) {
  return useQuery({
    queryKey: ['frontdesk', 'dashboard', schoolId, todayDate],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const [allRes, todayRes, visitorsRes, appsRes] = await Promise.all([
        (supabase as any).from('inquiries').select('id, status').eq('school_id', schoolId),
        (supabase as any).from('inquiries').select('id, status').eq('school_id', schoolId).eq('date', todayDate),
        (supabase as any).from('visitor_log').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('sign_out_at', null),
        (supabase as any).from('admissions_applications').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'submitted'),
      ]);
      const all   = (allRes.data ?? []) as any[];
      const today = (todayRes.data ?? []) as any[];
      const counts: Record<string, number>      = {};
      const todayCounts: Record<string, number> = {};
      STATUS_META.forEach(s => { counts[s.key] = 0; todayCounts[s.key] = 0; });
      all.forEach((i: any)   => { if (counts[i.status]      !== undefined) counts[i.status]++; });
      today.forEach((i: any) => { if (todayCounts[i.status] !== undefined) todayCounts[i.status]++; });
      return {
        counts, todayCounts, totalToday: today.length, totalAll: all.length,
        activeVisitors: visitorsRes.count ?? 0,
        pendingApps: appsRes.count ?? 0,
      };
    },
  });
}

export default function FrontDeskHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();
  const TODAY = useMemo(() => format(new Date(), 'EEEE, d MMM'), []);
  const TODAY_DATE = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const { data, isLoading, isError, refetch, isFetching } = useFrontDeskDashboard(user?.schoolId ?? '', TODAY_DATE);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Check your connection and try again." onRetry={refetch} />
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
            <ThemedText variant="h2">Front Desk</ThemedText>
          </View>
          <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
            <Avatar name={user?.fullName ?? 'F'} photoUrl={school?.logo_url} size={44} />
          </Pressable>
        </View>

        {/* ── Stats row — tappable filters ── */}
        <SectionHeader title="Today's Overview" />
        <View style={styles.statRow}>
          <Pressable onPress={() => router.push('/(app)/(frontdesk)/inquiries' as any)} style={{ flex: 1 }}>
            <StatCard
              label="New Inquiries"
              value={isLoading ? '—' : String(data?.counts?.new ?? 0)}
              icon="chatbubble-ellipses-outline"
              iconBg={Colors.semantic.info + '18'}
              iconColor={Colors.semantic.info}
            />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(frontdesk)/applications' as any)} style={{ flex: 1 }}>
            <StatCard
              label="Pending Apps"
              value={isLoading ? '—' : String(data?.pendingApps ?? 0)}
              icon="document-text-outline"
              iconBg={Colors.semantic.warning + '18'}
              iconColor={Colors.semantic.warning}
            />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(frontdesk)/visitors' as any)} style={{ flex: 1 }}>
            <StatCard
              label="Visitors In"
              value={isLoading ? '—' : String(data?.activeVisitors ?? 0)}
              icon="people-outline"
              iconBg={Colors.semantic.success + '18'}
              iconColor={Colors.semantic.success}
            />
          </Pressable>
        </View>

        {/* ── Quick actions ── */}
        <SectionHeader title="Quick Actions" />
        <View style={styles.statRow}>
          <Pressable onPress={() => router.push('/(app)/(frontdesk)/students' as any)} style={{ flex: 1 }}>
            <StatCard
              label="Students"
              value="View"
              icon="school-outline"
              iconBg={colors.brand.primary + '18'}
              iconColor={colors.brand.primary}
            />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(frontdesk)/applications' as any)} style={{ flex: 1 }}>
            <StatCard
              label="Applications"
              value="Review"
              icon="clipboard-outline"
              iconBg={Colors.semantic.warning + '18'}
              iconColor={Colors.semantic.warning}
            />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(frontdesk)/visitors' as any)} style={{ flex: 1 }}>
            <StatCard
              label="Log Visitor"
              value="+"
              icon="person-add-outline"
              iconBg={Colors.semantic.success + '18'}
              iconColor={Colors.semantic.success}
            />
          </Pressable>
        </View>

        <View style={{ height: TAB_BAR_HEIGHT }} />
      </ScrollView>

      <FAB
        icon={<Ionicons name="add" size={26} color="#fff" />}
        label="New Inquiry"
        onPress={() => router.push('/(app)/(frontdesk)/inquiries' as any)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base, gap: Spacing.sm },
  heroCard: {
    marginHorizontal: Spacing.screen,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  heroPills: { flexDirection: 'row', marginTop: Spacing.sm, gap: Spacing.sm },
  heroPill:  { flex: 1, alignItems: 'center', gap: 2 },
  statRow:   { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  tip:       { marginHorizontal: Spacing.screen, marginTop: Spacing.lg, padding: Spacing.md },
});
