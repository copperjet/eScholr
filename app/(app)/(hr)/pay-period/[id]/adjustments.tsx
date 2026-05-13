import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import { supabase } from '../../../../../lib/supabase';
import {
  ThemedText, ScreenHeader, Button, BottomSheet, Badge,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../../../components/ui';
import {
  usePayAdjustments,
  useAddAdjustment,
  useDeleteAdjustment,
  type PayAdjustment,
} from '../../../../../hooks/usePayroll';
import { Spacing, Radius, Shadow } from '../../../../../constants/Typography';
import { Colors } from '../../../../../constants/Colors';
import { haptics } from '../../../../../lib/haptics';

const KIND_OPTIONS: { value: PayAdjustment['kind']; label: string }[] = [
  { value: 'bonus',         label: 'Bonus'         },
  { value: 'stipend',       label: 'Stipend'        },
  { value: 'deduction',     label: 'Deduction'      },
  { value: 'advance',       label: 'Advance'        },
  { value: 'reimbursement', label: 'Reimbursement'  },
  { value: 'other',         label: 'Other'          },
];

const KIND_PRESET: Record<PayAdjustment['kind'], 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  bonus:         'success',
  stipend:       'info',
  reimbursement: 'info',
  other:         'default',
  deduction:     'error',
  advance:       'warning',
};

interface ActiveStaff { id: string; full_name: string; staff_number: string | null }

function useActiveStaff(schoolId: string) {
  return useQuery<ActiveStaff[]>({
    queryKey: ['active-staff-simple', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff').select('id, full_name, staff_number')
        .eq('school_id', schoolId).eq('status', 'active').order('full_name');
      if (error) throw error;
      return (data ?? []) as ActiveStaff[];
    },
  });
}

const BLANK_FORM = { staff_id: '', kind: 'bonus' as PayAdjustment['kind'], amount: '', reason: '' };

export default function AdjustmentsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id: periodId } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? '';

  const adjustments = usePayAdjustments(schoolId, periodId ?? '');
  const staffList   = useActiveStaff(schoolId);
  const add         = useAddAdjustment(schoolId);
  const del         = useDeleteAdjustment(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [staffSearch, setStaffSearch] = useState('');

  const filteredStaff = (staffList.data ?? []).filter((s) =>
    !staffSearch || s.full_name.toLowerCase().includes(staffSearch.toLowerCase()) || (s.staff_number ?? '').toLowerCase().includes(staffSearch.toLowerCase())
  );

  function handleAdd() {
    if (!form.staff_id || !form.amount) return;
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;
    add.mutate(
      { staff_id: form.staff_id, pay_period_id: periodId!, kind: form.kind, amount: amt, reason: form.reason || null, created_by: staffId },
      {
        onSuccess: () => { haptics.success(); setSheetVisible(false); setForm(BLANK_FORM); setStaffSearch(''); },
        onError:   () => haptics.error(),
      },
    );
  }

  function handleDelete(adj: PayAdjustment) {
    Alert.alert(
      'Delete Adjustment',
      `Remove ${adj.kind} of K${Number(adj.amount).toFixed(2)} for ${adj.staff?.full_name ?? ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => del.mutate({ adjustmentId: adj.id, pay_period_id: periodId! }) },
      ],
    );
  }

  const rows = adjustments.data ?? [];
  const totalPositive = rows.filter((r) => r.kind !== 'deduction' && r.kind !== 'advance').reduce((s, r) => s + r.amount, 0);
  const totalNegative = rows.filter((r) => r.kind === 'deduction' || r.kind === 'advance').reduce((s, r) => s + r.amount, 0);

  if (adjustments.isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Adjustments" showBack />
        <ErrorState title="Could not load adjustments" description="Try again." onRetry={adjustments.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Adjustments"
        showBack
        rightElement={
          <Pressable onPress={() => setSheetVisible(true)} style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        }
      />

      {rows.length > 0 && (
        <View style={[styles.summaryBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <ThemedText variant="caption" color="muted">Additions</ThemedText>
            <ThemedText variant="bodySm" style={{ fontWeight: '700', color: Colors.semantic.success }}>+K{totalPositive.toFixed(2)}</ThemedText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <ThemedText variant="caption" color="muted">Deductions</ThemedText>
            <ThemedText variant="bodySm" style={{ fontWeight: '700', color: Colors.semantic.error }}>-K{totalNegative.toFixed(2)}</ThemedText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <ThemedText variant="caption" color="muted">Rows</ThemedText>
            <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>{rows.length}</ThemedText>
          </View>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: 80, paddingTop: Spacing.md, gap: Spacing.sm }}
        refreshControl={<RefreshControl refreshing={adjustments.isRefetching} onRefresh={adjustments.refetch} tintColor={colors.brand.primary} />}
      >
        {adjustments.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} />)
        ) : rows.length === 0 ? (
          <EmptyState
            title="No adjustments"
            description="Add bonuses, deductions, or advances for this period."
            icon="add-circle-outline"
          />
        ) : (
          rows.map((adj) => (
            <View key={adj.id} style={[styles.adjRow, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText variant="bodySm" style={{ fontWeight: '600' }} numberOfLines={1}>{adj.staff?.full_name ?? '—'}</ThemedText>
                <ThemedText variant="caption" color="muted">{adj.staff?.staff_number ?? ''}</ThemedText>
                {adj.reason ? <ThemedText variant="caption" color="muted" numberOfLines={1}>{adj.reason}</ThemedText> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <ThemedText
                  variant="bodySm"
                  style={{ fontWeight: '700', color: adj.kind === 'deduction' || adj.kind === 'advance' ? Colors.semantic.error : Colors.semantic.success }}
                >
                  {adj.kind === 'deduction' || adj.kind === 'advance' ? '-' : '+'}K{Number(adj.amount).toFixed(2)}
                </ThemedText>
                <Badge label={adj.kind} preset={KIND_PRESET[adj.kind]} size="sm" />
              </View>
              <Pressable onPress={() => handleDelete(adj)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={Colors.semantic.error} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Add sheet ── */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => { setSheetVisible(false); setForm(BLANK_FORM); setStaffSearch(''); }}
        title="Add Adjustment"
        snapHeight={520}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: Spacing.md }}>
            {/* Staff picker */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="label" color="muted">Staff Member *</ThemedText>
              <TextInput
                value={staffSearch}
                onChangeText={setStaffSearch}
                placeholder="Search staff…"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              />
              {staffSearch && filteredStaff.slice(0, 6).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => { setForm((f) => ({ ...f, staff_id: s.id })); setStaffSearch(s.full_name); }}
                  style={[styles.staffOption, { backgroundColor: form.staff_id === s.id ? colors.brand.primarySoft : colors.surface, borderColor: colors.border }]}
                >
                  <ThemedText variant="bodySm">{s.full_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">{s.staff_number ?? ''}</ThemedText>
                </Pressable>
              ))}
            </View>

            {/* Kind selector */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="label" color="muted">Type *</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                {KIND_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, kind: opt.value }))}
                    style={[
                      styles.kindChip,
                      { borderColor: form.kind === opt.value ? colors.brand.primary : colors.border, backgroundColor: form.kind === opt.value ? colors.brand.primarySoft : colors.surface },
                    ]}
                  >
                    <ThemedText variant="caption" style={{ fontWeight: '600', color: form.kind === opt.value ? colors.brand.primary : colors.textSecondary }}>{opt.label}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText variant="label" color="muted">Amount (K) *</ThemedText>
              <TextInput
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText variant="label" color="muted">Reason (optional)</ThemedText>
              <TextInput
                value={form.reason}
                onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
                placeholder="e.g. Q1 performance bonus"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              />
            </View>

            <Button
              label={add.isPending ? 'Adding…' : 'Add Adjustment'}
              variant="primary"
              fullWidth
              loading={add.isPending}
              disabled={!form.staff_id || !form.amount || parseFloat(form.amount) <= 0}
              onPress={handleAdd}
            />
            <Button label="Cancel" variant="secondary" fullWidth onPress={() => { setSheetVisible(false); setForm(BLANK_FORM); setStaffSearch(''); }} />
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  addBtn:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  summaryBar:   { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryItem:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, gap: 2 },
  summaryDivider: { width: StyleSheet.hairlineWidth },
  adjRow:       { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  fieldGroup:   { gap: Spacing.xs },
  input:        { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15 },
  staffOption:  { padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, gap: 2 },
  kindChip:     { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
});
