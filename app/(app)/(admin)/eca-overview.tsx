import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import {
  ThemedText, ScreenHeader, StatCard, ProgressBar, Card,
  EmptyState, ErrorState, StatCardSkeleton, ListItemSkeleton,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { useECAOverviewStats, useECACategories, useRunAllocation } from '../../../hooks/useECA';

export default function ECAOverviewScreen() {
  const { colors } = useTheme();
  const overview   = useECAOverviewStats();
  const categories = useECACategories();
  const runAlloc   = useRunAllocation();
  const [runningCat, setRunningCat] = useState<string | null>(null);

  const stats = overview.data;
  const cats  = categories.data ?? [];

  const handleRunAlloc = async (catId: string) => {
    setRunningCat(catId);
    try {
      await runAlloc.mutateAsync(catId);
    } finally {
      setRunningCat(null);
    }
  };

  const s = styles(colors);

  if (overview.isError) return <ErrorState title="Could not load ECA overview" onRetry={overview.refetch} />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title="ECA Overview" showBack />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={overview.isFetching} onRefresh={overview.refetch} />}
      >
        <View style={s.statRow}>
          {overview.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <View key={i} style={s.statCell}><StatCardSkeleton /></View>)
            : (
              <>
                <View style={s.statCell}><StatCard label="Activities"  value={stats?.total_activities ?? 0}   icon="football-outline" /></View>
                <View style={s.statCell}><StatCard label="Submissions" value={stats?.total_choices ?? 0}      icon="list-outline" /></View>
                <View style={s.statCell}><StatCard label="Assigned"    value={stats?.total_assigned ?? 0}     icon="checkmark-circle-outline" /></View>
                <View style={s.statCell}><StatCard label="Waitlisted"  value={stats?.total_waitlisted ?? 0}   icon="time-outline" /></View>
              </>
            )
          }
        </View>

        {overview.isLoading && Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} />)}

        {!overview.isLoading && cats.map((cat) => {
          const catActivities = (stats?.activities ?? []).filter((a) => a.category_id === cat.id);
          if (!catActivities.length) return null;
          return (
            <View key={cat.id} style={s.catSection}>
              <View style={s.catHeader}>
                <ThemedText style={s.catTitle}>{cat.name}</ThemedText>
                <Pressable
                  style={[s.allocBtn, { borderColor: colors.brand.primary, opacity: runningCat === cat.id ? 0.5 : 1 }]}
                  onPress={() => handleRunAlloc(cat.id)}
                  disabled={runningCat === cat.id}
                >
                  <ThemedText style={[s.allocBtnText, { color: colors.brand.primary }]}>
                    {runningCat === cat.id ? 'Running…' : 'Run Allocation'}
                  </ThemedText>
                </Pressable>
              </View>

              {catActivities.map((act) => {
                const pct = act.capacity > 0 ? Math.round((act.assigned / act.capacity) * 100) : 0;
                return (
                  <Pressable
                    key={act.id}
                    onPress={() => router.push({ pathname: '/(app)/(admin)/eca-activity-detail', params: { id: act.id } } as any)}
                  >
                    <Card style={s.actCard}>
                      <View style={s.actRow}>
                        <ThemedText style={s.actName}>{act.name}</ThemedText>
                        <ThemedText style={s.actCount}>{act.assigned}/{act.capacity}</ThemedText>
                      </View>
                      <ProgressBar value={pct} max={100} color={pct >= 100 ? '#EF4444' : colors.brand.primary} style={s.bar} />
                      <View style={s.metaRow}>
                        <ThemedText style={s.metaText}>{pct}% filled</ThemedText>
                        {act.waitlisted > 0 && (
                          <ThemedText style={[s.metaText, { color: '#F59E0B' }]}>
                            {act.waitlisted} waitlisted
                          </ThemedText>
                        )}
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {!overview.isLoading && !cats.length && (
          <EmptyState icon="football-outline" title="No ECA categories" description="Create a category from ECA Configuration to get started." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.background },
  content:      { padding: Spacing.md, gap: Spacing.md },
  statRow:      { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  statCell:     { width: '50%', padding: 4 },
  catSection:   { gap: Spacing.sm },
  catHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  catTitle:     { fontSize: 16, fontWeight: '700' },
  allocBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  allocBtnText: { fontSize: 13, fontWeight: '600' },
  actCard:      {},
  actRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  actName:      { fontWeight: '600', flex: 1 },
  actCount:     { fontSize: 13, color: colors.textMuted },
  bar:          { marginBottom: 4 },
  metaRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  metaText:     { fontSize: 12, color: colors.textMuted },
});
