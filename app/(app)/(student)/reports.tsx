import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Badge, EmptyState, ErrorState, SectionHeader } from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { Ionicons } from '@expo/vector-icons';

function useStudentReports(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['student-reports-view', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('reports')
        .select('id, status, overall_percentage, class_position, pdf_url, released_at, semesters(name)')
        .eq('student_id', studentId!)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function StudentReports() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const studentId = user?.studentId ?? null;
  const schoolId = user?.schoolId ?? '';

  const { data: reports, isLoading, isError, refetch, isRefetching } = useStudentReports(studentId, schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load reports" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.header}>
          <ThemedText variant="h4">My Reports</ThemedText>
        </View>

        {isLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : reports?.length === 0 ? (
          <EmptyState title="No reports yet" description="Reports appear once generated and released by school." icon="document-text-outline" />
        ) : (
          reports?.map((r: any) => (
            <Pressable
              key={r.id}
              onPress={() => {
                if (r.pdf_url) {
                  router.push({
                    pathname: '/(app)/report-viewer' as any,
                    params: { pdf_url: r.pdf_url, report_id: r.id, is_draft: r.status !== 'released' ? 'true' : 'false' }
                  });
                }
              }}
              disabled={!r.pdf_url}
            >
              <Card style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.md, padding: Spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: '600' }}>{r.semesters?.name ?? 'Report'}</ThemedText>
                    {r.overall_percentage != null && (
                      <ThemedText variant="caption" color="muted">
                        {r.overall_percentage.toFixed(1)}% · Position {r.class_position ?? '-'}
                      </ThemedText>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Badge
                      label={r.status === 'released' ? 'Released' : r.status.replace('_', ' ')}
                      preset={r.status === 'released' ? 'success' : 'warning'}
                      variant="tonal"
                    />
                    {r.pdf_url && (
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} style={{ marginLeft: Spacing.sm }} />
                    )}
                  </View>
                </View>
              </Card>
            </Pressable>
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
});
