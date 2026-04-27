import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Badge, EmptyState, ErrorState, SectionHeader } from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';

function useStudentMarks(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['student-marks', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('marks')
        .select('id, assessment_type, value, raw_total, is_excused, excused_reason, subjects(name), semesters(name)')
        .eq('student_id', studentId!)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.header}>
          <ThemedText variant="h4">My Marks</ThemedText>
        </View>

        {isLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState title="No marks yet" description="Marks appear once teachers enter them." icon="school-outline" />
        ) : (
          Object.entries(grouped).map(([subject, items]) => (
            <View key={subject} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.lg }}>
              <SectionHeader title={subject} noTopMargin />
              <Card style={{ padding: 0, overflow: 'hidden' }}>
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
                      <ThemedText style={{ fontWeight: '600' }}>{TYPE_LABELS[m.assessment_type] ?? m.assessment_type}</ThemedText>
                      <ThemedText variant="caption" color="muted">{m.semesters?.name}</ThemedText>
                    </View>
                    {m.is_excused ? (
                      <Badge label="Excused" preset="warning" variant="tonal" />
                    ) : (
                      <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>
                        {m.value ?? '-'}{m.raw_total ? ` / ${m.raw_total}` : ''}
                      </ThemedText>
                    )}
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md,
  },
});
