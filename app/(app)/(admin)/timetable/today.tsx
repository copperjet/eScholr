/**
 * Admin — Today's Live View
 * Current period across school, overrides highlighted, free teachers shown.
 */
import React, { useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, Badge,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { usePeriods } from '../../../../hooks/useTimetableBuilder';
import { useSlotOverrides } from '../../../../hooks/useTimetableLive';

const TODAY = new Date().toISOString().slice(0, 10);
const NOW_DOW = new Date().getDay() || 7;

function currentMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function useTodaySlots(schoolId: string) {
  return useQuery({
    queryKey: ['today-slots', schoolId, TODAY],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt } = await db.from('timetables').select('id').eq('school_id', schoolId).eq('status', 'published').limit(1).single();
      if (!tt) return [];
      const { data, error } = await db
        .from('timetable_slots')
        .select('id, stream_id, period_index, day_of_week, subject_id, staff_id, room_id, slot_type, streams:stream_id(name), subjects:subject_id(name), staff:staff_id(full_name), rooms:room_id(code)')
        .eq('timetable_id', tt.id)
        .eq('school_id', schoolId)
        .eq('day_of_week', NOW_DOW)
        .eq('slot_type', 'lesson');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useFreeTeachers(schoolId: string) {
  return useQuery({
    queryKey: ['today-free-teachers', schoolId, TODAY],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt } = await db.from('timetables').select('id').eq('school_id', schoolId).eq('status', 'published').limit(1).single();
      if (!tt) return [];
      const { data: busyStaff } = await db
        .from('timetable_slots')
        .select('staff_id')
        .eq('timetable_id', tt.id)
        .eq('school_id', schoolId)
        .eq('day_of_week', NOW_DOW)
        .eq('slot_type', 'lesson')
        .not('staff_id', 'is', null);
      const busyIds = (busyStaff ?? []).map((s: any) => s.staff_id).filter(Boolean);

      const { data: all } = await db
        .from('staff')
        .select('id, full_name')
        .eq('school_id', schoolId)
        .eq('is_active', true);
      return (all ?? []).filter((s: any) => !busyIds.includes(s.id)) as { id: string; full_name: string }[];
    },
  });
}

export default function TodayScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const sid = user?.schoolId ?? '';

  const periodsQ   = usePeriods(sid);
  const todaySlotsQ = useTodaySlots(sid);
  const overridesQ = useSlotOverrides(sid, TODAY);
  const freeQ      = useFreeTeachers(sid);

  const periods  = periodsQ.data ?? [];
  const slots    = todaySlotsQ.data ?? [];
  const overrides = overridesQ.data ?? [];
  const free     = freeQ.data ?? [];

  const nowMin = currentMinutes();
  const activePeriod = useMemo(() => periods.find((p) => {
    if (p.is_break || p.is_assembly) return false;
    const [sh, sm] = p.start_time.split(':').map(Number);
    const [eh, em] = p.end_time.split(':').map(Number);
    return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
  }), [periods, nowMin]);

  const overrideMap: Record<string, typeof overrides[0]> = {};
  for (const o of overrides) overrideMap[o.base_slot_id] = o;

  const isLoading = periodsQ.isLoading || todaySlotsQ.isLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Today's View"
        subtitle={`${TODAY} · ${activePeriod ? `Period ${activePeriod.name} now` : 'No active period'}`}
        showBack
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={todaySlotsQ.isFetching}
            onRefresh={() => { todaySlotsQ.refetch(); overridesQ.refetch(); }}
          />
        }
      >
        {/* Active period banner */}
        {activePeriod ? (
          <View style={[styles.activeBanner, { backgroundColor: colors.primary }]}>
            <Ionicons name="time" size={18} color="#fff" />
            <ThemedText style={styles.activeBannerText}>
              {activePeriod.name} now · {activePeriod.start_time} – {activePeriod.end_time}
            </ThemedText>
          </View>
        ) : null}

        {/* Today's slots with override highlights */}
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted }]}>TODAY'S SCHEDULE</ThemedText>

        {isLoading ? (
          [1,2,3,4].map((i) => <Skeleton key={i} height={64} style={{ marginBottom: 8 }} />)
        ) : slots.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No classes today" description="No published timetable or no lessons scheduled" />
        ) : (
          slots.map((slot: any) => {
            const override = overrideMap[slot.id];
            const isCancelled = override?.override_type === 'cancel';
            const isSubstituted = override && !isCancelled;

            return (
              <View
                key={slot.id}
                style={[
                  styles.slotRow,
                  {
                    backgroundColor: isCancelled ? '#FEF2F2' : isSubstituted ? '#EFF6FF' : colors.surface,
                    borderColor: isCancelled ? '#FECACA' : isSubstituted ? '#BFDBFE' : colors.border,
                  },
                ]}
              >
                <View style={styles.slotLeft}>
                  <ThemedText style={styles.periodTag}>P{slot.period_index + 1}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.subjectName}>{(slot.subjects as any)?.name ?? '—'}</ThemedText>
                  <ThemedText style={[styles.meta, { color: colors.textMuted }]}>
                    {(slot.streams as any)?.name ?? '—'} · {(slot.rooms as any)?.code ?? '—'}
                  </ThemedText>
                  {isSubstituted ? (
                    <ThemedText style={[styles.meta, { color: '#1D4ED8' }]}>
                      SUB: {(slot.staff as any)?.full_name ?? '—'} → covering
                    </ThemedText>
                  ) : isCancelled ? (
                    <ThemedText style={[styles.meta, { color: '#DC2626' }]}>CANCELLED</ThemedText>
                  ) : (
                    <ThemedText style={[styles.meta, { color: colors.textMuted }]}>
                      {(slot.staff as any)?.full_name ?? '—'}
                    </ThemedText>
                  )}
                </View>
                {(isSubstituted || isCancelled) ? (
                  <Badge
                    label={isCancelled ? 'cancelled' : 'covered'}
                    variant={isCancelled ? 'error' : 'default'}
                  />
                ) : null}
              </View>
            );
          })
        )}

        {/* Free teachers */}
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted, marginTop: Spacing.lg }]}>
          FREE TEACHERS TODAY ({free.length})
        </ThemedText>
        {freeQ.isLoading ? (
          <Skeleton height={48} />
        ) : free.length === 0 ? (
          <ThemedText style={[styles.meta, { color: colors.textMuted, marginBottom: Spacing.md }]}>
            All teachers are scheduled today.
          </ThemedText>
        ) : (
          <View style={styles.freeRow}>
            {free.map((t) => (
              <View
                key={t.id}
                style={[styles.freeChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="person-circle-outline" size={14} color={colors.primary} />
                <ThemedText style={[styles.meta, { color: colors.textPrimary }]}>{t.full_name}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:         { padding: Spacing.base, gap: Spacing.xs, paddingBottom: 60 },
  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.sm,
  },
  activeBannerText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginVertical: Spacing.xs },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, marginBottom: 6,
  },
  slotLeft:     { width: 28, alignItems: 'center' },
  periodTag:    { fontSize: 11, fontWeight: '700' },
  subjectName:  { fontSize: 13, fontWeight: '600' },
  meta:         { fontSize: 11 },
  freeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  freeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1,
  },
});
