/**
 * Compare Drafts — M9
 * Side-by-side split view of two timetable drafts.
 * Differences (slots present in one but not the other, or with different
 * subject/teacher) are highlighted in amber.
 *
 * Navigation:
 *   router.push('/(app)/(admin)/timetable/:id/compare?compareId=<other_id>')
 */
import React, { useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../../lib/supabase';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, Badge,
} from '../../../../../components/ui';
import { Spacing } from '../../../../../constants/Typography';
import {
  useTimetable, usePeriods, useTimetableSettings,
  type TimetableSlot,
} from '../../../../../hooks/useTimetableBuilder';

const CELL_W   = 72;
const CELL_H   = 52;
const LABEL_W  = 60;

const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

function useTimetableMeta(id: string, schoolId: string) {
  return useQuery<{ name: string; stream_ids: string[] }>({
    queryKey: ['tt-compare-meta', id, schoolId],
    enabled: !!id && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt } = await db.from('timetables').select('name').eq('id', id).single();
      const { data: sl } = await db.from('timetable_slots').select('stream_id').eq('timetable_id', id);
      const streamIds = [...new Set((sl ?? []).map((s: any) => s.stream_id as string))];
      return { name: tt?.name ?? id, stream_ids: streamIds };
    },
  });
}

function useSubjectMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['subjects-map', schoolId],
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

function buildSlotMap(slots: TimetableSlot[]) {
  const m = new Map<string, TimetableSlot>();
  for (const s of slots) m.set(`${s.stream_id}:${s.day_of_week}:${s.period_index}`, s);
  return m;
}

function isDiff(a: TimetableSlot | undefined, b: TimetableSlot | undefined) {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return a.subject_id !== b.subject_id || a.staff_id !== b.staff_id || a.room_id !== b.room_id;
}

interface MiniCellProps {
  slot: TimetableSlot | undefined;
  subjects: Record<string, string>;
  highlighted: boolean;
  colors: any;
}
function MiniCell({ slot, subjects, highlighted, colors }: MiniCellProps) {
  const bg = highlighted ? '#FEF3C7' : slot?.slot_type === 'lesson' ? '#EFF6FF' : colors.surfaceSecondary;
  const border = highlighted ? '#F59E0B' : colors.border;
  return (
    <View style={[
      mStyles.cell, { width: CELL_W, height: CELL_H, backgroundColor: bg, borderColor: border },
    ]}>
      {slot?.slot_type === 'lesson' && slot.subject_id ? (
        <ThemedText style={[mStyles.sub, { color: highlighted ? '#92400E' : '#1D4ED8' }]} numberOfLines={2}>
          {subjects[slot.subject_id] ?? '?'}
        </ThemedText>
      ) : null}
    </View>
  );
}
const mStyles = StyleSheet.create({
  cell: { borderWidth: 1, justifyContent: 'center', alignItems: 'center', padding: 2 },
  sub:  { fontSize: 9, fontWeight: '700', textAlign: 'center' },
});

export default function CompareScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  const { id, compareId } = useLocalSearchParams<{ id: string; compareId?: string }>();
  const [streamFilter, setStreamFilter] = useState<string | null>(null);

  const aQ = useTimetable(id, sid);
  const bQ = useTimetable(compareId ?? '', sid);
  const periodsQ = usePeriods(sid);
  const settingsQ = useTimetableSettings(sid);
  const subjectsQ = useSubjectMap(sid);
  const metaAQ = useTimetableMeta(id, sid);
  const metaBQ = useTimetableMeta(compareId ?? '', sid);

  const periods  = periodsQ.data ?? [];
  const subjects = subjectsQ.data ?? {};
  const teachingPeriods = useMemo(() => periods.filter((p) => !p.is_break && !p.is_assembly), [periods]);
  const days = useMemo(() => (settingsQ.data?.working_days ?? [1,2,3,4,5]).map((dow: number) => ({ dow, label: DAY_LABELS[dow] ?? `D${dow}` })), [settingsQ.data]);

  const aMap = useMemo(() => buildSlotMap(aQ.data ?? []), [aQ.data]);
  const bMap = useMemo(() => buildSlotMap(bQ.data ?? []), [bQ.data]);

  const allStreamIds = useMemo(() => {
    const s = new Set<string>();
    for (const k of aMap.keys()) s.add(k.split(':')[0]);
    for (const k of bMap.keys()) s.add(k.split(':')[0]);
    return [...s];
  }, [aMap, bMap]);

  const visibleStreamIds = streamFilter ? [streamFilter] : allStreamIds;

  const diffCount = useMemo(() => {
    let n = 0;
    for (const streamId of allStreamIds) {
      for (const day of (settingsQ.data?.working_days ?? [1,2,3,4,5]) as number[]) {
        for (const p of teachingPeriods) {
          const key = `${streamId}:${day}:${p.period_index}`;
          if (isDiff(aMap.get(key), bMap.get(key))) n++;
        }
      }
    }
    return n;
  }, [aMap, bMap, allStreamIds, teachingPeriods, settingsQ.data]);

  if (!compareId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Compare" showBack />
        <EmptyState icon="git-compare-outline" title="No comparison target" description="Pass ?compareId=<id> in the URL" />
      </SafeAreaView>
    );
  }

  const isLoading = aQ.isLoading || bQ.isLoading || periodsQ.isLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Comparing…" showBack />
        <View style={{ padding: Spacing.lg, gap: 12 }}>
          {[1,2,3].map((i) => <Skeleton key={i} height={80} />)}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Compare Drafts"
        subtitle={`${diffCount} diff${diffCount !== 1 ? 's' : ''}`}
        showBack
      />

      {/* Name row */}
      <View style={[styles.nameRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={styles.ttName} numberOfLines={1}>{metaAQ.data?.name ?? 'Draft A'}</ThemedText>
        </View>
        <Ionicons name="git-compare-outline" size={16} color={colors.textMuted} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={styles.ttName} numberOfLines={1}>{metaBQ.data?.name ?? 'Draft B'}</ThemedText>
        </View>
      </View>

      {/* Stream filter */}
      {allStreamIds.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <TouchableOpacity
            onPress={() => setStreamFilter(null)}
            style={[styles.chip, { backgroundColor: !streamFilter ? colors.primary : colors.surface, borderColor: colors.border }]}
          >
            <ThemedText style={{ color: !streamFilter ? '#fff' : colors.text, fontSize: 11 }}>All</ThemedText>
          </TouchableOpacity>
          {allStreamIds.map((sid2) => (
            <TouchableOpacity
              key={sid2}
              onPress={() => setStreamFilter(streamFilter === sid2 ? null : sid2)}
              style={[styles.chip, { backgroundColor: streamFilter === sid2 ? colors.primary : colors.surface, borderColor: colors.border }]}
            >
              <ThemedText style={{ color: streamFilter === sid2 ? '#fff' : colors.text, fontSize: 11 }}>
                {sid2.slice(0, 6)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Split grid */}
      <ScrollView horizontal>
        <ScrollView>
          {/* Header */}
          <View style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <View style={{ width: LABEL_W }}>
              <ThemedText style={styles.header}>Period</ThemedText>
            </View>
            {days.map((d) => (
              <React.Fragment key={d.dow}>
                {/* Two cells per day (A | B) */}
                <View style={[styles.daySpan, { width: CELL_W * 2, borderLeftColor: colors.border }]}>
                  <ThemedText style={styles.header}>{d.label}</ThemedText>
                </View>
              </React.Fragment>
            ))}
          </View>

          {visibleStreamIds.map((streamId) => (
            <View key={streamId}>
              <View style={[styles.streamBanner, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
                <ThemedText style={[styles.streamLabel, { color: colors.textSecondary }]}>
                  Stream: {streamId.slice(0, 8)}…
                </ThemedText>
              </View>
              {teachingPeriods.map((period) => (
                <View key={period.period_index} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <View style={[styles.periodLabel, { width: LABEL_W, borderRightColor: colors.border }]}>
                    <ThemedText style={styles.periodName}>{period.name}</ThemedText>
                  </View>
                  {days.map((d) => {
                    const key = `${streamId}:${d.dow}:${period.period_index}`;
                    const a = aMap.get(key);
                    const b = bMap.get(key);
                    const diff = isDiff(a, b);
                    return (
                      <React.Fragment key={d.dow}>
                        <MiniCell slot={a} subjects={subjects} highlighted={diff} colors={colors} />
                        <MiniCell slot={b} subjects={subjects} highlighted={diff} colors={colors} />
                      </React.Fragment>
                    );
                  })}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  nameRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  ttName:       { fontSize: 13, fontWeight: '600' },
  chipRow:      { paddingHorizontal: Spacing.base, paddingVertical: 6, maxHeight: 40 },
  chip:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1, marginRight: 6 },
  row:          { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  header:       { fontSize: 10, fontWeight: '600', textAlign: 'center', color: '#6B7280', padding: 4 },
  daySpan:      { justifyContent: 'center', alignItems: 'center', borderLeftWidth: StyleSheet.hairlineWidth },
  streamBanner: { paddingHorizontal: Spacing.base, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  streamLabel:  { fontSize: 11 },
  periodLabel:  { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: StyleSheet.hairlineWidth },
  periodName:   { fontSize: 10, fontWeight: '700' },
});
