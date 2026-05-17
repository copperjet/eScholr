import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, FormField, Button,
  ToggleRow, Chip, Skeleton,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import { useTimetableSettings, useUpdateTimetableSettings, type TimetableSettings } from '../../../../hooks/useTimetableBuilder';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const SOLVER_PRESETS: { value: TimetableSettings['solver_preset']; label: string; description: string }[] = [
  { value: 'fast',     label: 'Fast',     description: 'Quick draft, fewer passes' },
  { value: 'balanced', label: 'Balanced', description: 'Good quality in ~60s' },
  { value: 'optimal',  label: 'Optimal',  description: 'Best result, longer runtime' },
];

interface SettingsForm {
  working_days: number[];
  periods_per_day: string;
  max_periods_per_teacher_day: string;
  max_consecutive_per_teacher: string;
  min_gap_same_subject_days: string;
  allow_double_periods: boolean;
  solver_preset: TimetableSettings['solver_preset'];
}

const DEFAULT_FORM: SettingsForm = {
  working_days: [1, 2, 3, 4, 5],
  periods_per_day: '8',
  max_periods_per_teacher_day: '6',
  max_consecutive_per_teacher: '3',
  min_gap_same_subject_days: '0',
  allow_double_periods: false,
  solver_preset: 'balanced',
};

function toForm(s: TimetableSettings): SettingsForm {
  return {
    working_days: s.working_days ?? [1, 2, 3, 4, 5],
    periods_per_day: String(s.periods_per_day),
    max_periods_per_teacher_day: String(s.max_periods_per_teacher_day),
    max_consecutive_per_teacher: String(s.max_consecutive_per_teacher),
    min_gap_same_subject_days: String(s.min_gap_same_subject_days),
    allow_double_periods: s.allow_double_periods,
    solver_preset: s.solver_preset,
  };
}

export default function TimetableSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const query  = useTimetableSettings(sid);
  const update = useUpdateTimetableSettings();

  const [form, setForm]   = useState<SettingsForm>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (query.data) {
      setForm(toForm(query.data));
      setDirty(false);
    }
  }, [query.data]);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const toggleDay = (day: number) => {
    setForm((f) => {
      const days = f.working_days.includes(day)
        ? f.working_days.filter((d) => d !== day)
        : [...f.working_days, day].sort();
      return { ...f, working_days: days };
    });
    setDirty(true);
  };

  const validate = (): string | null => {
    const ppd = Number(form.periods_per_day);
    if (!Number.isInteger(ppd) || ppd < 1 || ppd > 20) return 'Periods per day must be 1–20';
    const mppd = Number(form.max_periods_per_teacher_day);
    if (!Number.isInteger(mppd) || mppd < 1) return 'Max periods per teacher must be ≥ 1';
    const mc = Number(form.max_consecutive_per_teacher);
    if (!Number.isInteger(mc) || mc < 1) return 'Max consecutive must be ≥ 1';
    if (form.working_days.length === 0) return 'Select at least one working day';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { Alert.alert('Validation', err); return; }
    try {
      await update.mutateAsync({
        school_id: sid,
        working_days: form.working_days,
        periods_per_day: Number(form.periods_per_day),
        max_periods_per_teacher_day: Number(form.max_periods_per_teacher_day),
        max_consecutive_per_teacher: Number(form.max_consecutive_per_teacher),
        min_gap_same_subject_days: Number(form.min_gap_same_subject_days),
        allow_double_periods: form.allow_double_periods,
        solver_preset: form.solver_preset,
      });
      haptics.success();
      setDirty(false);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    }
  };

  if (query.isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Timetable Settings" showBack />
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={styles.skRow} />)}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Timetable Settings" showBack />

      <ScrollView contentContainerStyle={styles.content}>

        {/* Working Days */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Working Days</ThemedText>
          <View style={styles.chipRow}>
            {DAYS.map((d) => (
              <Chip
                key={d.value}
                label={d.label}
                selected={form.working_days.includes(d.value)}
                onPress={() => toggleDay(d.value)}
              />
            ))}
          </View>
        </View>

        {/* Period limits */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Period Limits</ThemedText>
          <FormField
            label="Periods per day"
            value={form.periods_per_day}
            onChangeText={(v) => set('periods_per_day', v)}
            keyboardType="number-pad"
            helper="Total slots in a school day (including breaks)"
          />
          <FormField
            label="Max periods per teacher per day"
            value={form.max_periods_per_teacher_day}
            onChangeText={(v) => set('max_periods_per_teacher_day', v)}
            keyboardType="number-pad"
          />
          <FormField
            label="Max consecutive periods per teacher"
            value={form.max_consecutive_per_teacher}
            onChangeText={(v) => set('max_consecutive_per_teacher', v)}
            keyboardType="number-pad"
            helper="Teacher gets a free period after this many consecutive lessons"
          />
          <FormField
            label="Min gap between same subject (days)"
            value={form.min_gap_same_subject_days}
            onChangeText={(v) => set('min_gap_same_subject_days', v)}
            keyboardType="number-pad"
            helper="0 = no gap required"
          />
        </View>

        {/* Double periods */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Double Periods</ThemedText>
          <ToggleRow
            label="Allow double periods"
            description="Subjects can occupy two consecutive slots"
            value={form.allow_double_periods}
            onValueChange={(v) => set('allow_double_periods', v)}
          />
        </View>

        {/* Solver preset */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Solver Preset</ThemedText>
          <ThemedText variant="caption" color="muted" style={styles.sectionSub}>
            Controls quality vs. speed tradeoff when auto-generating timetables
          </ThemedText>
          <View style={styles.presetRow}>
            {SOLVER_PRESETS.map((p) => (
              <Chip
                key={p.value}
                label={p.label}
                selected={form.solver_preset === p.value}
                onPress={() => set('solver_preset', p.value)}
              />
            ))}
          </View>
          {SOLVER_PRESETS.map((p) => form.solver_preset === p.value ? (
            <ThemedText key={p.value} variant="caption" color="muted">{p.description}</ThemedText>
          ) : null)}
        </View>

        <Button
          label={update.isPending ? 'Saving…' : (dirty || !query.data) ? 'Save Settings' : 'Saved'}
          onPress={handleSave}
          disabled={update.isPending || (!dirty && !!query.data)}
          style={styles.saveBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skeletons: { padding: Spacing.base, gap: Spacing.md },
  skRow: { height: 48, borderRadius: Radius.md },
  content: { padding: Spacing.base, gap: Spacing.xl, paddingBottom: 40 },
  section: { gap: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSub: { marginTop: -Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  presetRow: { flexDirection: 'row', gap: Spacing.sm },
  saveBtn: { marginTop: Spacing.sm },
});
