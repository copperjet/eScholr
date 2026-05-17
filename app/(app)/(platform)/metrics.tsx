import React from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet, Pressable,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { ThemedText, ErrorState, SectionHeader, StatCardSkeleton, ListItemSkeleton } from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { usePlatformMetrics } from '../../../hooks/usePlatform';
import { format } from 'date-fns';

// ── Mini bar chart ─────────────────────────────────────────────────────────────

function MiniBarChart({ data, color }: { data: { month: string; count: number }[]; color: string }) {
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <View style={styles.chartWrap}>
      {data.slice(-8).map((d) => (
        <View key={d.month} style={styles.barCol}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.bar, { height: `${Math.max((d.count / max) * 100, 4)}%` as any, backgroundColor: color }]} />
          </View>
          <ThemedText style={{ fontSize: 9, color: colors.textMuted, marginTop: 2 }}>
            {d.month.slice(5)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

// ── Plan breakdown bar ─────────────────────────────────────────────────────────

function PlanBar({ plan, count, total, color }: { plan: string; count: number; total: number; color: string }) {
  const { colors } = useTheme();
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={{ gap: 4, marginBottom: Spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <ThemedText style={{ fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{plan}</ThemedText>
        <ThemedText style={{ fontSize: 13, color: colors.textMuted }}>{count} ({pct.toFixed(0)}%)</ThemedText>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Revenue card ───────────────────────────────────────────────────────────────

function RevenueCard({ label, value, icon, bg, iconColor }: { label: string; value: string; icon: string; bg: string; iconColor: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.revCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.revIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <ThemedText style={{ fontSize: 20, fontWeight: '800', marginTop: 8 }}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>{label}</ThemedText>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  starter:    Colors.semantic.info,
  growth:     Colors.semantic.success,
  scale:      Colors.semantic.warning,
  enterprise: '#8B5CF6',
};

const STATUS_COLORS: Record<string, string> = {
  active:    Colors.semantic.success,
  trial:     Colors.semantic.warning,
  suspended: '#DC2626',
  cancelled: '#9CA3AF',
};

export default function PlatformMetrics() {
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch, isFetching } = usePlatformMetrics();

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Platform Metrics</ThemedText>
          <View style={{ width: 24 }} />
        </View>
        <ErrorState title="Could not load metrics" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const s = data?.summary;
  const planDist = data?.plan_distribution ?? {};
  const statusDist = data?.status_distribution ?? {};
  const totalSchools = s?.total_schools ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Platform Metrics</ThemedText>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
      >
        {/* Revenue */}
        <SectionHeader title="Revenue" />
        {isLoading ? (
          <View style={styles.revRow}>
            {[0, 1, 2].map((i) => <View key={i} style={[styles.revCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><StatCardSkeleton /></View>)}
          </View>
        ) : (
          <View style={styles.revRow}>
            <RevenueCard
              label="MRR"
              value={`$${(s?.mrr ?? 0).toLocaleString()}`}
              icon="card"
              bg={Colors.semantic.successLight}
              iconColor={Colors.semantic.success}
            />
            <RevenueCard
              label="ARR"
              value={`$${(s?.arr ?? 0).toLocaleString()}`}
              icon="trending-up"
              bg={Colors.semantic.infoLight}
              iconColor={Colors.semantic.info}
            />
            <RevenueCard
              label="Churn"
              value={`${s?.churn_rate_pct ?? 0}%`}
              icon="arrow-down-circle"
              bg="#FEE2E2"
              iconColor="#DC2626"
            />
          </View>
        )}

        {/* School totals */}
        <SectionHeader title="Schools" />
        {isLoading ? (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {[0, 1].map((i) => <ListItemSkeleton key={i} />)}
          </View>
        ) : (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {[
              { label: 'Total schools',   value: s?.total_schools   ?? 0, color: colors.textPrimary },
              { label: 'Active',          value: s?.active_schools  ?? 0, color: Colors.semantic.success },
              { label: 'Trial',           value: s?.trial_schools   ?? 0, color: Colors.semantic.warning },
              { label: 'Total students',  value: s?.total_students  ?? 0, color: Colors.semantic.info },
              { label: 'Total staff',     value: s?.total_staff     ?? 0, color: '#8B5CF6' },
            ].map((row) => (
              <View key={row.label} style={[styles.statRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ThemedText style={{ flex: 1, fontSize: 14, fontWeight: '500' }}>{row.label}</ThemedText>
                <ThemedText style={{ fontWeight: '800', fontSize: 17, color: row.color }}>{row.value.toLocaleString()}</ThemedText>
              </View>
            ))}
          </View>
        )}

        {/* Plan breakdown */}
        <SectionHeader title="Plan Distribution" />
        <View style={[styles.breakdownCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isLoading
            ? [0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)
            : Object.entries(planDist).map(([plan, count]) => (
              <PlanBar key={plan} plan={plan} count={count} total={totalSchools} color={PLAN_COLORS[plan] ?? colors.brand.primary} />
            ))
          }
        </View>

        {/* Status breakdown */}
        <SectionHeader title="Status Distribution" />
        <View style={styles.statusRow}>
          {isLoading
            ? [0, 1, 2, 3].map((i) => <View key={i} style={[styles.statusChip, { backgroundColor: colors.surface }]}><StatCardSkeleton /></View>)
            : Object.entries(statusDist).map(([status, count]) => (
              <View key={status} style={[styles.statusChip, { backgroundColor: (STATUS_COLORS[status] ?? '#9CA3AF') + '20', borderColor: STATUS_COLORS[status] ?? '#9CA3AF' }]}>
                <ThemedText style={{ fontSize: 18, fontWeight: '800', color: STATUS_COLORS[status] ?? '#9CA3AF' }}>{count}</ThemedText>
                <ThemedText style={{ fontSize: 11, fontWeight: '600', color: STATUS_COLORS[status] ?? '#9CA3AF', textTransform: 'capitalize', marginTop: 2 }}>{status}</ThemedText>
              </View>
            ))
          }
        </View>

        {/* Growth chart */}
        {data?.school_growth && data.school_growth.length > 0 && (
          <>
            <SectionHeader title="School Growth (12 months)" />
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MiniBarChart data={data.school_growth} color={colors.brand.primary} />
              <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 6 }}>
                Cumulative school count by month
              </ThemedText>
            </View>
          </>
        )}

        {/* Per-school revenue table */}
        <SectionHeader title="School Revenue" />
        <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.xs }}>
          {isLoading
            ? [0, 1, 2].map((i) => <ListItemSkeleton key={i} />)
            : (data?.school_usage ?? [])
              .filter((s: any) => s.subscription_status === 'active')
              .sort((a: any, b: any) => b.monthly_revenue - a.monthly_revenue)
              .map((s: any) => (
                <TouchableOpacity
                  key={s.id}
                  activeOpacity={0.75}
                  onPress={() => router.push({ pathname: '/(app)/(platform)/school-detail', params: { id: s.id } } as any)}
                  style={[styles.schoolRevRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{s.name}</ThemedText>
                    <ThemedText variant="caption" color="muted">{s.subscription_plan} · {s.student_count} students</ThemedText>
                  </View>
                  <ThemedText style={{ fontWeight: '800', fontSize: 15, color: Colors.semantic.success }}>
                    ${s.monthly_revenue}/mo
                  </ThemedText>
                </TouchableOpacity>
              ))
          }
        </View>

        {/* Recent impersonations */}
        {(data?.recent_impersonations ?? []).length > 0 && (
          <>
            <SectionHeader title="Recent Support Sessions" />
            <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
              {(data!.recent_impersonations).slice(0, 5).map((imp, i) => (
                <View key={i} style={[styles.impRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="shield-outline" size={14} color={colors.textMuted} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText style={{ fontSize: 13, fontWeight: '500' }}>{imp.target_email}</ThemedText>
                    <ThemedText variant="caption" color="muted">{imp.reason ?? 'No reason'} · {format(new Date(imp.created_at), 'd MMM HH:mm')}</ThemedText>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={() => router.push('/(app)/(platform)/impersonation-log' as any)}>
                <ThemedText style={{ textAlign: 'center', color: colors.brand.primary, fontSize: 13, fontWeight: '600', paddingVertical: Spacing.sm }}>
                  View all sessions →
                </ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  backBtn:{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  revRow: { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  revCard:{ flex: 1, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.base, alignItems: 'center' },
  revIcon:{ width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  statRow:{ flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1 },
  breakdownCard: { marginHorizontal: Spacing.screen, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.base },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  statusChip: { flex: 1, minWidth: 80, borderRadius: Radius.md, borderWidth: 1.5, padding: Spacing.sm, alignItems: 'center' },
  chartCard: { marginHorizontal: Spacing.screen, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.base },
  chartWrap: { flexDirection: 'row', height: 80, gap: 4, alignItems: 'flex-end' },
  barCol:    { flex: 1, height: '100%', alignItems: 'center' },
  bar:       { width: '80%', borderRadius: 2, minHeight: 4 },
  barTrack:  { height: 8, borderRadius: 4, width: '100%' },
  barFill:   { height: '100%', borderRadius: 4 },
  schoolRevRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1 },
  impRow:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
});
