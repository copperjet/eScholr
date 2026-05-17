/**
 * Admin — Cover Review for a single absence.
 * Runs auto-cover (dry-run) to show proposed substitutes; admin confirms or edits.
 */
import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { useTheme } from '../../../../../../lib/theme';
import { useAuthStore } from '../../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState, Button, Badge,
} from '../../../../../../components/ui';
import { Spacing, Radius } from '../../../../../../constants/Typography';
import { haptics } from '../../../../../../lib/haptics';
import { useAutoCover, useApplyOverrides, type SlotOverride } from '../../../../../../hooks/useTimetableLive';

function useAbsence(absenceId: string, schoolId: string) {
  return useQuery({
    queryKey: ['absence', absenceId, schoolId],
    enabled: !!absenceId && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('teacher_absences')
        .select('*, staff:staff_id(full_name)')
        .eq('id', absenceId)
        .eq('school_id', schoolId)
        .single();
      if (error) throw error;
      return data as any;
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

function useSubjectMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['subjectmap', schoolId],
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

interface ProposedCover {
  base_slot_id:       string;
  override_date:      string;
  override_type:      string;
  override_staff_id:  string | null;
  source:             string;
  linked_absence_id:  string;
  school_id?:         string;
  timetable_id?:      string;
  notes?:             string | null;
}

export default function CoverReviewScreen() {
  const { colors }   = useTheme();
  const { user }     = useAuthStore();
  const { id: absenceId } = useLocalSearchParams<{ id: string }>();
  const sid = user?.schoolId ?? '';

  const absenceQ = useAbsence(absenceId, sid);
  const staffMap = useStaffMap(sid);
  const subjectMap = useSubjectMap(sid);
  const autoCover  = useAutoCover();
  const applyMut   = useApplyOverrides();

  const [proposed, setProposed] = useState<ProposedCover[]>([]);
  const [unfilled, setUnfilled] = useState<any[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!absenceId || !sid) return;
    autoCover.mutateAsync({ absence_id: absenceId, school_id: sid, dry_run: true })
      .then((r) => {
        setProposed(r.proposed ?? []);
        setUnfilled(r.unfilled ?? []);
        setPreviewLoaded(true);
      })
      .catch(() => setPreviewLoaded(true));
  }, [absenceId, sid]);

  async function handleApply() {
    haptics('light');
    setApplying(true);
    try {
      const rows = proposed.map((p) => ({
        school_id:          p.school_id  ?? sid,
        timetable_id:       p.timetable_id ?? '',
        base_slot_id:       p.base_slot_id,
        override_date:      p.override_date,
        override_type:      p.override_type,
        override_staff_id:  p.override_staff_id ?? null,
        source:             p.source as any,
        linked_absence_id:  p.linked_absence_id,
        status:             'active' as const,
        created_by:         user?.staffId ?? null,
        notes:              p.notes ?? null,
      }));
      await applyMut.mutateAsync(rows as any);
      haptics('success');
      Alert.alert('Applied', 'Cover overrides saved. Affected teachers will be notified.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to apply');
    } finally {
      setApplying(false);
    }
  }

  const absence = absenceQ.data;
  const staffName = (absence?.staff as any)?.full_name ?? '—';

  if (absenceQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Cover Review" showBack />
        <View style={{ padding: Spacing.lg, gap: Spacing.sm }}>
          {[1,2,3].map((i) => <Skeleton key={i} height={68} radius={Radius.md} />)}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Cover Review"
        subtitle={staffName}
        showBack
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Absence summary */}
        {absence ? (
          <View style={[styles.absenceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText style={styles.cardTitle}>{staffName}</ThemedText>
            <ThemedText style={[styles.meta, { color: colors.textMuted }]}>
              {absence.start_date} – {absence.end_date} · {absence.reason} · {absence.cover_strategy.replace('_', ' ')}
            </ThemedText>
            {absence.notes ? (
              <ThemedText style={[styles.meta, { color: colors.textMuted }]}>{absence.notes}</ThemedText>
            ) : null}
          </View>
        ) : null}

        {/* Proposed covers */}
        <ThemedText style={[styles.sectionLabel, { color: colors.textMuted }]}>PROPOSED COVERS</ThemedText>

        {!previewLoaded ? (
          <View style={{ alignItems: 'center', padding: Spacing.xl }}>
            <ActivityIndicator color={colors.primary} />
            <ThemedText style={[styles.meta, { color: colors.textMuted, marginTop: Spacing.sm }]}>
              Running auto-cover algorithm…
            </ThemedText>
          </View>
        ) : proposed.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No slots to cover" description="No published slots found for this teacher in the absence period." />
        ) : (
          proposed.map((p, i) => {
            const isCancelled  = p.override_type === 'cancel';
            const isStudyHall  = !p.override_staff_id && !isCancelled;
            const subName      = '—'; // slot-level subject lookup would need base slot data
            const coverName    = p.override_staff_id ? (staffMap.data?.[p.override_staff_id] ?? p.override_staff_id.slice(0, 8)) : null;

            return (
              <View
                key={i}
                style={[
                  styles.coverRow,
                  {
                    backgroundColor: isCancelled ? '#FEF2F2' : isStudyHall ? '#FFFBEB' : '#F0FDF4',
                    borderColor: isCancelled ? '#FECACA' : isStudyHall ? '#FDE68A' : '#BBF7D0',
                  },
                ]}
              >
                <Ionicons
                  name={isCancelled ? 'close-circle' : isStudyHall ? 'library-outline' : 'person-circle-outline'}
                  size={20}
                  color={isCancelled ? '#EF4444' : isStudyHall ? '#D97706' : '#16A34A'}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.coverDate}>{p.override_date}</ThemedText>
                  <ThemedText style={[styles.meta, { color: '#374151' }]}>
                    {isCancelled ? 'Cancelled'
                      : isStudyHall ? 'Study hall (no substitute available)'
                      : `Substitute: ${coverName}`}
                  </ThemedText>
                  {p.notes ? (
                    <ThemedText style={[styles.meta, { color: '#6B7280' }]}>{p.notes}</ThemedText>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {unfilled.length > 0 ? (
          <View style={[styles.warnBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <Ionicons name="warning-outline" size={16} color="#D97706" />
            <ThemedText style={{ fontSize: 12, color: '#92400E', flex: 1 }}>
              {unfilled.length} slot{unfilled.length !== 1 ? 's' : ''} could not be filled and will use study-hall fallback.
            </ThemedText>
          </View>
        ) : null}

        {previewLoaded && proposed.length > 0 ? (
          <Button
            label="Apply all covers"
            onPress={handleApply}
            loading={applying}
            style={{ marginTop: Spacing.lg }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:      { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 60 },
  absenceCard:  { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.base, gap: 4 },
  cardTitle:    { fontSize: 15, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: Spacing.sm },
  meta:         { fontSize: 12 },
  coverRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1,
  },
  coverDate:    { fontSize: 13, fontWeight: '600' },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1,
  },
});
