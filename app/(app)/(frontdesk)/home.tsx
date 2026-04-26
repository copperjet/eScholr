import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Avatar, FAB, ErrorState, SectionHeader, StatCard, IconChip, Card } from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const TODAY       = format(new Date(), 'EEEE, d MMM');
const TODAY_DATE  = format(new Date(), 'yyyy-MM-dd');

const STATUS_META = [
  { key: 'new',         label: 'New',         color: Colors.semantic.info,    icon: 'add-circle-outline',       iconFilled: 'add-circle' },
  { key: 'in_progress', label: 'In Progress', color: Colors.semantic.warning, icon: 'time-outline',             iconFilled: 'time' },
  { key: 'enrolled',    label: 'Enrolled',    color: Colors.semantic.success,  icon: 'checkmark-circle-outline', iconFilled: 'checkmark-circle' },
  { key: 'closed',      label: 'Closed',      color: '#9CA3AF',                icon: 'close-circle-outline',     iconFilled: 'close-circle' },
] as const;

function useFrontDeskDashboard(schoolId: string) {
  return useQuery({
    queryKey: ['frontdesk-dashboard', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const [allRes, todayRes] = await Promise.all([
        (supabase as any).from('inquiries').select('id, status').eq('school_id', schoolId),
        (supabase as any).from('inquiries').select('id, status').eq('school_id', schoolId).eq('date', TODAY_DATE),
      ]);
      const all   = (allRes.data ?? []) as any[];
      const today = (todayRes.data ?? []) as any[];
      const counts: Record<string, number>      = {};
      const todayCounts: Record<string, number> = {};
      STATUS_META.forEach(s => { counts[s.key] = 0; todayCounts[s.key] = 0; });
      all.forEach((i: any)   => { if (counts[i.status]      !== undefined) counts[i.status]++; });
      today.forEach((i: any) => { if (todayCounts[i.status] !== undefined) todayCounts[i.status]++; });
      return { counts, todayCounts, totalToday: today.length, totalAll: all.length };
    },
  });
}

export default function FrontDeskHome() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const { data, isLoading, isError, refetch, isFetching } = useFrontDeskDashboard(user?.schoolId ?? '');

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
            <Avatar name={user?.fullName ?? 'F'} size={44} />
          </Pressable>
        </View>

        {/* ── Today hero card ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.brand.primary }, Shadow.lg]}>
          <ThemedText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>
            Today's Inquiries
          </ThemedText>
          <ThemedText style={{ color: '#fff', fontSize: 38, fontWeight: '700', letterSpacing: -0.5 }}>
            {isLoading ? '—' : data?.totalToday ?? 0}
          </ThemedText>
          <View style={styles.heroPills}>
            {STATUS_META.map(s => (
              <View key={s.key} style={styles.heroPill}>
                <ThemedText style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                  {isLoading ? '—' : data?.todayCounts[s.key] ?? 0}
                </ThemedText>
                <ThemedText style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>{s.label}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* ── All-time stat row ── */}
        <SectionHeader title="All Time" />
        <View style={styles.statRow}>
          {STATUS_META.map(s => (
            <Pressable
              key={s.key}
              onPress={() => router.push('/(app)/(frontdesk)/inquiries' as any)}
              style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.8 : 1 }]}
            >
              <StatCard
                label={s.label}
                value={isLoading ? '—' : String(data?.counts[s.key] ?? 0)}
                icon={s.icon as any}
                iconBg={s.color + '18'}
                iconColor={s.color}
              />
            </Pressable>
          ))}
        </View>

        {/* ── Quick tip ── */}
        <Card variant="tinted" style={styles.tip}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
            <IconChip
              icon={<Ionicons name="bulb-outline" size={16} color={colors.brand.primary} />}
              size={32}
              radius={16}
            />
            <ThemedText variant="bodySm" color="muted" style={{ flex: 1 }}>
              Tap + to log a new inquiry. Name is the only required field.
            </ThemedText>
          </View>
        </Card>

        <View style={{ height: 100 }} />
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
