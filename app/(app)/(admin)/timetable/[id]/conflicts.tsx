/**
 * Timetable Conflicts
 * Grouped by severity and kind. Tap row → jump to grid at that slot.
 */
import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, FastList, EmptyState, ErrorState,
  Skeleton, Badge,
} from '../../../../../components/ui';
import { Spacing, Radius } from '../../../../../constants/Typography';
import { haptics } from '../../../../../lib/haptics';
import {
  useTimetableConflicts,
  type TimetableConflict, type ConflictKind, type ConflictSeverity,
} from '../../../../../hooks/useTimetableBuilder';

// ── Config ────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<ConflictSeverity, number> = { error: 0, warning: 1, info: 2 };

const KIND_LABEL: Record<ConflictKind, string> = {
  teacher_clash:        'Teacher double-booked',
  room_clash:           'Room double-booked',
  period_count_short:   'Too few periods',
  period_count_over:    'Too many periods',
  unavailable_teacher:  'Teacher unavailable',
  room_capacity:        'Room over capacity',
  consecutive_exceeded: 'Too many consecutive',
  missing_room:         'No room assigned',
};

const KIND_ICON: Record<ConflictKind, React.ComponentProps<typeof Ionicons>['name']> = {
  teacher_clash:        'person-remove-outline',
  room_clash:           'business-outline',
  period_count_short:   'arrow-down-circle-outline',
  period_count_over:    'arrow-up-circle-outline',
  unavailable_teacher:  'calendar-clear-outline',
  room_capacity:        'people-outline',
  consecutive_exceeded: 'time-outline',
  missing_room:         'location-outline',
};

const SEVERITY_COLORS: Record<ConflictSeverity, { bg: string; text: string; border: string }> = {
  error:   { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  warning: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  info:    { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
};

// ── Grouped structure ────────────────────────────────────────

type GroupedConflicts = Array<{
  severity: ConflictSeverity;
  items: TimetableConflict[];
}>;

function groupConflicts(conflicts: TimetableConflict[]): GroupedConflicts {
  const bySeverity: Record<string, TimetableConflict[]> = {};
  for (const c of conflicts) {
    if (!bySeverity[c.severity]) bySeverity[c.severity] = [];
    bySeverity[c.severity].push(c);
  }
  return (['error', 'warning', 'info'] as ConflictSeverity[])
    .filter((s) => bySeverity[s]?.length > 0)
    .map((s) => ({ severity: s, items: bySeverity[s] }));
}

// ── Row ───────────────────────────────────────────────────────

function ConflictRow({
  conflict,
  colors,
  onPress,
}: {
  conflict: TimetableConflict;
  colors: any;
  onPress: () => void;
}) {
  const cfg = SEVERITY_COLORS[conflict.severity];
  const icon = KIND_ICON[conflict.kind] ?? 'alert-circle-outline';
  const label = KIND_LABEL[conflict.kind] ?? conflict.kind;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.text + '22' }]}>
        <Ionicons name={icon} size={18} color={cfg.text} />
      </View>
      <View style={styles.rowText}>
        <ThemedText style={[styles.rowKind, { color: cfg.text }]}>{label}</ThemedText>
        <ThemedText style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {conflict.description}
        </ThemedText>
      </View>
      {conflict.slot_id ? (
        <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
      ) : null}
    </TouchableOpacity>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function ConflictsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = user?.schoolId ?? '';

  const conflictsQ = useTimetableConflicts(id, sid);
  const [filter, setFilter] = useState<ConflictSeverity | 'all'>('all');

  const conflicts = conflictsQ.data ?? [];

  const filtered = useMemo(
    () => filter === 'all' ? conflicts : conflicts.filter((c) => c.severity === filter),
    [conflicts, filter],
  );

  const grouped = useMemo(() => groupConflicts(filtered), [filtered]);

  const counts = useMemo(() => ({
    error:   conflicts.filter((c) => c.severity === 'error').length,
    warning: conflicts.filter((c) => c.severity === 'warning').length,
    info:    conflicts.filter((c) => c.severity === 'info').length,
  }), [conflicts]);

  function jumpToSlot(conflict: TimetableConflict) {
    haptics('light');
    const params = conflict.slot_id ? `?slotId=${conflict.slot_id}` : '';
    router.push(`/(app)/(admin)/timetable/${id}/grid${params}` as any);
  }

  if (conflictsQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Conflicts" showBack />
        <View style={{ padding: Spacing.lg, gap: 8 }}>
          {[1,2,3].map((i) => <Skeleton key={i} height={72} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (conflictsQ.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Conflicts" showBack />
        <ErrorState message="Failed to load conflicts" onRetry={conflictsQ.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Conflicts"
        subtitle={conflicts.length === 0 ? 'All clear' : `${conflicts.length} unresolved · tap row to jump`}
        showBack
      />

      {/* Severity filter */}
      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        {(['all', 'error', 'warning', 'info'] as const).map((s) => {
          const active = filter === s;
          const count = s === 'all' ? conflicts.length : counts[s];
          const cfg = s !== 'all' ? SEVERITY_COLORS[s as ConflictSeverity] : null;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => { haptics('light'); setFilter(s); }}
              style={[
                styles.filterBtn,
                active && { borderBottomColor: cfg?.text ?? colors.primary, borderBottomWidth: 2 },
              ]}
            >
              <ThemedText style={[
                styles.filterLabel,
                active && { color: cfg?.text ?? colors.primary, fontWeight: '600' },
                !active && { color: colors.textSecondary },
              ]}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </ThemedText>
              {count > 0 ? (
                <View style={[
                  styles.filterBadge,
                  { backgroundColor: cfg?.bg ?? colors.surface, borderColor: cfg?.border ?? colors.border },
                ]}>
                  <ThemedText style={{ fontSize: 10, color: cfg?.text ?? colors.text }}>{count}</ThemedText>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="No conflicts"
          description={filter === 'all' ? 'Timetable looks clean' : `No ${filter}s found`}
        />
      ) : (
        <FastList
          data={grouped.flatMap((g) => [
            { type: 'header' as const, severity: g.severity, count: g.items.length },
            ...g.items.map((item) => ({ type: 'item' as const, conflict: item })),
          ])}
          keyExtractor={(item, i) =>
            item.type === 'header' ? `h-${item.severity}` : item.conflict.id
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const cfg = SEVERITY_COLORS[item.severity];
              return (
                <View style={[styles.groupHeader, { backgroundColor: colors.background }]}>
                  <ThemedText style={[styles.groupLabel, { color: cfg.text }]}>
                    {item.severity.toUpperCase()} · {item.count}
                  </ThemedText>
                </View>
              );
            }
            return (
              <ConflictRow
                conflict={item.conflict}
                colors={colors}
                onPress={() => jumpToSlot(item.conflict)}
              />
            );
          }}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.xs }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  filterBar:   { flexDirection: 'row', borderBottomWidth: 1 },
  filterBtn:   { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  filterLabel: { fontSize: 13 },
  filterBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, borderWidth: 1 },
  groupHeader: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs },
  groupLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  iconWrap:  { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowText:   { flex: 1 },
  rowKind:   { fontSize: 13, fontWeight: '600' },
  rowDesc:   { fontSize: 12, marginTop: 2 },
});
