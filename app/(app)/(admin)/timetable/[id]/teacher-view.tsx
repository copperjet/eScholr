/**
 * Per-teacher schedule view for a timetable
 */
import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../../lib/supabase';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, EmptyState, Skeleton, SearchBar,
} from '../../../../../components/ui';
import { Spacing } from '../../../../../constants/Typography';
import { haptics } from '../../../../../lib/haptics';
import { useTeacherTimetableView, usePeriods } from '../../../../../hooks/useTimetableBuilder';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
];

interface StaffMember { id: string; full_name: string; }

function useStaffList(schoolId: string) {
  return useQuery<StaffMember[]>({
    queryKey: ['ttb-staff-view', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff').select('id, full_name')
        .eq('school_id', schoolId).eq('is_active', true)
        .in('role', ['st','hrt','hod','coordinator','principal'])
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as StaffMember[];
    },
  });
}

function useSubjectMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['ttb-subjects-map', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('subjects').select('id, name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.name;
      return m;
    },
  });
}

function useStreamMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['ttb-streams-map', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('streams').select('id, name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.name;
      return m;
    },
  });
}

function useRoomMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['ttb-rooms-map', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('rooms').select('id, code').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const r of data ?? []) m[r.id] = r.code;
      return m;
    },
  });
}

export default function TeacherViewScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = user?.schoolId ?? '';

  const staffQ      = useStaffList(sid);
  const periodsQ    = usePeriods(sid);
  const subjectsQ   = useSubjectMap(sid);
  const streamsQ    = useStreamMap(sid);
  const roomsQ      = useRoomMap(sid);

  const [search, setSearch]           = useState('');
  const [selectedStaffId, setSelected] = useState<string | null>(null);

  const slotsQ = useTeacherTimetableView(id, sid, selectedStaffId ?? '');

  const staff = useMemo(() => {
    const all = staffQ.data ?? [];
    if (!search.trim()) return all;
    return all.filter((s) => s.full_name.toLowerCase().includes(search.toLowerCase()));
  }, [staffQ.data, search]);

  const periods  = (periodsQ.data ?? []).filter((p) => !p.is_break && !p.is_assembly);
  const slots    = slotsQ.data ?? [];
  const subjects = subjectsQ.data ?? {};
  const streams  = streamsQ.data ?? {};
  const rooms    = roomsQ.data ?? {};

  // slot map: `${day}:${periodIndex}`
  const slotMap = useMemo(() => {
    const m: Record<string, typeof slots[0]> = {};
    for (const s of slots) m[`${s.day_of_week}:${s.period_index}`] = s;
    return m;
  }, [slots]);

  const CELL_W = 80;
  const CELL_H = 56;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Teacher Schedule"
        subtitle={selectedStaffId && slots.length > 0 ? `${slots.length} period${slots.length !== 1 ? 's' : ''}/week · tap cell to edit` : undefined}
        showBack
      />

      <View style={styles.container}>
        {/* Staff list */}
        <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search…" />
          <ScrollView>
            {staffQ.isLoading ? (
              [1,2,3].map((i) => <Skeleton key={i} height={44} style={{ margin: 4 }} />)
            ) : (
              staff.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => { haptics('light'); setSelected(s.id); }}
                  style={[
                    styles.staffRow,
                    { borderBottomColor: colors.border },
                    selectedStaffId === s.id && { backgroundColor: colors.primary + '15' },
                  ]}
                >
                  <ThemedText style={styles.staffName} numberOfLines={2}>{s.full_name}</ThemedText>
                  {selectedStaffId === s.id && <Ionicons name="chevron-forward" size={12} color={colors.primary} />}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        {/* Grid */}
        <View style={{ flex: 1 }}>
          {!selectedStaffId ? (
            <EmptyState icon="person-outline" title="Select teacher" description="" />
          ) : slotsQ.isLoading ? (
            <View style={{ padding: Spacing.md }}>
              <Skeleton height={200} />
            </View>
          ) : slots.length === 0 ? (
            <EmptyState icon="calendar-outline" title="No slots assigned" description="Teacher has no slots in this timetable" />
          ) : (
            <ScrollView horizontal>
              <ScrollView>
                {/* Header */}
                <View style={[styles.row, { backgroundColor: colors.surface }]}>
                  <View style={[styles.periodLabel, { width: 70, borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                    <ThemedText style={{ fontSize: 11, color: colors.textSecondary }}>Period</ThemedText>
                  </View>
                  {DAYS.map((d) => (
                    <View key={d.value} style={[styles.dayHeader, { width: CELL_W, borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                      <ThemedText style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>{d.label}</ThemedText>
                    </View>
                  ))}
                </View>

                {periods.map((p) => (
                  <View key={p.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                    <View style={[styles.periodLabel, { width: 70, borderRightColor: colors.border }]}>
                      <ThemedText style={{ fontSize: 11, fontWeight: '600' }}>{p.name}</ThemedText>
                      <ThemedText style={{ fontSize: 10, color: colors.textSecondary }}>{p.start_time.slice(0,5)}</ThemedText>
                    </View>
                    {DAYS.map((d) => {
                      const slot = slotMap[`${d.value}:${p.period_index}`];
                      const roomCode = slot?.room_id ? (rooms[slot.room_id] ?? '') : '';
                      return (
                        <TouchableOpacity
                          key={d.value}
                          disabled={!slot}
                          onPress={() => {
                            if (!slot) return;
                            haptics('light');
                            router.push(`/(app)/(admin)/timetable/${id}/grid?slotId=${slot.id}` as any);
                          }}
                          activeOpacity={slot ? 0.7 : 1}
                          style={[
                            styles.cell,
                            { width: CELL_W, height: CELL_H, borderRightColor: colors.border },
                            slot ? { backgroundColor: colors.primary + '15' } : { backgroundColor: colors.surface },
                          ]}
                        >
                          {slot ? (
                            <>
                              <ThemedText style={[styles.cellSubject, { color: colors.primary }]} numberOfLines={1}>
                                {subjects[slot.subject_id ?? ''] ?? '—'}
                              </ThemedText>
                              <ThemedText style={[styles.cellStream, { color: colors.textSecondary }]} numberOfLines={1}>
                                {streams[slot.stream_id] ?? '—'}
                              </ThemedText>
                              {roomCode ? (
                                <ThemedText style={[styles.cellRoom, { color: colors.textMuted }]} numberOfLines={1}>
                                  {roomCode}
                                </ThemedText>
                              ) : null}
                            </>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, flexDirection: 'row' },
  sidebar:     { width: 180, borderRightWidth: 1 },
  staffRow:    { padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  staffName:   { fontSize: 13, flex: 1 },
  row:         { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  periodLabel: { justifyContent: 'center', padding: 4, borderRightWidth: 1, borderBottomWidth: 1, height: 48 },
  dayHeader:   { justifyContent: 'center', alignItems: 'center', height: 48, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: 1 },
  cell:        { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: StyleSheet.hairlineWidth },
  cellSubject: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cellStream:  { fontSize: 10, textAlign: 'center', marginTop: 2 },
  cellRoom:    { fontSize: 9, textAlign: 'center', marginTop: 1 },
});
