import React from 'react';
import { View, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Badge, EmptyState, ErrorState,
  ScreenHeader, FastList, Skeleton, IconChip,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  draft:            { label: 'Draft',          color: '#6B7280', icon: 'document-outline' },
  pending_approval: { label: 'Pending',        color: Colors.semantic.warning, icon: 'time-outline' },
  approved:         { label: 'Approved',       color: Colors.semantic.info, icon: 'checkmark-circle-outline' },
  finance_pending:  { label: 'Fee clearance',  color: Colors.semantic.warning, icon: 'cash-outline' },
  under_review:     { label: 'Under review',   color: Colors.semantic.warning, icon: 'alert-circle-outline' },
  released:         { label: 'Released',       color: Colors.semantic.success, icon: 'checkmark-done-circle' },
};

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
  const schoolId  = user?.schoolId ?? '';

  const { data: reports, isLoading, isError, refetch, isRefetching } = useStudentReports(studentId, schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="My Reports" showBack />
        <ErrorState title="Could not load reports" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Reports" showBack />

      <FastList
        data={reports ?? []}
        keyExtractor={(r: any) => r.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
        ListHeaderComponent={
          isLoading ? (
            <View style={{ gap: Spacing.md, padding: Spacing.screen }}>
              {[0,1,2].map(i => (
                <View key={i} style={[styles.skCard, { backgroundColor: colors.surface }]}>
                  <Skeleton width={44} height={44} radius={22} />
                  <View style={{ flex: 1, gap: 8, marginLeft: Spacing.md }}>
                    <Skeleton width="55%" height={15} />
                    <Skeleton width="35%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState title="No reports yet" description="Reports appear once generated and released by school." icon="document-text-outline" />
          ) : null
        }
        renderItem={({ item: r }: { item: any }) => {
          const meta    = STATUS_META[r.status] ?? STATUS_META.draft;
          const canOpen = !!r.pdf_url;
          return (
            <Pressable
              onPress={() => canOpen && router.push({
                pathname: '/(app)/report-viewer' as any,
                params: { pdf_url: r.pdf_url, report_id: r.id, is_draft: r.status !== 'released' ? 'true' : 'false' },
              })}
              disabled={!canOpen}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface },
                Shadow.sm,
                canOpen && pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
              ]}
            >
              {/* accent bar */}
              <View style={[styles.accent, { backgroundColor: meta.color }]} />

              <View style={styles.cardBody}>
                <IconChip
                  icon={<Ionicons name={meta.icon as any} size={20} color={meta.color} />}
                  bg={meta.color + '18'}
                  size={44}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>
                    {r.semesters?.name ?? 'Report Card'}
                  </ThemedText>
                  {r.overall_percentage != null ? (
                    <ThemedText variant="caption" color="muted">
                      {r.overall_percentage.toFixed(1)}%{r.class_position != null ? ` · Position ${r.class_position}` : ''}
                    </ThemedText>
                  ) : (
                    <ThemedText variant="caption" style={{ color: meta.color }}>{meta.label}</ThemedText>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge
                    label={meta.label}
                    preset={r.status === 'released' ? 'success' : r.status === 'approved' ? 'info' : 'warning'}
                    variant="tonal"
                  />
                  {canOpen && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1 },
  list:     { padding: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT + Spacing.lg, gap: Spacing.md },
  skCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.base },
  card:     { flexDirection: 'row', borderRadius: Radius.lg, overflow: 'hidden' },
  accent:   { width: 4 },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: Spacing.base, gap: Spacing.md },
});
