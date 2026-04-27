import React from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet, Pressable,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, ErrorState, StatCard, SectionHeader,
  StatCardSkeleton, ListItemSkeleton,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchoolRow {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  primary_color: string | null;
  country: string | null;
  subscription_plan: string;
  subscription_status: string;
  created_at: string;
  student_count: number;
  staff_count: number;
}

interface Overview {
  schools: SchoolRow[];
  totals: { schools: number; students: number; active: number };
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useSchoolsOverview() {
  return useQuery<Overview>({
    queryKey: ['platform-schools-overview'],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any).functions.invoke('get-schools-overview');
      if (error) throw new Error(error.message);
      return data as Overview;
    },
  });
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:    { bg: Colors.semantic.successLight, text: Colors.semantic.success },
  trial:     { bg: Colors.semantic.warningLight, text: Colors.semantic.warning },
  suspended: { bg: '#FEE2E2', text: '#DC2626' },
  cancelled: { bg: '#F3F4F6', text: '#6B7280' },
};

function StatusChip({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.cancelled;
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <ThemedText style={{ fontSize: 11, fontWeight: '700', color: c.text, letterSpacing: 0.3 }}>
        {status.toUpperCase()}
      </ThemedText>
    </View>
  );
}

// ── School row card ───────────────────────────────────────────────────────────

function SchoolCard({ school, colors }: { school: SchoolRow; colors: any }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push({ pathname: '/(app)/(platform)/school-detail', params: { id: school.id } } as any)}
      style={[styles.schoolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Color stripe */}
      <View style={[styles.colorStripe, { backgroundColor: school.primary_color ?? colors.brand.primary }]} />

      <View style={styles.schoolCardBody}>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{school.name}</ThemedText>
          <ThemedText variant="caption" color="muted">{school.code} · {school.country ?? '—'}</ThemedText>
        </View>
        <StatusChip status={school.subscription_status} />
      </View>

      <View style={[styles.schoolCardFooter, { borderTopColor: colors.border }]}>
        <View style={styles.schoolStat}>
          <Ionicons name="people-outline" size={13} color={colors.textMuted} />
          <ThemedText variant="caption" color="muted" style={{ marginLeft: 4 }}>
            {school.student_count} students
          </ThemedText>
        </View>
        <View style={styles.schoolStat}>
          <Ionicons name="id-card-outline" size={13} color={colors.textMuted} />
          <ThemedText variant="caption" color="muted" style={{ marginLeft: 4 }}>
            {school.staff_count} staff
          </ThemedText>
        </View>
        <View style={styles.schoolStat}>
          <Ionicons name="card-outline" size={13} color={colors.textMuted} />
          <ThemedText variant="caption" color="muted" style={{ marginLeft: 4 }}>
            {school.subscription_plan}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PlatformHome() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch, isFetching } = useSchoolsOverview();

  const TODAY = format(new Date(), 'EEEE, d MMM');

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load schools" description="Check connection and try again." onRetry={refetch} />
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
            <ThemedText variant="h2">eScholr Platform</ThemedText>
          </View>
          <Pressable onPress={() => router.push('/(app)/notifications' as any)} style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(platform)/more' as any)}>
            <Avatar name={user?.fullName ?? 'SA'} size={42} />
          </Pressable>
        </View>

        {/* ── Platform role badge ── */}
        <View style={[styles.platformBadge, { backgroundColor: colors.brand.primaryDark, marginHorizontal: Spacing.screen }]}>
          <Ionicons name="shield-checkmark" size={16} color={colors.brand.onPrimary} />
          <ThemedText style={{ color: colors.brand.onPrimary, fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
            Platform Administrator
          </ThemedText>
        </View>

        {/* ── Stats ── */}
        <SectionHeader title="Overview" />
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
              label="Schools"
              value={data?.totals.schools ?? 0}
              icon="business"
              iconBg={Colors.semantic.infoLight}
              iconColor={Colors.semantic.info}
              style={styles.statCell}
            />
            <StatCard
              label="Students"
              value={data?.totals.students ?? 0}
              icon="people"
              iconBg={Colors.semantic.successLight}
              iconColor={Colors.semantic.success}
              style={styles.statCell}
            />
            <StatCard
              label="Active"
              value={data?.totals.active ?? 0}
              icon="checkmark-circle"
              iconBg={Colors.semantic.warningLight}
              iconColor={Colors.semantic.warning}
              style={styles.statCell}
            />
          </View>
        )}

        {/* ── Schools list ── */}
        <View style={styles.listHeader}>
          <SectionHeader title="All Schools" noTopMargin={false} />
          <TouchableOpacity
            onPress={() => router.push('/(app)/(platform)/onboard' as any)}
            style={[styles.onboardBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 4 }}>Onboard</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT }}>
          {isLoading
            ? [0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)
            : (data?.schools ?? []).length === 0
              ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <Ionicons name="business-outline" size={32} color={colors.textMuted} />
                  <ThemedText color="muted" style={{ marginTop: Spacing.sm, textAlign: 'center' }}>
                    No schools onboarded yet.
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => router.push('/(app)/(platform)/onboard' as any)}
                    style={[styles.onboardBtn, { backgroundColor: colors.brand.primary, marginTop: Spacing.base }]}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 4 }}>Onboard First School</ThemedText>
                  </TouchableOpacity>
                </View>
              )
              : (data?.schools ?? []).map((school) => (
                <SchoolCard key={school.id} school={school} colors={colors} />
              ))
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base,
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  platformBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderRadius: Radius.md, marginBottom: Spacing.sm,
  },
  statRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm,
  },
  statCell: { flex: 1 },
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: Spacing.screen,
  },
  onboardBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full,
  },
  schoolCard: {
    borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden',
  },
  colorStripe: { height: 4 },
  schoolCardBody: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  schoolCardFooter: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderTopWidth: 1, gap: Spacing.md,
  },
  schoolStat: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  emptyCard: {
    borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed',
    padding: Spacing['2xl'], alignItems: 'center',
  },
});
