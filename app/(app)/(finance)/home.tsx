import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, FAB, BottomSheet, Button,
  ListItemSkeleton, EmptyState, ErrorState, SearchBar,
  StatCard, SectionHeader, Badge,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

interface FinanceStudent {
  id: string;
  student_id: string;
  status: 'paid' | 'unpaid';
  balance: number;
  students: { id: string; full_name: string; student_number: string; photo_url: string | null; grades: { name: string } | null; streams: { name: string } | null };
}

function useFinanceRecords(schoolId: string) {
  return useQuery({
    queryKey: ['finance-records', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data: sem } = await (supabase as any)
        .from('semesters').select('id, name')
        .eq('school_id', schoolId).eq('is_active', true).limit(1).single();
      const semesterId = (sem as any)?.id;
      if (!semesterId) return { records: [], semester: null };
      const { data, error } = await (supabase as any)
        .from('finance_records')
        .select('id, student_id, status, balance, students (id, full_name, student_number, photo_url, grades (name), streams (name))')
        .eq('school_id', schoolId).eq('semester_id', semesterId)
        .order('status', { ascending: true });
      if (error) throw error;
      return { records: (data ?? []) as unknown as FinanceStudent[], semester: sem };
    },
  });
}

function formatK(v: number) {
  if (v >= 1000) return `K${(v / 1000).toFixed(1)}k`;
  return `K${v.toLocaleString()}`;
}

export default function FinanceHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isError, refetch, isRefetching } = useFinanceRecords(schoolId);

  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkSheetVisible, setBulkSheetVisible] = useState(false);

  const records    = data?.records ?? [];
  const semester   = data?.semester as any;
  const paid       = records.filter(r => r.status === 'paid').length;
  const unpaid     = records.filter(r => r.status === 'unpaid').length;
  const outstanding = records.reduce((s, r) => s + Number(r.balance), 0);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      r.students?.full_name?.toLowerCase().includes(q) ||
      r.students?.student_number?.toLowerCase().includes(q)
    );
  }, [records, search]);

  const unpaidFiltered = filtered.filter(r => r.status === 'unpaid');
  const hasSelection   = selected.size > 0;

  const toggleSelect = useCallback((id: string) => {
    haptics.selection();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const bulkClear = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any).from('finance_records')
        .update({ status: 'paid', balance: 0, updated_by: user?.staffId, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      (supabase as any).from('audit_logs').insert({ school_id: schoolId, event_type: 'finance_status_changed', actor_id: user?.staffId, data: { action: 'bulk_clear_paid', count: ids.length } } as any).then(() => {});
    },
    onSuccess: () => { haptics.success(); setSelected(new Set()); setBulkSheetVisible(false); queryClient.invalidateQueries({ queryKey: ['finance-records'] }); },
    onError: () => haptics.error(),
  });

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load finance" description="Check your connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <ThemedText variant="caption" color="muted">{semester?.name ?? 'Finance'}</ThemedText>
          <ThemedText variant="h2">Finance</ThemedText>
        </View>
        {hasSelection ? (
          <Pressable
            onPress={() => setBulkSheetVisible(true)}
            style={[styles.actionBtn, { backgroundColor: Colors.semantic.success }]}
          >
            <Ionicons name="checkmark-done" size={16} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 4 }}>Clear {selected.size}</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(app)/(finance)/finance-reports' as any)}
            style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 4 }}>Reports</ThemedText>
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
          <Avatar name={user?.fullName ?? 'F'} photoUrl={school?.logo_url} size={40} />
        </Pressable>
      </View>

      {/* ── Summary stat row ── */}
      {!isLoading && (
        <View style={styles.statsRow}>
          <StatCard label="Paid"        value={String(paid)}       icon="checkmark-circle" iconBg={Colors.semantic.successLight} iconColor={Colors.semantic.success} style={{ flex: 1 }} />
          <StatCard label="Unpaid"      value={String(unpaid)}     icon="close-circle"     iconBg={Colors.semantic.errorLight}   iconColor={Colors.semantic.error}   style={{ flex: 1 }} />
          <StatCard label="Outstanding" value={outstanding > 0 ? formatK(outstanding) : '—'} icon="cash-outline" iconBg={Colors.semantic.warningLight} iconColor={Colors.semantic.warning} style={{ flex: 1 }} />
        </View>
      )}

      {/* ── Search + select-all ── */}
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search student…" />
        </View>
        {unpaidFiltered.length > 0 && !hasSelection && (
          <Pressable
            onPress={() => { haptics.medium(); setSelected(new Set(unpaidFiltered.map(r => r.id))); }}
            style={[styles.selectAllBtn, { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primaryMuted }]}
          >
            <ThemedText style={{ color: colors.brand.primary, fontWeight: '600', fontSize: 13 }}>Select all</ThemedText>
          </Pressable>
        )}
      </View>

      {/* ── List ── */}
      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No results' : 'No fee records'}
          description={search ? 'Try a different name or student number.' : 'No finance records for this semester.'}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item }) => (
            <FinanceRow
              record={item}
              selected={selected.has(item.id)}
              onPress={() => router.push({ pathname: '/(app)/(finance)/student-finance', params: { finance_record_id: item.id, student_name: item.students?.full_name } } as any)}
              onLongPress={() => toggleSelect(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
            />
          )}
        />
      )}

      {!hasSelection && unpaid > 0 && (
        <FAB
          icon={<Ionicons name="checkmark-done" size={22} color="#fff" />}
          label={`Mark all ${unpaid} paid`}
          onPress={() => { setSelected(new Set(unpaidFiltered.map(r => r.id))); setBulkSheetVisible(true); }}
          color={Colors.semantic.success}
        />
      )}

      <BottomSheet visible={bulkSheetVisible} onClose={() => setBulkSheetVisible(false)} title={`Clear ${selected.size} student${selected.size !== 1 ? 's' : ''}?`} snapHeight={280}>
        <View style={{ gap: Spacing.md }}>
          <ThemedText variant="body" color="secondary">
            Mark {selected.size} student{selected.size !== 1 ? 's' : ''} as{' '}
            <ThemedText variant="body" style={{ color: Colors.semantic.success, fontWeight: '700' }}>Paid</ThemedText> and set balance to zero.
          </ThemedText>
          <Button
            label={bulkClear.isPending ? 'Saving…' : 'Confirm — Mark Paid'}
            variant="primary"
            fullWidth
            loading={bulkClear.isPending}
            onPress={() => bulkClear.mutate(Array.from(selected))}
            iconLeft={<Ionicons name="checkmark-circle" size={18} color="#fff" />}
            style={{ backgroundColor: Colors.semantic.success }}
          />
          <Button label="Cancel" variant="secondary" fullWidth onPress={() => setBulkSheetVisible(false)} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function FinanceRow({ record, selected, onPress, onLongPress, onToggleSelect }: {
  record: FinanceStudent; selected: boolean;
  onPress: () => void; onLongPress: () => void; onToggleSelect: () => void;
}) {
  const { colors } = useTheme();
  const paid = record.status === 'paid';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? Colors.semantic.successLight : colors.surface,
          borderColor:     selected ? Colors.semantic.success : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
        Shadow.sm,
      ]}
    >
      <Pressable onPress={onToggleSelect} hitSlop={8} style={styles.checkbox}>
        <View style={[styles.checkboxInner, { backgroundColor: selected ? Colors.semantic.success : 'transparent', borderColor: selected ? Colors.semantic.success : colors.border }]}>
          {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
      </Pressable>
      <Avatar name={record.students?.full_name ?? '?'} photoUrl={record.students?.photo_url} size={42} />
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="h4" numberOfLines={1}>{record.students?.full_name}</ThemedText>
        <ThemedText variant="caption" color="muted">
          {[record.students?.student_number, record.students?.grades?.name, record.students?.streams?.name].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {!paid && Number(record.balance) > 0 && (
          <ThemedText style={{ color: Colors.semantic.error, fontWeight: '700', fontSize: 13 }}>
            K{Number(record.balance).toLocaleString()}
          </ThemedText>
        )}
        <Badge label={paid ? 'Paid' : 'Unpaid'} preset={paid ? 'success' : 'error'} />
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  topBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.md, gap: Spacing.sm },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  statsRow:   { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, marginBottom: Spacing.sm },
  searchRow:  { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingBottom: Spacing.sm, alignItems: 'center' },
  selectAllBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 1, borderRadius: Radius.full, borderWidth: 1 },
  skeletonList: { paddingHorizontal: Spacing.screen, gap: 0 },
  list:       { paddingHorizontal: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT, gap: Spacing.sm },
  row:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  checkbox:   { justifyContent: 'center', alignItems: 'center' },
  checkboxInner: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
