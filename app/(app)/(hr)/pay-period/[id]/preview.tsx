import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, StatCard, SearchBar,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../../../components/ui';
import { usePayPeriodPreview, type PayPeriodPreviewItem } from '../../../../../hooks/usePayroll';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../../../constants/Typography';
import { Colors } from '../../../../../constants/Colors';
import { haptics } from '../../../../../lib/haptics';

function fmtK(v: number) {
  if (v >= 1000) return `K${(v/1000).toFixed(1)}k`;
  return `K${v.toFixed(2)}`;
}

function PreviewRow({ item, expanded, onToggle }: { item: PayPeriodPreviewItem; expanded: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const hasProblem = item.has_missing_banking || item.has_missing_tax_id;

  return (
    <Pressable
      onPress={() => { haptics.selection(); onToggle(); }}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: hasProblem ? Colors.semantic.error + '60' : colors.border },
        Shadow.sm,
      ]}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <ThemedText variant="bodySm" style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>{item.staff_name}</ThemedText>
          {hasProblem && <Ionicons name="warning" size={14} color={Colors.semantic.error} />}
          <ThemedText variant="bodySm" style={{ fontWeight: '700', color: item.gross_pay > 0 ? colors.brand.primary : colors.textMuted }}>
            {fmtK(item.gross_pay)}
          </ThemedText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
        </View>
        <ThemedText variant="caption" color="muted">
          {item.staff_number ?? ''} · {item.pay_type === 'hourly' ? `${item.hours_worked}h` : 'Salary'}
          {item.currency ? ` · ${item.currency}` : ''}
        </ThemedText>

        {expanded && (
          <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
            {item.pay_type === 'salary' ? (
              <BRow label="Base Salary" value={item.base_salary} />
            ) : (
              <>
                <BRow label={`Hours (${item.hours_worked}h × K${item.hourly_rate}/hr)`} value={item.hours_worked * item.hourly_rate} />
                {item.overtime_hours > 0 && (
                  <BRow label={`Overtime (${item.overtime_hours}h × 1.5)`} value={item.overtime_hours * item.hourly_rate * 1.5} />
                )}
              </>
            )}
            {item.stipends_total > 0    && <BRow label="Stipends"    value={item.stipends_total}    color={Colors.semantic.success} />}
            {item.adjustments_total > 0 && <BRow label="Bonuses"     value={item.adjustments_total} color={Colors.semantic.success} />}
            {item.deductions_total > 0  && <BRow label="Deductions"  value={-item.deductions_total} color={Colors.semantic.error} />}
            <View style={[styles.grossRow, { borderTopColor: colors.border }]}>
              <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>Gross Pay</ThemedText>
              <ThemedText variant="bodySm" style={{ fontWeight: '700', color: colors.brand.primary }}>{fmtK(item.gross_pay)}</ThemedText>
            </View>
            {item.has_missing_banking && (
              <View style={styles.issueRow}>
                <Ionicons name="warning-outline" size={12} color={Colors.semantic.error} />
                <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginLeft: 4 }}>Missing bank account number</ThemedText>
              </View>
            )}
            {item.has_missing_tax_id && (
              <View style={styles.issueRow}>
                <Ionicons name="warning-outline" size={12} color={Colors.semantic.error} />
                <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginLeft: 4 }}>Missing Tax ID</ThemedText>
              </View>
            )}
            {item.bank_account && (
              <ThemedText variant="caption" color="muted">Bank: {item.bank_name ?? '—'} · {item.bank_account}</ThemedText>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function BRow({ label, value, color }: { label: string; value: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
      <ThemedText variant="caption" style={{ fontWeight: '600', color: color ?? colors.textPrimary }}>
        {value < 0 ? '-' : ''}K{Math.abs(value).toFixed(2)}
      </ThemedText>
    </View>
  );
}

export default function PreviewScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id: periodId } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: preview = [], isLoading, isError, refetch, isRefetching } = usePayPeriodPreview(schoolId, periodId ?? '');

  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return preview;
    const q = search.toLowerCase();
    return preview.filter((r) =>
      r.staff_name.toLowerCase().includes(q) ||
      (r.staff_number ?? '').toLowerCase().includes(q)
    );
  }, [preview, search]);

  const totalGross    = preview.reduce((s, r) => s + r.gross_pay, 0);
  const missingCount  = preview.filter((r) => r.has_missing_banking || r.has_missing_tax_id).length;

  function toggleExpand(staffId: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(staffId) ? n.delete(staffId) : n.add(staffId); return n; });
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Payroll Preview" showBack />
        <ErrorState title="Could not load preview" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Payroll Preview" showBack />

      {/* Summary */}
      {!isLoading && (
        <View style={styles.statsRow}>
          <StatCard label="Staff"    value={String(preview.length)}  icon="people-outline"         iconBg={colors.brand.primarySoft}      iconColor={colors.brand.primary}       style={{ flex: 1 }} />
          <StatCard label="Gross Total" value={fmtK(totalGross)}     icon="cash-outline"           iconBg={Colors.semantic.successLight}  iconColor={Colors.semantic.success}    style={{ flex: 1 }} />
          <StatCard label="Issues"   value={String(missingCount)}    icon="warning-outline"        iconBg={missingCount > 0 ? Colors.semantic.errorLight : colors.brand.primarySoft} iconColor={missingCount > 0 ? Colors.semantic.error : colors.brand.primary} style={{ flex: 1 }} />
        </View>
      )}

      <View style={{ paddingHorizontal: Spacing.screen, paddingBottom: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search staff…" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT, gap: Spacing.sm }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <ListItemSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <EmptyState title={search ? 'No results' : 'No staff'} description={search ? 'Try a different name.' : 'No active staff found.'} icon="people-outline" />
        ) : (
          filtered.map((item) => (
            <PreviewRow
              key={item.staff_id}
              item={item}
              expanded={expanded.has(item.staff_id)}
              onToggle={() => toggleExpand(item.staff_id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  statsRow:  { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  row:       { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  breakdown: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  grossRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, marginTop: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
  issueRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
});
