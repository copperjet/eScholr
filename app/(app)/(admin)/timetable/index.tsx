/**
 * Timetable Builder — landing screen
 * Setup cards + timetable draft list
 */
import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, EmptyState, FAB, Badge,
  ModuleGate, ModuleDisabledScreen, Skeleton,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useRooms, usePeriods, useTimetableSettings,
  useTimetables, useCreateTimetable, useArchiveTimetable,
  type Timetable,
} from '../../../../hooks/useTimetableBuilder';

// ── Setup card ────────────────────────────────────────────────

interface SetupCardProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  description: string;
  count?: string;
  ready?: boolean;
  path: string;
}

function SetupCard({ icon, label, description, count, ready, path }: SetupCardProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => router.push(path as any)}
      activeOpacity={0.7}
    >
      <View style={[styles.cardIcon, { backgroundColor: colors.brand?.primarySoft ?? colors.primary + '22' }]}>
        <Ionicons name={icon} size={22} color={colors.brand?.primary ?? colors.primary} />
      </View>
      <View style={styles.cardText}>
        <ThemedText style={styles.cardLabel}>{label}</ThemedText>
        <ThemedText style={[styles.cardDesc, { color: colors.textSecondary }]}>{description}</ThemedText>
      </View>
      <View style={styles.cardRight}>
        {ready ? <Ionicons name="checkmark-circle" size={16} color="#16A34A" /> : null}
        {count !== undefined && !ready ? (
          <ThemedText style={[styles.cardCount, { color: colors.primary }]}>{count}</ThemedText>
        ) : null}
        <Ionicons name="chevron-forward-outline" size={16} color={colors.textMuted ?? colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

// ── Status badge ──────────────────────────────────────────────

const STATUS_VARIANT: Record<Timetable['status'], 'default' | 'success' | 'warning' | 'error'> = {
  draft:      'default',
  generating: 'warning',
  generated:  'warning',
  published:  'success',
  archived:   'default',
};

// ── Timetable list item ───────────────────────────────────────

function TimetableItem({ tt, onOpen, onArchive }: { tt: Timetable; onOpen: () => void; onArchive: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.ttItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onOpen}
      activeOpacity={0.75}
    >
      <View style={styles.ttItemLeft}>
        <ThemedText style={styles.ttName}>{tt.name}</ThemedText>
        <View style={styles.ttMeta}>
          <Badge label={tt.status} variant={STATUS_VARIANT[tt.status]} />
          {tt.generated_at ? (
            <ThemedText style={[styles.ttDate, { color: colors.textSecondary }]}>
              Generated {new Date(tt.generated_at).toLocaleDateString()}
            </ThemedText>
          ) : null}
        </View>
      </View>
      <View style={styles.ttActions}>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onArchive(); }}
          style={[styles.ttAction, { borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="archive-outline" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

// ── Main ─────────────────────────────────────────────────────

function TimetableIndexContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const rooms      = useRooms(sid);
  const periods    = usePeriods(sid);
  const settings   = useTimetableSettings(sid);
  const timetables = useTimetables(sid);
  const createTT   = useCreateTimetable();
  const archiveTT  = useArchiveTimetable();

  const [creating, setCreating] = useState(false);

  const roomCount   = rooms.data?.length ?? 0;
  const periodCount = periods.data?.length ?? 0;
  const hasSettings = !!settings.data;
  const ttList      = timetables.data ?? [];

  async function handleCreate() {
    haptics('light');
    Alert.prompt?.(
      'New Timetable',
      'Enter timetable name',
      async (name) => {
        if (!name?.trim()) return;
        setCreating(true);
        try {
          const { id } = await createTT.mutateAsync({
            school_id:        sid,
            name:             name.trim(),
            academic_year_id: null,
            semester_id:      null,
            created_by:       user?.id ?? null,
          });
          haptics('success');
          router.push(`/(app)/(admin)/timetable/${id}/grid` as any);
        } catch (e: any) {
          Alert.alert('Error', e.message ?? 'Failed to create');
        } finally {
          setCreating(false);
        }
      },
      'plain-text',
      'Semester 1 2026',
    );
  }

  function handleArchive(tt: Timetable) {
    haptics('light');
    Alert.alert(
      'Archive timetable',
      `Archive "${tt.name}"? It will no longer appear in the main list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive', style: 'destructive',
          onPress: () => archiveTT.mutate({ id: tt.id, school_id: sid }),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Timetable Builder" showBack />

      <ScrollView contentContainerStyle={styles.content}>

        {/* Setup section */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>SETUP</ThemedText>

          <SetupCard
            icon="business-outline"
            label="Rooms"
            description="Classrooms, labs, halls"
            count={roomCount > 0 ? String(roomCount) : undefined}
            ready={roomCount > 0}
            path="/(app)/(admin)/timetable/rooms"
          />
          <SetupCard
            icon="time-outline"
            label="Periods"
            description="Daily period schedule and breaks"
            count={periodCount > 0 ? String(periodCount) : undefined}
            ready={periodCount > 0}
            path="/(app)/(admin)/timetable/periods"
          />
          <SetupCard
            icon="settings-outline"
            label="Settings"
            description="Working days, constraints, solver preset"
            ready={hasSettings}
            path="/(app)/(admin)/timetable/settings"
          />
        </View>

        {/* Constraints section */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>CONSTRAINTS</ThemedText>

          <SetupCard
            icon="book-outline"
            label="Subject Requirements"
            description="Periods per week per subject and grade"
            path="/(app)/(admin)/timetable/requirements"
          />
          <SetupCard
            icon="person-outline"
            label="Teacher Preferences"
            description="Availability and scheduling constraints"
            path="/(app)/(admin)/timetable/teacher-prefs"
          />
        </View>

        {/* Timetables list */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>TIMETABLES</ThemedText>

          {timetables.isLoading ? (
            [1,2].map((i) => <Skeleton key={i} height={64} style={{ marginBottom: 8 }} />)
          ) : ttList.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No timetables yet"
              description="Tap + to create a draft timetable"
            />
          ) : (
            ttList.map((tt) => (
              <TimetableItem
                key={tt.id}
                tt={tt}
                onOpen={() => router.push(`/(app)/(admin)/timetable/${tt.id}/grid` as any)}
                onArchive={() => handleArchive(tt)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <FAB
        icon="add"
        onPress={handleCreate}
        loading={creating}
      />
    </SafeAreaView>
  );
}

export default function TimetableIndexScreen() {
  return (
    <ModuleGate module="timetable_builder" fallback={<ModuleDisabledScreen module="timetable_builder" />}>
      <TimetableIndexContent />
    </ModuleGate>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  content:      { padding: Spacing.base, gap: Spacing.xl, paddingBottom: 100 },
  section:      { gap: Spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: Spacing.xs },
  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.lg,
    borderWidth: 1, gap: Spacing.md,
  },
  cardIcon:   { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardText:   { flex: 1, gap: 2 },
  cardLabel:  { fontSize: 14, fontWeight: '600' },
  cardDesc:   { fontSize: 12 },
  cardRight:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  cardCount:  { fontSize: 13, fontWeight: '600' },
  ttItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.lg,
    borderWidth: 1, gap: Spacing.md,
  },
  ttItemLeft: { flex: 1, gap: 4 },
  ttName:     { fontSize: 14, fontWeight: '600' },
  ttMeta:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ttDate:     { fontSize: 11 },
  ttActions:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ttAction: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, justifyContent: 'center', alignItems: 'center',
  },
});
