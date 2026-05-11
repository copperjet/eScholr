/**
 * Per-room schedule view for a timetable
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
import { useRoomTimetableView, usePeriods, type RoomType } from '../../../../../hooks/useTimetableBuilder';

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
];

const ROOM_TYPE_ICON: Record<RoomType, React.ComponentProps<typeof Ionicons>['name']> = {
  classroom:    'school-outline',
  lab:          'flask-outline',
  computer_lab: 'desktop-outline',
  hall:         'people-outline',
  library:      'library-outline',
  sports:       'football-outline',
  other:        'business-outline',
};

interface RoomItem { id: string; name: string; code: string; room_type: RoomType; capacity: number | null; }

function useRoomList(schoolId: string) {
  return useQuery<RoomItem[]>({
    queryKey: ['ttb-rooms-view', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rooms').select('id, name, code, room_type, capacity')
        .eq('school_id', schoolId).eq('is_active', true).order('code');
      if (error) throw error;
      return (data ?? []) as RoomItem[];
    },
  });
}

function useSubjectMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['ttb-subjects-map', schoolId],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('subjects').select('id, name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.name;
      return m;
    },
  });
}

function useStaffMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['ttb-staff-map', schoolId],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('staff').select('id, full_name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.full_name;
      return m;
    },
  });
}

function useStreamMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['ttb-streams-map', schoolId],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('streams').select('id, name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.name;
      return m;
    },
  });
}

export default function RoomViewScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = user?.schoolId ?? '';

  const roomsQ    = useRoomList(sid);
  const periodsQ  = usePeriods(sid);
  const subjectsQ = useSubjectMap(sid);
  const staffQ    = useStaffMap(sid);
  const streamsQ  = useStreamMap(sid);

  const [search, setSearch]   = useState('');
  const [selectedRoomId, setSelected] = useState<string | null>(null);

  const slotsQ = useRoomTimetableView(id, sid, selectedRoomId ?? '');

  const rooms = useMemo(() => {
    const all = roomsQ.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [roomsQ.data, search]);

  const periods  = (periodsQ.data ?? []).filter((p) => !p.is_break && !p.is_assembly);
  const slots    = slotsQ.data ?? [];
  const subjects = subjectsQ.data ?? {};
  const staff    = staffQ.data ?? {};
  const streams  = streamsQ.data ?? {};

  const totalSlots = DAYS.length * periods.length;
  const utilPct = totalSlots > 0 ? Math.round((slots.length / totalSlots) * 100) : 0;

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
        title="Room Schedule"
        subtitle={selectedRoomId && !slotsQ.isLoading ? `${utilPct}% utilization · tap cell to edit` : undefined}
        showBack
      />

      <View style={styles.container}>
        {/* Room list */}
        <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search rooms…" />
          <ScrollView>
            {roomsQ.isLoading ? (
              [1,2,3].map((i) => <Skeleton key={i} height={44} style={{ margin: 4 }} />)
            ) : (
              rooms.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => { haptics('light'); setSelected(r.id); }}
                  style={[
                    styles.roomRow,
                    { borderBottomColor: colors.border },
                    selectedRoomId === r.id && { backgroundColor: colors.primary + '15' },
                  ]}
                >
                  <View style={styles.roomRowTop}>
                    <Ionicons
                      name={ROOM_TYPE_ICON[r.room_type] ?? 'business-outline'}
                      size={13}
                      color={selectedRoomId === r.id ? colors.primary : colors.textMuted}
                      style={{ marginRight: 4 }}
                    />
                    <ThemedText style={[styles.roomCode, selectedRoomId === r.id && { color: colors.primary }]}>
                      {r.code}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.roomName, { color: colors.textSecondary }]} numberOfLines={1}>{r.name}</ThemedText>
                  {r.capacity ? (
                    <ThemedText style={[styles.roomCap, { color: colors.textMuted }]}>{r.capacity} cap</ThemedText>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        {/* Grid */}
        <View style={{ flex: 1 }}>
          {!selectedRoomId ? (
            <EmptyState icon="business-outline" title="Select room" description="" />
          ) : slotsQ.isLoading ? (
            <View style={{ padding: Spacing.md }}>
              <Skeleton height={200} />
            </View>
          ) : slots.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Room unused" description="No lessons assigned to this room" />
          ) : (
            /* utilization bar */
            <View style={[styles.utilBar, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
              <ThemedText style={[styles.utilText, { color: colors.textSecondary }]}>
                Utilization: {slots.length}/{totalSlots} slots · {utilPct}% · tap cell to edit
              </ThemedText>
            </View>
          )}
          {selectedRoomId && !slotsQ.isLoading && slots.length > 0 ? (
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
                              <ThemedText style={[styles.cellTeacher, { color: colors.textMuted }]} numberOfLines={1}>
                                {(staff[slot.staff_id ?? ''] ?? '').split(' ').slice(-1)[0]}
                              </ThemedText>
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
  sidebar:     { width: 160, borderRightWidth: 1 },
  roomRow:     { padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  roomRowTop:  { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  roomCode:    { fontSize: 13, fontWeight: '700' },
  roomName:    { fontSize: 11, marginTop: 1 },
  roomCap:     { fontSize: 10, marginTop: 1 },
  utilBar:     { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  utilText:    { fontSize: 11 },
  row:         { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  periodLabel: { justifyContent: 'center', padding: 4, borderRightWidth: 1, borderBottomWidth: 1, height: 48 },
  dayHeader:   { justifyContent: 'center', alignItems: 'center', height: 48, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: 1 },
  cell:        { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: StyleSheet.hairlineWidth },
  cellSubject: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cellStream:  { fontSize: 10, textAlign: 'center', marginTop: 1 },
  cellTeacher: { fontSize: 9, textAlign: 'center', marginTop: 1 },
});
