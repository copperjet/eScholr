import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Card, EmptyState, ErrorState, ListItemSkeleton,
  ModuleGate, ModuleDisabledScreen,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { useECAPatronActivities } from '../../../hooks/useECA';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function MyActivitiesContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const staffId = user?.staffId ?? '';

  const query = useECAPatronActivities(staffId);
  const activities = query.data ?? [];

  const today = new Date();
  const nextSession = (dayOfWeek: number) => {
    const diff = (dayOfWeek - today.getDay() + 7) % 7 || 7;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return format(d, 'EEE, dd MMM');
  };

  const s = styles(colors);

  if (query.isError) return <ErrorState title="Could not load your ECA activities" onRetry={query.refetch} />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title="My ECA Activities" showBack />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={query.refetch} />}
      >
        {query.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} />)
          : activities.length === 0
            ? <EmptyState icon="football-outline" title="No ECA activities" description="You are not assigned as patron to any extra-curricular activity." />
            : activities.map((act) => (
                <Card key={act.id} style={s.card}>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.name}>{act.name}</ThemedText>
                      <View style={s.metaRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                        <ThemedText style={s.meta}>{DAYS[act.day_of_week]}</ThemedText>
                        <Ionicons name="time-outline" size={13} color={colors.textMuted} style={{ marginLeft: 8 }} />
                        <ThemedText style={s.meta}>{act.start_time ?? '—'} – {act.end_time ?? '—'}</ThemedText>
                      </View>
                      {act.location ? (
                        <View style={s.metaRow}>
                          <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                          <ThemedText style={s.meta}>{act.location}</ThemedText>
                        </View>
                      ) : null}
                      <ThemedText style={[s.nextSession, { color: colors.brand.primary }]}>Next: {nextSession(act.day_of_week)}</ThemedText>
                    </View>
                    <Pressable
                      style={[s.attendBtn, { backgroundColor: colors.brand.primary }]}
                      onPress={() => router.push({
                        pathname: '/(app)/(st)/eca-attendance',
                        params: { activityId: act.id, activityName: act.name },
                      } as any)}
                    >
                      <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                      <ThemedText style={s.attendBtnText}>Attendance</ThemedText>
                    </Pressable>
                  </View>
                </Card>
              ))
        }
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ECAMyActivitiesScreen() {
  return (
    <ModuleGate
      module="eca"
      fallback={<ModuleDisabledScreen module="eca" />}
    >
      <MyActivitiesContent />
    </ModuleGate>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  content:       { padding: Spacing.md, gap: Spacing.sm },
  card:          {},
  row:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name:          { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  meta:          { fontSize: 13, color: colors.textMuted },
  nextSession:   { fontSize: 12, marginTop: 4, fontWeight: '600' },
  attendBtn:     { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  attendBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
