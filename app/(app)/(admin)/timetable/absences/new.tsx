/**
 * Admin — Report New Absence
 */
import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Alert, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, FormField,
} from '../../../../../components/ui';
import { Spacing, Radius } from '../../../../../constants/Typography';
import { haptics } from '../../../../../lib/haptics';
import { useReportAbsence, type AbsenceReason, type CoverStrategy } from '../../../../../hooks/useTimetableLive';

function useStaff(schoolId: string) {
  return useQuery<{ id: string; full_name: string }[]>({
    queryKey: ['staff-active', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

const REASONS: { value: AbsenceReason; label: string }[] = [
  { value: 'sick',     label: 'Sick leave' },
  { value: 'leave',    label: 'Approved leave' },
  { value: 'training', label: 'Training / PD' },
  { value: 'personal', label: 'Personal' },
  { value: 'other',    label: 'Other' },
];

const STRATEGIES: { value: CoverStrategy; label: string }[] = [
  { value: 'auto_substitute', label: 'Auto-assign substitute' },
  { value: 'study_hall',      label: 'Study hall (no sub)' },
  { value: 'cancel',          label: 'Cancel lessons' },
  { value: 'manual',          label: 'Manual (set later)' },
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
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor:     active ? colors.primary : colors.border,
              },
            ]}
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

export default function NewAbsenceScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const sid = user?.schoolId ?? '';

  const staffQ   = useStaff(sid);
  const reportMut = useReportAbsence();

  const today = new Date().toISOString().slice(0, 10);

  const [staffId,   setStaffId]   = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [reason,    setReason]    = useState<AbsenceReason>('sick');
  const [strategy,  setStrategy]  = useState<CoverStrategy>('auto_substitute');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [staffSearch, setStaffSearch] = useState('');

  const staff = staffQ.data ?? [];
  const filtered = staff.filter((s) =>
    s.full_name.toLowerCase().includes(staffSearch.toLowerCase()),
  );
  const selectedStaff = staff.find((s) => s.id === staffId);

  async function handleSave() {
    if (!staffId)     { Alert.alert('Required', 'Select a teacher'); return; }
    if (!startDate)   { Alert.alert('Required', 'Enter start date'); return; }
    if (!endDate)     { Alert.alert('Required', 'Enter end date'); return; }
    if (endDate < startDate) { Alert.alert('Invalid', 'End date must be ≥ start date'); return; }

    haptics('light');
    setSaving(true);
    try {
      await reportMut.mutateAsync({
        school_id:      sid,
        staff_id:       staffId,
        start_date:     startDate,
        end_date:       endDate,
        reason,
        cover_strategy: strategy,
        notes:          notes.trim() || null,
        reported_by:    user?.staffId ?? null,
      });
      haptics('success');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Report Absence" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <ThemedText style={[styles.label, { color: colors.textMuted }]}>TEACHER</ThemedText>
        {selectedStaff ? (
          <TouchableOpacity
            onPress={() => setStaffId('')}
            style={[styles.selectedChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}
          >
            <ThemedText style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>{selectedStaff.full_name}</ThemedText>
            <ThemedText style={{ fontSize: 12, color: colors.primary }}>tap to change</ThemedText>
          </TouchableOpacity>
        ) : (
          <>
            <FormField
              label=""
              value={staffSearch}
              onChangeText={setStaffSearch}
              placeholder="Search teacher name…"
            />
            <View style={[styles.staffList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {filtered.slice(0, 8).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => { setStaffId(s.id); setStaffSearch(''); }}
                  style={[styles.staffRow, { borderBottomColor: colors.border }]}
                >
                  <ThemedText style={{ fontSize: 14 }}>{s.full_name}</ThemedText>
                </TouchableOpacity>
              ))}
              {filtered.length === 0 ? (
                <ThemedText style={[styles.noResult, { color: colors.textMuted }]}>No match</ThemedText>
              ) : null}
            </View>
          </>
        )}

        <ThemedText style={[styles.label, { color: colors.textMuted, marginTop: Spacing.base }]}>DATES</ThemedText>
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

        <ThemedText style={[styles.label, { color: colors.textMuted, marginTop: Spacing.base }]}>COVER STRATEGY</ThemedText>
        <ChipSelect options={STRATEGIES} value={strategy} onSelect={setStrategy} colors={colors} />

        <View style={{ marginTop: Spacing.base }}>
          <FormField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Any additional info…" multiline />
        </View>

        <Button label="Save absence" onPress={handleSave} loading={saving} style={{ marginTop: Spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:      { padding: Spacing.base, paddingBottom: 60, gap: Spacing.xs },
  label:        { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: Spacing.xs },
  selectedChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  staffList:    { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  staffRow:     { padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  noResult:     { padding: Spacing.sm, textAlign: 'center', fontSize: 13 },
  dateRow:      { flexDirection: 'row', gap: Spacing.sm },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.xs },
  chip:         { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
});
