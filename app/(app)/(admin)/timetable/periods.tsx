import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, FAB, BottomSheet, FormField,
  Button, Badge, EmptyState, ErrorState,
  ListItemSkeleton, FastList, ToggleRow,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import { usePeriods, useSavePeriods, type Period } from '../../../../hooks/useTimetableBuilder';

function formatTime(t: string): string {
  if (!t) return '';
  // Postgres returns HH:MM:SS — show HH:MM
  return t.slice(0, 5);
}

function validateTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t);
}

interface PeriodForm {
  period_index: number;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  is_assembly: boolean;
}

const emptyForm = (nextIndex: number): PeriodForm => ({
  period_index: nextIndex,
  name: '',
  start_time: '',
  end_time: '',
  is_break: false,
  is_assembly: false,
});

export default function PeriodsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const periodsQuery = usePeriods(sid);
  const savePeriods  = useSavePeriods(sid);

  const [sheet, setSheet]         = useState(false);
  const [editing, setEditing]     = useState<Period | null>(null);
  const [form, setForm]           = useState<PeriodForm>(emptyForm(0));
  const [formError, setFormError] = useState<Partial<Record<keyof PeriodForm, string>>>({});

  const periods = periodsQuery.data ?? [];

  const openAdd = useCallback(() => {
    const nextIndex = periods.length > 0 ? Math.max(...periods.map((p) => p.period_index)) + 1 : 0;
    setEditing(null);
    setForm(emptyForm(nextIndex));
    setFormError({});
    setSheet(true);
  }, [periods]);

  const openEdit = (period: Period) => {
    setEditing(period);
    setForm({
      period_index: period.period_index,
      name: period.name,
      start_time: formatTime(period.start_time),
      end_time: formatTime(period.end_time),
      is_break: period.is_break,
      is_assembly: period.is_assembly,
    });
    setFormError({});
    setSheet(true);
  };

  const validate = (): boolean => {
    const errs: typeof formError = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!validateTime(form.start_time)) errs.start_time = 'Use HH:MM format (e.g. 08:00)';
    if (!validateTime(form.end_time))   errs.end_time   = 'Use HH:MM format (e.g. 09:00)';
    if (validateTime(form.start_time) && validateTime(form.end_time) && form.end_time <= form.start_time) {
      errs.end_time = 'Must be after start time';
    }
    setFormError(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      // Remove the period being edited (if any) from the existing list
      const others = periods
        .filter((p) => !editing || p.id !== editing.id)
        .map((p) => ({
          period_index: p.period_index,
          name: p.name,
          start_time: formatTime(p.start_time),
          end_time: formatTime(p.end_time),
          is_break: p.is_break,
          is_assembly: p.is_assembly,
        }));

      const newEntry = {
        period_index: form.period_index,
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        is_break: form.is_break,
        is_assembly: form.is_assembly,
      };

      const merged = [...others, newEntry].sort((a, b) => a.period_index - b.period_index);
      await savePeriods.mutateAsync(merged);
      haptics.success();
      setSheet(false);
    } catch (err: any) {
      haptics.error();
      Alert.alert('Save failed', err.message ?? 'Unknown error');
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete Period', `Delete "${editing.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const remaining = periods
              .filter((p) => p.id !== editing.id)
              .map((p, idx) => ({
                period_index: idx,
                name: p.name,
                start_time: formatTime(p.start_time),
                end_time: formatTime(p.end_time),
                is_break: p.is_break,
                is_assembly: p.is_assembly,
              }));
            await savePeriods.mutateAsync(remaining);
            haptics.success();
            setSheet(false);
          } catch (err: any) {
            haptics.error();
            Alert.alert('Delete failed', err.message ?? 'Unknown error');
          }
        },
      },
    ]);
  };

  const isBusy = savePeriods.isPending;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Periods" showBack />

      {periodsQuery.isLoading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : periodsQuery.isError ? (
        <ErrorState description="Could not load periods" onRetry={() => periodsQuery.refetch()} />
      ) : periods.length === 0 ? (
        <EmptyState icon="time-outline" title="No periods" description="Tap + to define the daily schedule." />
      ) : (
        <FastList
          data={periods}
          keyExtractor={(p) => p.id}
          renderItem={({ item: period }) => (
            <TouchableOpacity
              style={[
                styles.row,
                { backgroundColor: colors.surface, borderColor: colors.border },
                period.is_break && { borderLeftWidth: 3, borderLeftColor: colors.brand.primarySoft },
              ]}
              onPress={() => openEdit(period)}
              activeOpacity={0.7}
            >
              <View style={[styles.indexBadge, { backgroundColor: colors.brand.primarySoft }]}>
                <ThemedText style={[styles.indexText, { color: colors.brand.primary }]}>
                  {period.period_index + 1}
                </ThemedText>
              </View>
              <View style={styles.rowMiddle}>
                <ThemedText style={styles.periodName}>{period.name}</ThemedText>
                <ThemedText variant="caption" color="muted">
                  {formatTime(period.start_time)} – {formatTime(period.end_time)}
                </ThemedText>
              </View>
              <View style={styles.rowBadges}>
                {period.is_break && <Badge label="Break" bg="#FEF3C7" fg="#92400E" />}
                {period.is_assembly && <Badge label="Assembly" bg="#EDE9FE" fg="#5B21B6" />}
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}

      <FAB icon="add-outline" label="Add Period" onPress={openAdd} />

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={editing ? 'Edit Period' : 'Add Period'}
        snapHeight={480}
      >
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <FormField
            label="Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="e.g. Period 1, Lunch, Assembly"
            error={formError.name}
          />
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <FormField
                label="Start Time *"
                value={form.start_time}
                onChangeText={(v) => setForm((f) => ({ ...f, start_time: v }))}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
                error={formError.start_time}
              />
            </View>
            <View style={styles.timeField}>
              <FormField
                label="End Time *"
                value={form.end_time}
                onChangeText={(v) => setForm((f) => ({ ...f, end_time: v }))}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
                error={formError.end_time}
              />
            </View>
          </View>
          <ToggleRow
            label="Break Period"
            description="Recess, lunch, or other non-teaching slot"
            value={form.is_break}
            onValueChange={(v) => setForm((f) => ({ ...f, is_break: v }))}
          />
          <ToggleRow
            label="Assembly Period"
            description="Marks this as the school assembly slot"
            value={form.is_assembly}
            onValueChange={(v) => setForm((f) => ({ ...f, is_assembly: v }))}
          />

          <View style={styles.sheetActions}>
            <Button
              label={isBusy ? 'Saving…' : editing ? 'Save Changes' : 'Add Period'}
              onPress={handleSave}
              disabled={isBusy}
            />
            {editing && (
              <Button
                label="Delete Period"
                variant="ghost"
                onPress={handleDelete}
                disabled={isBusy}
              />
            )}
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skeletons: { padding: Spacing.base, gap: Spacing.sm },
  list: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { fontSize: 13, fontWeight: '700' },
  rowMiddle: { flex: 1, gap: 2 },
  periodName: { fontSize: 15, fontWeight: '600' },
  rowBadges: { flexDirection: 'row', gap: Spacing.xs },
  sheetContent: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 40 },
  timeRow: { flexDirection: 'row', gap: Spacing.md },
  timeField: { flex: 1 },
  sheetActions: { gap: Spacing.sm, marginTop: Spacing.sm },
});
