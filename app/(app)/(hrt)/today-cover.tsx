/**
 * HRT — Today's Cover View
 * Shows today's effective timetable for the HRT's stream, highlighting overrides.
 */
import React, { useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { usePeriods } from '../../../hooks/useTimetableBuilder';
import { useSlotOverrides } from '../../../hooks/useTimetableLive';

const TODAY   = new Date().toISOString().slice(0, 10);
const NOW_DOW = new Date().getDay() || 7;

function currentMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function useStreamId(schoolId: string, staffId: string) {
  return useQuery<string | null>({
    queryKey: ['hrt-stream', schoolId, staffId],
    enabled: !!schoolId && !!staffId,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hrt_assignments')
        .select('stream_id')
        .eq('school_id', schoolId)
        .eq('staff_id', staffId)
        .limit(1)
        .single();
      return (data as any)?.stream_id ?? null;
    },
  });
}

function useTodayStreamSlots(schoolId: string, streamId: string | null) {
  return useQuery({
    queryKey: ['today-stream-slots', schoolId, streamId, TODAY],
    enabled: !!schoolId && !!streamId,
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt } = await db.from('timetables').select('id').eq('school_id', schoolId).eq('status', 'published').limit(1).single();
      if (!tt) return [];
      const { data, error } = await db
        .from('timetable_slots')
        .select('id, period_index, day_of_week, slot_type, subjects:subject_id(name), staff:staff_id(full_name), rooms:room_id(code)')
        .eq('timetable_id', tt.id)
        .eq('school_id', schoolId)
        .eq('stream_id', streamId)
        .eq('day_of_week', NOW_DOW)
        .eq('slot_type', 'lesson');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useStaffMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['staffmap', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('staff').select('id, full_name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.full_name;
      return m;
    },
  });
}

export default function TodayCoverScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const sid  = user?.schoolId ?? '';
  const myId = user?.staffId  ?? '';

  const streamIdQ = useStreamId(sid, myId);
  const streamId  = streamIdQ.data ?? null;

  const periodsQ  = usePeriods(sid);
  const slotsQ    = useTodayStreamSlots(sid, streamId);
  const overridesQ = useSlotOverrides(sid, TODAY);
  const staffMapQ  = useStaffMap(sid);

  const periods  = periodsQ.data ?? [];
  const slots    = slotsQ.data   ?? [];
  const overrides = overridesQ.data ?? [];
  const staffMap  = staffMapQ.data  ?? {};

  const nowMin = currentMinutes();
  const activePeriod = useMemo(() => periods.find((p) => {
    if (p.is_break || p.is_assembly) return false;
    const [sh, sm] = p.start_time.split(':').map(Number);
    const [eh, em] = p.end_time.split(':').map(Number);
    return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
  }), [periods, nowMin]);

  const overrideMap: Record<string, typeof overrides[0]> = {};
  for (const o of overrides) overrideMap[o.base_slot_id] = o;

  const isLoading = periodsQ.isLoading || slotsQ.isLoading || streamIdQ.isLoading;

  const sortedSlots = [...slots].sort((a, b) => a.period_index - b.period_index);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Today's Classes"
        subtitle={`${TODAY} · ${activePeriod ? `Period ${activePeriod.name} now` : 'No active period'}`}
        showBack
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={slotsQ.isFetching}
            onRefresh={() => { slotsQ.refetch(); overridesQ.refetch(); }}
          />
        }
      >
        {activePeriod ? (
          <View style={[styles.banner, { backgroundColor: colors.primary }]}>
            <Ionicons name="time" size={18} color="#fff" />
            <ThemedText style={styles.bannerText}>
              {activePeriod.name} now · {activePeriod.start_time} – {activePeriod.end_time}
            </ThemedText>
          </View>
        ) : null}

        {isLoading ? (
          [1,2,3,4].map((i) => <Skeleton key={i} height={64} style={{ marginBottom: 8 }} />)
        ) : !streamId ? (
          <EmptyState icon="school-outline" title="No class assigned" description="You have no homeroom class assigned yet" />
        ) : sortedSlots.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No classes today" description="No published lessons scheduled for today" />
        ) : (
          sortedSlots.map((slot: any) => {
            const override = overrideMap[slot.id];
            const isCancelled = override?.override_type === 'cancel';
            const isSubstituted = override && !isCancelled;
            const coverName = override?.override_staff_id ? (staffMap[override.override_staff_id] ?? '—') : null;

            const period = periods.find((p) => !p.is_break && !p.is_assembly && p.name === String(slot.period_index + 1))
              ?? periods[slot.period_index];

            return (
              <View
                key={slot.id}
                style={[
                  styles.slotRow,
                  {
                    backgroundColor: isCancelled ? '#FEF2F2' : isSubstituted ? '#EFF6FF' : colors.surface,
                    borderColor:     isCancelled ? '#FECACA' : isSubstituted ? '#BFDBFE' : colors.border,
                  },
                ]}
              >
                <View style={styles.slotLeft}>
                  <ThemedText style={[styles.periodTag, { color: colors.textMuted }]}>P{slot.period_index + 1}</ThemedText>
                  {period ? (
                    <ThemedText style={[styles.periodTime, { color: colors.textMuted }]}>{period.start_time}</ThemedText>
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.subjectName}>{slot.subjects?.name ?? '—'}</ThemedText>
                  <ThemedText style={[styles.meta, { color: colors.textMuted }]}>
                    {(slot.rooms as any)?.code ?? '—'}
                  </ThemedText>
                  {isCancelled ? (
                    <ThemedText style={[styles.meta, { color: '#DC2626', fontWeight: '600' }]}>CANCELLED</ThemedText>
                  ) : isSubstituted ? (
                    <ThemedText style={[styles.meta, { color: '#1D4ED8' }]}>
                      Cover: {coverName ?? (slot.staff as any)?.full_name ?? '—'}
                    </ThemedText>
                  ) : (
                    <ThemedText style={[styles.meta, { color: colors.textMuted }]}>
                      {(slot.staff as any)?.full_name ?? '—'}
                    </ThemedText>
                  )}
                </View>

                {isCancelled ? (
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                ) : isSubstituted ? (
                  <Ionicons name="swap-horizontal" size={20} color="#1D4ED8" />
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:    { padding: Spacing.base, gap: Spacing.xs, paddingBottom: 60 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.sm,
  },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, marginBottom: 6,
  },
  slotLeft:   { width: 40, alignItems: 'center' },
  periodTag:  { fontSize: 12, fontWeight: '700' },
  periodTime: { fontSize: 10 },
  subjectName:{ fontSize: 13, fontWeight: '600' },
  meta:       { fontSize: 11 },
});
