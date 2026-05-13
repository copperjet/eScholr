import React, { useState, useCallback, useMemo } from 'react';
import {
  View, StyleSheet, SafeAreaView, Pressable, Alert, TextInput, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState, BottomSheet, Button, Badge,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import {
  useFeeCategories, useFeeSchedules, useUpsertFeeSchedule, useDeleteFeeSchedule,
  type FeeSchedule,
} from '../../../hooks/useInvoices';
import { useSemesters } from '../../../hooks/useAdmin';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

function useGradesAndStreams(schoolId: string) {
  return useQuery({
    queryKey: ['grades-streams', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('grades')
        .select('id, name, streams(id, name)')
        .eq('school_id', schoolId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; streams: { id: string; name: string }[] }[];
    },
  });
}

interface PickerRowProps {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (v: string) => void;
  colors: any;
}

function PickerRow({ label, value, options, onSelect, colors }: PickerRowProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <ThemedText variant="label" color="muted" style={styles.fieldLabel}>{label}</ThemedText>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' }]}
      >
        <ThemedText style={{ flex: 1, color: selected ? colors.textPrimary : colors.textMuted }}>
          {selected?.label ?? 'Select…'}
        </ThemedText>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
      {open && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => { onSelect(o.value); setOpen(false); }}
              style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
            >
              <ThemedText style={{ color: o.value === value ? colors.brand.primary : colors.textPrimary, fontWeight: o.value === value ? '600' : '400' }}>
                {o.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function FeeSchedulesScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: semesters = [] } = useSemesters(schoolId);
  const activeSem = semesters.find((s) => s.is_active) ?? semesters[0];
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const effectiveSemId = semesterId ?? activeSem?.id ?? null;

  const { data: categories = [] } = useFeeCategories(schoolId);
  const { data: gradesRaw = [] } = useGradesAndStreams(schoolId);
  const { data: schedules = [], isLoading, isError, refetch } = useFeeSchedules(schoolId, effectiveSemId);
  const upsert = useUpsertFeeSchedule(schoolId);
  const deleteSched = useDeleteFeeSchedule(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Partial<FeeSchedule> | null>(null);
  const [catId, setCatId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');

  const semesterOptions = useMemo(() =>
    semesters.map((s) => ({ label: s.name + (s.is_active ? ' (active)' : ''), value: s.id })),
    [semesters]);
  const catOptions = useMemo(() =>
    [{ label: 'All categories', value: '' }, ...categories.map((c) => ({ label: c.name, value: c.id }))],
    [categories]);
  const gradeOptions = useMemo(() =>
    [{ label: '— All grades', value: '' }, ...gradesRaw.map((g) => ({ label: g.name, value: g.id }))],
    [gradesRaw]);
  const streamOptions = useMemo(() => {
    const grade = gradesRaw.find((g) => g.id === gradeId);
    return [
      { label: '— All streams', value: '' },
      ...(grade?.streams ?? []).map((s) => ({ label: s.name, value: s.id })),
    ];
  }, [gradesRaw, gradeId]);

  const openNew = useCallback(() => {
    setEditing(null);
    setCatId(categories[0]?.id ?? '');
    setGradeId(''); setStreamId(''); setAmount(''); setDueDate('');
    setSheetVisible(true);
  }, [categories]);

  const openEdit = useCallback((s: FeeSchedule) => {
    setEditing(s);
    setCatId(s.fee_category_id);
    setGradeId(s.grade_id ?? '');
    setStreamId(s.stream_id ?? '');
    setAmount(String(s.amount));
    setDueDate(s.due_date ?? '');
    setSheetVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!catId) { Alert.alert('Select a fee category'); return; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { Alert.alert('Enter a valid amount'); return; }
    if (!effectiveSemId) { Alert.alert('No active semester'); return; }
    haptics.medium();
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        fee_category_id: catId,
        semester_id: effectiveSemId,
        grade_id: gradeId || null,
        stream_id: streamId || null,
        amount: parsed,
        due_date: dueDate || null,
        is_mandatory: true,
      });
      haptics.success();
      setSheetVisible(false);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message?.includes('unique') ? 'A schedule for this category + grade + stream already exists.' : 'Could not save schedule.');
    }
  }, [catId, amount, gradeId, streamId, dueDate, editing, effectiveSemId, upsert]);

  const handleDelete = useCallback((s: FeeSchedule) => {
    Alert.alert('Delete Schedule', `Delete this ${s.fee_categories?.name ?? 'fee'} schedule?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          haptics.medium();
          try { await deleteSched.mutateAsync(s.id); haptics.success(); }
          catch { haptics.error(); Alert.alert('Error', 'Could not delete.'); }
        },
      },
    ]);
  }, [deleteSched]);

  // Group by fee category
  const grouped = useMemo(() => {
    const map = new Map<string, { catName: string; items: FeeSchedule[] }>();
    for (const s of schedules) {
      const key = s.fee_category_id;
      const name = s.fee_categories?.name ?? 'Unknown';
      if (!map.has(key)) map.set(key, { catName: name, items: [] });
      map.get(key)!.items.push(s);
    }
    return Array.from(map.values()).sort((a, b) => a.catName.localeCompare(b.catName));
  }, [schedules]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Fee Schedules" showBack />
        <ErrorState title="Could not load schedules" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Fee Schedules"
        showBack
        right={
          <Pressable onPress={openNew} style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        }
      />

      {/* Semester selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.semRow}>
        {semesters.map((s) => {
          const active = (semesterId ?? activeSem?.id) === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSemesterId(s.id)}
              style={[styles.semChip, {
                backgroundColor: active ? colors.brand.primary : colors.surfaceSecondary,
                borderColor: active ? colors.brand.primary : colors.border,
              }]}
            >
              <ThemedText style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textPrimary }}>
                {s.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
              <Skeleton width={120} height={14} />
              <Skeleton width="100%" height={50} style={{ marginTop: 8 }} />
            </View>
          ))
        ) : grouped.length === 0 ? (
          <EmptyState
            title="No fee schedules"
            description="Add schedules to define what each grade owes this term."
            icon="calculator-outline"
          />
        ) : (
          grouped.map(({ catName, items }) => (
            <View key={catName} style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
              <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>{catName.toUpperCase()}</ThemedText>
              {items.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => openEdit(s)}
                  style={[styles.schedRow, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                      <Badge
                        label={s.grades ? s.grades.name : 'All Grades'}
                        preset="neutral"
                      />
                      {s.streams && <Badge label={s.streams.name} preset="neutral" />}
                    </View>
                    {s.due_date && (
                      <ThemedText variant="caption" color="muted">Due {s.due_date}</ThemedText>
                    )}
                  </View>
                  <ThemedText variant="h4" style={{ color: colors.brand.primary }}>
                    K{Number(s.amount).toLocaleString()}
                  </ThemedText>
                  <Pressable onPress={() => handleDelete(s)} hitSlop={10} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={16} color={Colors.semantic.error} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editing ? 'Edit Schedule' : 'New Fee Schedule'}
        snapHeight={520}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PickerRow label="FEE CATEGORY" value={catId} options={catOptions.filter(o => o.value)} onSelect={setCatId} colors={colors} />
          <PickerRow label="GRADE (leave blank for all)" value={gradeId} options={gradeOptions} onSelect={(v) => { setGradeId(v); setStreamId(''); }} colors={colors} />
          {gradeId ? <PickerRow label="STREAM (leave blank for all)" value={streamId} options={streamOptions} onSelect={setStreamId} colors={colors} /> : null}

          <View style={styles.field}>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>AMOUNT (ZMW)</ThemedText>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>DUE DATE (optional, YYYY-MM-DD)</ThemedText>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="2026-03-31"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
            />
          </View>

          <View style={{ gap: Spacing.sm, marginTop: Spacing.base }}>
            <Button
              label={upsert.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Schedule'}
              variant="primary"
              fullWidth
              loading={upsert.isPending}
              onPress={handleSave}
            />
            <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheetVisible(false)} />
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  semRow: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingVertical: Spacing.sm },
  semChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  list: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 },
  card: { borderRadius: Radius.lg, padding: Spacing.md },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: Spacing.md },
  fieldLabel: { marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 15,
  },
  dropdown: {
    borderWidth: 1, borderRadius: Radius.md, marginTop: 4, overflow: 'hidden', zIndex: 100,
  },
  dropdownItem: {
    padding: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
