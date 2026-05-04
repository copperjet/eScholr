import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Badge, EmptyState, ErrorState, SectionHeader, ScreenHeader } from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';

function useStudentMarks(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['student-marks', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data: sem } = await (supabase as any)
        .from('semesters')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      let query = (supabase as any)
        .from('marks')
        .select('id, assessment_type, value, raw_total, is_excused, excused_reason, subjects(name), semesters(name)')
        .eq('student_id', studentId!)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (sem?.id) query = query.eq('semester_id', sem.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

const TYPE_LABELS: Record<string, string> = {
  fa1: 'FA1',
  fa2: 'FA2',
  summative: 'Summative',
  biweekly: 'Biweekly',
};

export default function StudentMarks() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? null;
  const schoolId = user?.schoolId ?? '';

  const { data: marks, isLoading, isError, refetch, isRefetching } = useStudentMarks(studentId, schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load marks" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  // Group by subject
  const grouped: Record<string, any[]> = {};
  (marks ?? []).forEach((m: any) => {
    const subject = m.subjects?.name ?? 'Unknown';
    if (!grouped[subject]) grouped[subject] = [];
    grouped[subject].push(m);
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Marks" showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {[0,1,2].map(i => (
              <Card key={i} variant="elevated" style={{ padding: Spacing.md }}>
                <View style={{ gap: 8 }}>
                  <View style={{ height: 16, width: '50%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
                  <View style={{ height: 12, width: '30%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
                </View>
              </Card>
            ))}
          </View>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState title="No marks yet" description="Marks appear once teachers enter them." icon="school-outline" />
        ) : (
          Object.entries(grouped).map(([subject, items]) => {
            const scored = items.filter((m: any) => !m.is_excused && m.value != null);
            const avg = scored.length > 0
              ? (scored.reduce((s: number, m: any) => s + (m.value ?? 0), 0) / scored.length).toFixed(1)
              : null;

            return (
              <View key={subject} style={styles.subjectGroup}>
                <View style={styles.subjectHeading}>
                  <ThemedText variant="h4" style={{ flex: 1 }}>{subject}</ThemedText>
                  {avg !== null && (
                    <View style={[styles.avgChip, { backgroundColor: colors.brand.primarySoft }]}>
                      <ThemedText style={{ fontSize: 12, fontWeight: '700', color: colors.brand.primary }}>
                        avg {avg}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <Card variant="elevated" style={{ padding: 0, overflow: 'hidden' }}>
                  {items.map((m: any, i: number) => (
                    <View
                      key={m.id}
                      style={[
                        styles.row,
                        { borderBottomColor: colors.border },
                        i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontWeight: '600' }}>
                          {TYPE_LABELS[m.assessment_type] ?? m.assessment_type}
                        </ThemedText>
                        <ThemedText variant="caption" color="muted">{m.semesters?.name}</ThemedText>
                      </View>
                      {m.is_excused ? (
                        <Badge label="Excused" preset="warning" variant="tonal" />
                      ) : (
                        <ThemedText style={{ fontWeight: '800', fontSize: 18, color: colors.textPrimary }}>
                          {m.value ?? '—'}{m.raw_total ? <ThemedText variant="caption" color="muted">/{m.raw_total}</ThemedText> : ''}
                        </ThemedText>
                      )}
                    </View>
                  ))}
                </Card>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1 },
  scroll:         { paddingBottom: TAB_BAR_HEIGHT + Spacing.lg },
  subjectGroup:   { marginHorizontal: Spacing.screen, marginBottom: Spacing.lg },
  subjectHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  avgChip:        { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.base,
  },
});
