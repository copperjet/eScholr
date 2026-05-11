/**
 * Subject Teacher — Request Slot Swap
 * Pick one of your own slots + one slot from another teacher; send swap request.
 */
import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Alert, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, FormField, Skeleton, EmptyState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import { useRequestSlotSwap } from '../../../hooks/useTimetableLive';

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function useMySlots(schoolId: string, staffId: string) {
  return useQuery({
    queryKey: ['my-slots', schoolId, staffId],
    enabled: !!schoolId && !!staffId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt } = await db.from('timetables').select('id').eq('school_id', schoolId).eq('status', 'published').limit(1).single();
      if (!tt) return [];
      const { data, error } = await db
        .from('timetable_slots')
        .select('id, day_of_week, period_index, subjects:subject_id(name), streams:stream_id(name)')
        .eq('timetable_id', tt.id)
        .eq('staff_id', staffId)
        .eq('slot_type', 'lesson')
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useStaffSlots(schoolId: string, targetStaffId: string) {
  return useQuery({
    queryKey: ['staff-slots', schoolId, targetStaffId],
    enabled: !!schoolId && !!targetStaffId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt } = await db.from('timetables').select('id').eq('school_id', schoolId).eq('status', 'published').limit(1).single();
      if (!tt) return [];
      const { data, error } = await db
        .from('timetable_slots')
        .select('id, day_of_week, period_index, subjects:subject_id(name), streams:stream_id(name)')
        .eq('timetable_id', tt.id)
        .eq('staff_id', targetStaffId)
        .eq('slot_type', 'lesson')
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useStaff(schoolId: string) {
  return useQuery<{ id: string; full_name: string }[]>({
    queryKey: ['staff-active', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('staff').select('id, full_name').eq('school_id', schoolId).eq('is_active', true).order('full_name');
      return data ?? [];
    },
  });
}

function useTimetableId(schoolId: string) {
  return useQuery<string | null>({
    queryKey: ['published-tt-id', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('timetables').select('id').eq('school_id', schoolId).eq('status', 'published').limit(1).single();
      return (data as any)?.id ?? null;
    },
  });
}

function SlotRow({ slot, selected, onPress }: { slot: any; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.slotRow,
        {
          backgroundColor: selected ? colors.primary + '18' : colors.surface,
          borderColor:     selected ? colors.primary : colors.border,
        },
      ]}
    >
      <ThemedText style={[styles.slotDay, { color: selected ? colors.primary : colors.textMuted }]}>
        {DAY_NAMES[slot.day_of_week]} P{slot.period_index + 1}
      </ThemedText>
      <ThemedText style={{ flex: 1, fontSize: 13 }}>{slot.subjects?.name ?? '—'}</ThemedText>
      <ThemedText style={{ fontSize: 11, color: colors.textMuted }}>{slot.streams?.name ?? '—'}</ThemedText>
      {selected ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}

export default function SwapRequestScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const sid  = user?.schoolId ?? '';
  const myId = user?.staffId ?? '';

  const mySlotsQ   = useMySlots(sid, myId);
  const staffQ     = useStaff(sid);
  const ttIdQ      = useTimetableId(sid);
  const swapMut    = useRequestSlotSwap();

  const [mySlotId,     setMySlotId]     = useState('');
  const [targetStaffId, setTargetStaffId] = useState('');
  const [targetSlotId,  setTargetSlotId]  = useState('');
  const [swapDate,      setSwapDate]      = useState(new Date().toISOString().slice(0, 10));
  const [reason,        setReason]        = useState('');
  const [staffSearch,   setStaffSearch]   = useState('');
  const [saving,        setSaving]        = useState(false);

  const targetSlotsQ = useStaffSlots(sid, targetStaffId);
  const staff = staffQ.data ?? [];
  const filteredStaff = staff.filter((s) => s.id !== myId && s.full_name.toLowerCase().includes(staffSearch.toLowerCase()));
  const selectedTarget = staff.find((s) => s.id === targetStaffId);

  async function handleSubmit() {
    if (!mySlotId)     { Alert.alert('Required', 'Select one of your slots'); return; }
    if (!targetStaffId){ Alert.alert('Required', 'Select a target teacher'); return; }
    if (!targetSlotId) { Alert.alert('Required', 'Select a target slot'); return; }
    if (!swapDate)     { Alert.alert('Required', 'Enter swap date'); return; }
    if (!ttIdQ.data)   { Alert.alert('Error', 'No published timetable found'); return; }

    haptics('light');
    setSaving(true);
    try {
      await swapMut.mutateAsync({
        school_id:          sid,
        timetable_id:       ttIdQ.data,
        requester_staff_id: myId,
        target_staff_id:    targetStaffId,
        requester_slot_id:  mySlotId,
        target_slot_id:     targetSlotId,
        swap_date:          swapDate,
        reason:             reason.trim() || null,
      });
      haptics('success');
      Alert.alert('Sent', 'Swap request sent. Admin will review and notify both teachers.', [
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
      <ScreenHeader title="Request Slot Swap" subtitle="One-off date-specific swap" showBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* My slot */}
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR SLOT TO GIVE UP</ThemedText>
        {mySlotsQ.isLoading ? (
          <Skeleton height={48} />
        ) : (mySlotsQ.data ?? []).length === 0 ? (
          <EmptyState icon="calendar-outline" title="No slots" description="No published slots assigned to you" />
        ) : (
          (mySlotsQ.data ?? []).map((slot: any) => (
            <SlotRow key={slot.id} slot={slot} selected={mySlotId === slot.id} onPress={() => setMySlotId(slot.id)} />
          ))
        )}

        {/* Target teacher */}
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.base }]}>TARGET TEACHER</ThemedText>
        {selectedTarget ? (
          <TouchableOpacity onPress={() => { setTargetStaffId(''); setTargetSlotId(''); }} style={[styles.selectedChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}>
            <ThemedText style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>{selectedTarget.full_name}</ThemedText>
            <ThemedText style={{ fontSize: 12, color: colors.primary }}>tap to change</ThemedText>
          </TouchableOpacity>
        ) : (
          <>
            <FormField label="" value={staffSearch} onChangeText={setStaffSearch} placeholder="Search teacher…" />
            <View style={[styles.staffList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {filteredStaff.slice(0, 6).map((s) => (
                <TouchableOpacity key={s.id} onPress={() => { setTargetStaffId(s.id); setStaffSearch(''); }} style={[styles.staffItem, { borderBottomColor: colors.border }]}>
                  <ThemedText style={{ fontSize: 14 }}>{s.full_name}</ThemedText>
                </TouchableOpacity>
              ))}
              {filteredStaff.length === 0 ? <ThemedText style={{ padding: Spacing.sm, color: colors.textMuted, textAlign: 'center' }}>No match</ThemedText> : null}
            </View>
          </>
        )}

        {/* Target slot */}
        {targetStaffId ? (
          <>
            <ThemedText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.base }]}>THEIR SLOT TO TAKE</ThemedText>
            {targetSlotsQ.isLoading ? <Skeleton height={48} /> : (
              (targetSlotsQ.data ?? []).map((slot: any) => (
                <SlotRow key={slot.id} slot={slot} selected={targetSlotId === slot.id} onPress={() => setTargetSlotId(slot.id)} />
              ))
            )}
          </>
        ) : null}

        {/* Swap date + reason */}
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.base }]}>SWAP DATE</ThemedText>
        <FormField label="" value={swapDate} onChangeText={setSwapDate} placeholder="YYYY-MM-DD" />
        <FormField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Why you need this swap…" multiline />

        <Button label="Send swap request" onPress={handleSubmit} loading={saving} style={{ marginTop: Spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:      { padding: Spacing.base, paddingBottom: 60, gap: Spacing.xs },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginVertical: Spacing.xs },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, marginBottom: 4,
  },
  slotDay:      { fontSize: 12, fontWeight: '700', width: 54 },
  selectedChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  staffList:    { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  staffItem:    { padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
