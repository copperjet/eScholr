import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { format, addDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Card, EmptyState, ErrorState, ListItemSkeleton,
  ModuleGate, ModuleDisabledScreen,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { useECAStudentAssignments } from '../../../hooks/useECA';

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nextSessionDate(dayOfWeek: number): string {
  const today = new Date();
  const diff = (dayOfWeek - today.getDay() + 7) % 7 || 7;
  return format(addDays(today, diff), 'EEE, dd MMM');
}

function StudentECAContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const query = useECAStudentAssignments(user?.studentId ?? undefined);
  const assignments = query.data ?? [];

  const s = styles(colors);

  if (query.isError) return <ErrorState title="Could not load ECA assignments" onRetry={query.refetch} />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title="My Activities" />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={query.refetch} />}
      >
        {query.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} />)
          : assignments.length === 0
            ? <EmptyState icon="football-outline" title="No ECA assignments yet" description="Once you've been assigned, your activities will appear here." />
            : assignments.map((a) => {
                const act = a.eca_activities;
                const cat = a.eca_categories;
                if (!act) return null;

                const allPatrons = act.eca_activity_patrons ?? [];
                const isWait = a.status === 'waitlisted';

                return (
                  <Card key={a.id} style={s.card}>
                    <View style={s.header}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={s.actName}>{act.name}</ThemedText>
                        {cat && <ThemedText style={s.catLabel}>{cat.name}</ThemedText>}
                      </View>
                      <View style={[s.statusPill, { backgroundColor: isWait ? '#FEF3C7' : '#D1FAE5' }]}>
                        <ThemedText style={[s.statusText, { color: isWait ? '#92400E' : '#065F46' }]}>
                          {isWait ? 'Waitlisted' : 'Assigned'}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={s.divider} />

                    <View style={s.row}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                      <ThemedText style={s.meta}>
                        {DAYS_FULL[act.day_of_week]} · {act.start_time ?? '—'} – {act.end_time ?? '—'}
                      </ThemedText>
                    </View>

                    {!isWait && (
                      <View style={s.row}>
                        <Ionicons name="time-outline" size={14} color={colors.brand.primary} />
                        <ThemedText style={[s.meta, { color: colors.brand.primary }]}>
                          Next session: {nextSessionDate(act.day_of_week)}
                        </ThemedText>
                      </View>
                    )}

                    {act.location ? (
                      <View style={s.row}>
                        <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                        <ThemedText style={s.meta}>{act.location}</ThemedText>
                      </View>
                    ) : null}

                    {allPatrons.length > 0 && (
                      <View style={s.row}>
                        <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                        <ThemedText style={s.meta}>
                          {allPatrons.map((p) => p.staff?.full_name ?? '').filter(Boolean).join(', ')}
                        </ThemedText>
                      </View>
                    )}

                    {a.assigned_from_choice_rank && (
                      <View style={s.row}>
                        <Ionicons name="trophy-outline" size={14} color={colors.textMuted} />
                        <ThemedText style={s.meta}>Assigned from choice #{a.assigned_from_choice_rank}</ThemedText>
                      </View>
                    )}
                  </Card>
                );
              })
        }
      </ScrollView>
    </SafeAreaView>
  );
}

export default function StudentECAScreen() {
  return (
    <ModuleGate
      module="eca"
      fallback={<ModuleDisabledScreen module="eca" />}
    >
      <StudentECAContent />
    </ModuleGate>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.background },
  content:    { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },
  card:       { gap: 6 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  actName:    { fontSize: 16, fontWeight: '700' },
  catLabel:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  divider:    { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta:       { fontSize: 13, color: colors.textMuted },
});
