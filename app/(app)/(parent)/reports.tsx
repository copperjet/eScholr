/**
 * Parent Reports — list of released report cards for linked children.
 */
import React from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Avatar, Badge, Skeleton, EmptyState, ErrorState } from '../../../components/ui';
import { useParentReports } from '../../../hooks/useReports';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

export default function ParentReportsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const { data: reports = [], isLoading, isError, refetch, isFetching } = useParentReports(
    user?.staffId ?? null,
    user?.schoolId ?? '',
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load reports" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <ThemedText variant="h4">Report Cards</ThemedText>
        {reports.length > 0 && (
          <View style={[styles.countPill, { backgroundColor: colors.brand.primarySoft }]}>
            <ThemedText style={{ fontSize: 12, fontWeight: '700', color: colors.brand.primary }}>
              {reports.length}
            </ThemedText>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.skCard, { backgroundColor: colors.surface }]}>
              <Skeleton width={52} height={52} radius={26} />
              <View style={{ flex: 1, gap: 8, marginLeft: Spacing.md }}>
                <Skeleton width="55%" height={15} />
                <Skeleton width="35%" height={11} />
                <Skeleton width="25%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No reports available"
          description="Report cards will appear here once released by the school."
          icon="document-text-outline"
        />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />
          }
          renderItem={({ item: report }) => (
            <Pressable
              onPress={() => {
                if (!report.pdf_url) return;
                haptics.selection();
                router.push({
                  pathname: '/(app)/report-viewer' as any,
                  params: {
                    report_id: report.id,
                    pdf_url: report.pdf_url,
                    student_name: report.student.full_name,
                    is_draft: 'false',
                  },
                });
              }}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface },
                Shadow.sm,
                { opacity: pressed && report.pdf_url ? 0.9 : 1, transform: [{ scale: pressed && report.pdf_url ? 0.98 : 1 }] },
              ]}
            >
              {/* Left green accent bar */}
              <View style={[styles.accent, { backgroundColor: report.pdf_url ? colors.brand.primary : colors.textMuted }]} />

              <View style={styles.cardBody}>
                <Avatar name={report.student.full_name} photoUrl={report.student.photo_url} size={52} />

                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                    {report.student.full_name}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">{report.semester?.name ?? '—'}</ThemedText>

                  {/* Score chips */}
                  <View style={styles.chips}>
                    {report.overall_percentage !== null && (
                      <View style={[styles.chip, { backgroundColor: colors.brand.primarySoft }]}>
                        <ThemedText style={{ fontSize: 12, fontWeight: '700', color: colors.brand.primary }}>
                          {report.overall_percentage.toFixed(1)}%
                        </ThemedText>
                      </View>
                    )}
                    {report.class_position !== null && (
                      <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}>
                        <ThemedText style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                          #{report.class_position}
                        </ThemedText>
                      </View>
                    )}
                    <Badge
                      label={report.pdf_url ? 'Available' : 'Pending'}
                      preset={report.pdf_url ? 'success' : 'neutral'}
                      variant="tonal"
                    />
                  </View>
                </View>

                <Ionicons
                  name={report.pdf_url ? 'document-text' : 'time-outline'}
                  size={22}
                  color={report.pdf_url ? colors.brand.primary : colors.textMuted}
                />
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  countPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  skCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  list: { padding: Spacing.base, paddingBottom: 100, gap: Spacing.md },
  card: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  accent: { width: 4 },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    gap: Spacing.md,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
});
