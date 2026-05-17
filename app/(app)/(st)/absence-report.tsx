/**
 * Subject Teacher — Report Own Absence
 */
import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Alert, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, FormField,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import { useReportAbsence, type AbsenceReason, type CoverStrategy } from '../../../hooks/useTimetableLive';

const REASONS: { value: AbsenceReason; label: string }[] = [
  { value: 'sick',     label: 'Sick' },
  { value: 'leave',    label: 'Leave' },
  { value: 'training', label: 'Training' },
  { value: 'personal', label: 'Personal' },
  { value: 'other',    label: 'Other' },
];

function ChipSelect<T extends string>({
  options, value, onSelect, colors,
}: {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
  colors: any;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onSelect(o.value)}
            style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}
          >
            <ThemedText style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textPrimary }}>
              {o.label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AbsenceReportScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const sid = user?.schoolId ?? '';

  const reportMut = useReportAbsence();
  const today = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [reason,    setReason]    = useState<AbsenceReason>('sick');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);

  async function handleSubmit() {
    if (!user?.staffId) { Alert.alert('Error', 'Could not identify your staff record'); return; }
    if (endDate < startDate) { Alert.alert('Invalid', 'End date must be ≥ start date'); return; }

    haptics('light');
    setSaving(true);
    try {
      await reportMut.mutateAsync({
        school_id:      sid,
        staff_id:       user.staffId,
        start_date:     startDate,
        end_date:       endDate,
        reason,
        cover_strategy: 'auto_substitute',
        notes:          notes.trim() || null,
        reported_by:    user.staffId,
      });
      haptics('success');
      Alert.alert('Submitted', 'Your absence has been reported. Admin will arrange cover.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to submit');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Report Absence" subtitle="Self-report for cover arrangement" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={[styles.infoBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
          <ThemedText style={{ fontSize: 13, color: colors.primary }}>
            Reporting for: <ThemedText style={{ fontWeight: '700' }}>{user?.fullName ?? '—'}</ThemedText>
          </ThemedText>
        </View>

        <ThemedText style={[styles.label, { color: colors.textMuted }]}>DATES</ThemedText>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <FormField label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
          </View>
        </View>

        <ThemedText style={[styles.label, { color: colors.textMuted }]}>REASON</ThemedText>
        <ChipSelect options={REASONS} value={reason} onSelect={setReason} colors={colors} />

        <View style={{ marginTop: Spacing.base }}>
          <FormField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Additional context for admin…" multiline />
        </View>

        <Button label="Submit absence report" onPress={handleSubmit} loading={saving} style={{ marginTop: Spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:  { padding: Spacing.base, paddingBottom: 60, gap: Spacing.sm },
  label:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: Spacing.xs },
  infoBox:  { padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  dateRow:  { flexDirection: 'row', gap: Spacing.sm },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
});
