/**
 * Admin — Teacher Absences
 * List today + upcoming absences; add new; trigger auto-cover.
 */
import React, { useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState, FAB, Badge,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useTeacherAbsences, useReportAbsence, useDeleteAbsence, useAutoCover,
  type TeacherAbsence, type AbsenceReason, type CoverStrategy,
} from '../../../../hooks/useTimetableLive';

const REASON_LABEL: Record<AbsenceReason, string> = {
  sick: 'Sick', leave: 'Leave', training: 'Training', personal: 'Personal', other: 'Other',
};

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending: 'warning', covered: 'success', partial: 'error',
};

function AbsenceCard({ absence, onDelete, onCover, colors }: {
  absence: TeacherAbsence;
  onDelete: () => void;
  onCover: () => void;
  colors: any;
}) {
  const isSameDay = absence.start_date === absence.end_date;
  const dateLabel = isSameDay
    ? absence.start_date
    : `${absence.start_date} – ${absence.end_date}`;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(app)/(admin)/timetable/absences/${absence.id}/cover` as any)}
      activeOpacity={0.75}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.staffName}>
            {(absence.staff as any)?.full_name ?? '—'}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.textMuted }]}>
            {dateLabel} · {REASON_LABEL[absence.reason]}
          </ThemedText>
        </View>
        <Badge label={absence.status} variant={STATUS_VARIANT[absence.status] ?? 'default'} />
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onCover(); }}
          style={[styles.actionBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
          <ThemedText style={[styles.actionLabel, { color: colors.primary }]}>Auto-cover</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onDelete(); }}
          style={[styles.actionBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="trash-outline" size={14} color="#EF4444" />
          <ThemedText style={[styles.actionLabel, { color: '#EF4444' }]}>Delete</ThemedText>
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

export default function AbsencesScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const absencesQ  = useTeacherAbsences(sid, { from: today, to: twoWeeks });
  const reportMut  = useReportAbsence();
  const deleteMut  = useDeleteAbsence();
  const autoCover  = useAutoCover();

  const [adding, setAdding] = useState(false);

  const absences = absencesQ.data ?? [];

  function handleDelete(absence: TeacherAbsence) {
    haptics('light');
    Alert.alert(
      'Delete absence',
      `Remove absence record for ${(absence.staff as any)?.full_name ?? 'this teacher'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => deleteMut.mutate({ id: absence.id, school_id: sid }),
        },
      ],
    );
  }

  async function handleAutoCover(absence: TeacherAbsence) {
    haptics('light');
    try {
      const result = await autoCover.mutateAsync({ absence_id: absence.id, school_id: sid, dry_run: false });
      const filled = result.proposed.filter((p: any) => p.override_type !== 'cancel' && p.override_staff_id).length;
      const unfilled = result.unfilled.length;
      Alert.alert(
        'Cover applied',
        `${filled} slot${filled !== 1 ? 's' : ''} covered.${unfilled > 0 ? ` ${unfilled} could not be filled (study-hall fallback applied).` : ''}`,
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to run auto-cover');
    }
  }

  function handleAdd() {
    haptics('light');
    // Prompt for staff_id in a real app would use a staff picker sheet.
    // Here we open a simple flow via Alert.prompt (iOS) or navigation.
    router.push('/(app)/(admin)/timetable/absences/new' as any);
  }

  if (absencesQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Teacher Absences" showBack />
        <View style={{ padding: Spacing.lg, gap: Spacing.sm }}>
          {[1,2,3].map((i) => <Skeleton key={i} height={88} radius={Radius.md} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (absencesQ.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Teacher Absences" showBack />
        <ErrorState message="Could not load absences" onRetry={absencesQ.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Teacher Absences"
        subtitle={`Today + 14 days · ${absences.length} records`}
        showBack
      />

      <ScrollView contentContainerStyle={styles.content}>
        {absences.length === 0 ? (
          <EmptyState
            icon="person-outline"
            title="No absences"
            description="All teachers scheduled for the next 14 days"
          />
        ) : (
          absences.map((absence) => (
            <AbsenceCard
              key={absence.id}
              absence={absence}
              colors={colors}
              onDelete={() => handleDelete(absence)}
              onCover={() => handleAutoCover(absence)}
            />
          ))
        )}
      </ScrollView>

      <FAB icon="add" onPress={handleAdd} loading={adding} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:     { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.base, gap: Spacing.sm,
  },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  staffName:   { fontSize: 15, fontWeight: '600' },
  meta:        { fontSize: 12, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
    borderRadius: Radius.sm, borderWidth: 1,
  },
  actionLabel: { fontSize: 12, fontWeight: '500' },
});
