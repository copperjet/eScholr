import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, BottomSheet,
  EmptyState, ErrorState, ListItemSkeleton, Badge,
} from '../../../components/ui';
import {
  usePayPeriods,
  useCreatePayPeriod,
  type PayPeriod,
} from '../../../hooks/usePayroll';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

function statusPreset(s: PayPeriod['status']): 'success' | 'warning' | 'info' {
  switch (s) {
    case 'open':     return 'info';
    case 'locked':   return 'warning';
    case 'exported': return 'success';
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

function PeriodRow({ period, onPress }: { period: PayPeriod; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        Shadow.sm,
      ]}
    >
      <View style={[styles.periodIcon, { backgroundColor: period.status === 'open' ? colors.brand.primarySoft : colors.border }]}>
        <Ionicons
          name={period.status === 'exported' ? 'checkmark-circle' : period.status === 'locked' ? 'lock-closed' : 'time-outline'}
          size={20}
          color={period.status === 'open' ? colors.brand.primary : period.status === 'exported' ? Colors.semantic.success : Colors.semantic.warning}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="body" style={{ fontWeight: '600' }}>{period.period_label}</ThemedText>
        <ThemedText variant="caption" color="muted">
          {fmtDate(period.start_date)} – {fmtDate(period.end_date)}
        </ThemedText>
        {period.exported_at && (
          <ThemedText variant="caption" color="muted">Exported {fmtDate(period.exported_at)}</ThemedText>
        )}
      </View>
      <Badge label={period.status} preset={statusPreset(period.status)} size="sm" />
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export default function PayPeriodsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? '';

  const { data: periods = [], isLoading, isError, refetch } = usePayPeriods(schoolId);
  const create = useCreatePayPeriod(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [form, setForm] = useState({ period_label: '', start_date: '', end_date: '' });

  const openPeriod = periods.find((p) => p.status === 'open');

  function handleCreate() {
    if (!form.period_label.trim() || !form.start_date || !form.end_date) return;
    create.mutate(
      { period_label: form.period_label.trim(), start_date: form.start_date, end_date: form.end_date, created_by: staffId },
      {
        onSuccess: (result) => {
          haptics.success();
          setSheetVisible(false);
          setForm({ period_label: '', start_date: '', end_date: '' });
          router.push({ pathname: '/(app)/(hr)/pay-period/[id]', params: { id: result.id } } as any);
        },
        onError: () => haptics.error(),
      },
    );
  }

  function prefillDates() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 0);
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    setForm({
      period_label: label,
      start_date:   start.toISOString().slice(0, 10),
      end_date:     end.toISOString().slice(0, 10),
    });
    setSheetVisible(true);
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Pay Periods" showBack />
        <ErrorState title="Could not load pay periods" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Pay Periods"
        showBack
        rightElement={
          <Pressable onPress={prefillDates} style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        }
      />

      {openPeriod && (
        <View style={[styles.activeBanner, { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primaryMuted }]}>
          <Ionicons name="time-outline" size={16} color={colors.brand.primary} />
          <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: 6, color: colors.brand.primary }}>
            Open: <ThemedText variant="bodySm" style={{ fontWeight: '700', color: colors.brand.primary }}>{openPeriod.period_label}</ThemedText>
          </ThemedText>
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/(hr)/pay-period/[id]', params: { id: openPeriod.id } } as any)}
            style={[styles.goBtn, { borderColor: colors.brand.primary }]}
          >
            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '700' }}>Open</ThemedText>
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT, paddingTop: Spacing.md, gap: Spacing.sm }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)
        ) : periods.length === 0 ? (
          <EmptyState
            title="No pay periods"
            description="Create your first pay period to begin entering payroll inputs."
            icon="time-outline"
          />
        ) : (
          periods.map((p) => (
            <PeriodRow
              key={p.id}
              period={p}
              onPress={() => router.push({ pathname: '/(app)/(hr)/pay-period/[id]', params: { id: p.id } } as any)}
            />
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="New Pay Period"
        snapHeight={380}
      >
        <View style={{ gap: Spacing.md }}>
          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">Period Label *</ThemedText>
            <TextInput
              value={form.period_label}
              onChangeText={(v) => setForm((f) => ({ ...f, period_label: v }))}
              placeholder="e.g. 2026-05 or May 2026"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>
          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">Start Date * (YYYY-MM-DD)</ThemedText>
            <TextInput
              value={form.start_date}
              onChangeText={(v) => setForm((f) => ({ ...f, start_date: v }))}
              placeholder="2026-05-01"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">End Date * (YYYY-MM-DD)</ThemedText>
            <TextInput
              value={form.end_date}
              onChangeText={(v) => setForm((f) => ({ ...f, end_date: v }))}
              placeholder="2026-05-31"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <Button
            label={create.isPending ? 'Creating…' : 'Create Period'}
            variant="primary"
            fullWidth
            loading={create.isPending}
            disabled={!form.period_label.trim() || !form.start_date || !form.end_date}
            onPress={handleCreate}
          />
          <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheetVisible(false)} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  addBtn:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  activeBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.screen, marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  goBtn:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.md, borderWidth: 1 },
  row:          { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  periodIcon:   { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  fieldGroup:   { gap: Spacing.xs },
  input:        { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15 },
});
