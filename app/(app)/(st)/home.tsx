import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, ProgressBar, CardSkeleton,
  EmptyState, ErrorState, SectionHeader, Card, IconChip,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const TODAY = format(new Date(), 'EEEE, d MMM');

function useSTDashboard(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['st-dashboard', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const { data: assignments, error } = await (supabase as any)
        .from('subject_teacher_assignments')
        .select('id, subject_id, stream_id, semester_id, subjects (name, department), streams (name, grades (name, school_sections (section_type))), semesters (name, is_active)')
        .eq('staff_id', staffId!).eq('school_id', schoolId);
      if (error) throw error;
      const active = (assignments ?? []).filter((a: any) => a.semesters?.is_active);
      const progress = await Promise.all(active.map(async (a: any) => {
        const sectionType = a.streams?.grades?.school_sections?.section_type ?? 'primary';
        const [studentsRes, marksRes] = await Promise.all([
          (supabase as any).from('students').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('stream_id', a.stream_id).eq('status', 'active'),
          (supabase as any).from('marks').select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId).eq('subject_id', a.subject_id)
            .eq('stream_id', a.stream_id).eq('semester_id', a.semester_id),
        ]);
        const studentCount = studentsRes.count ?? 0;
        const markedCount  = marksRes.count ?? 0;
        const expected     = studentCount * (sectionType === 'igcse' ? 1 : 3);
        return { ...a, studentCount, markedCount, expected };
      }));
      return progress as any[];
    },
  });
}

export default function STHome() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const { data, isLoading, isError, refetch, isFetching } = useSTDashboard(user?.staffId ?? null, user?.schoolId ?? '');

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }, []);

  // Overall completion across all subjects
  const totalExpected = (data ?? []).reduce((s: number, a: any) => s + a.expected, 0);
  const totalMarked   = (data ?? []).reduce((s: number, a: any) => s + a.markedCount, 0);
  const overallPct    = totalExpected > 0 ? Math.round((totalMarked / totalExpected) * 100) : 0;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Check your connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  // No assignments yet
  if (!isLoading && (data ?? []).length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="book-outline" size={48} color={colors.textMuted} />
          <ThemedText variant="h3" style={{ marginTop: 16 }}>No Subjects Assigned</ThemedText>
          <ThemedText color="muted" style={{ textAlign: 'center', marginTop: 8, maxWidth: 280 }}>
            You haven't been assigned to teach any subjects yet. Ask your administrator to assign you in HRT/ST Assignments.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="caption" color="muted">{TODAY}</ThemedText>
            <ThemedText variant="h2">{greeting} 👋</ThemedText>
            <ThemedText variant="bodySm" color="muted" style={{ marginTop: 2 }}>{user?.fullName ?? 'Teacher'}</ThemedText>
          </View>
          <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
            <Avatar name={user?.fullName ?? 'T'} size={44} />
          </Pressable>
        </View>

        {/* ── Hero progress card ── */}
        {!isLoading && (data ?? []).length > 0 && (
          <View style={[styles.heroCard, { backgroundColor: colors.brand.primary }, Shadow.lg]}>
            <ThemedText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>
              Marks Progress — This Semester
            </ThemedText>
            <ThemedText style={{ color: '#fff', fontSize: 38, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 }}>
              {overallPct}%
            </ThemedText>
            <View style={{ marginTop: Spacing.sm }}>
              <ProgressBar value={totalMarked} max={totalExpected || 1} color="rgba(255,255,255,0.9)" />
            </View>
            <ThemedText style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: Spacing.sm }}>
              {totalMarked} of {totalExpected} marks entered across {data?.length} subject{data?.length !== 1 ? 's' : ''}
            </ThemedText>
          </View>
        )}

        {/* ── Subjects list ── */}
        <SectionHeader title="My Subjects" />

        {isLoading ? (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {[0, 1, 2].map(i => (
              <Card key={i} variant="elevated">
                <CardSkeleton lines={3} />
              </Card>
            ))}
          </View>
        ) : !(data ?? []).length ? (
          <EmptyState
            title="No assignments yet"
            description="You have no subject assignments for the current semester."
          />
        ) : (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {(data ?? []).map((a: any) => {
              const pct       = a.expected > 0 ? Math.round((a.markedCount / a.expected) * 100) : 0;
              const done      = pct === 100;
              const barColor  = done ? Colors.semantic.success : colors.brand.primary;

              return (
                <Pressable
                  key={a.id}
                  onPress={() => router.push({ pathname: '/(app)/(st)/marks' as any })}
                  style={({ pressed }) => [
                    styles.assignCard,
                    { backgroundColor: colors.surface },
                    Shadow.sm,
                    { opacity: pressed ? 0.88 : 1 },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <IconChip
                      icon={<Ionicons name="book-outline" size={20} color={done ? Colors.semantic.success : colors.brand.primary} />}
                      bg={done ? Colors.semantic.successLight : colors.brand.primarySoft}
                      size={44}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="h4" numberOfLines={1}>{a.subjects?.name ?? '—'}</ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {[a.streams?.grades?.name, a.streams?.name].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                    <ThemedText style={{ color: barColor, fontWeight: '700', fontSize: 16 }}>{pct}%</ThemedText>
                  </View>
                  <ProgressBar value={a.markedCount} max={a.expected || 1} color={barColor} style={{ marginTop: Spacing.sm }} />
                  <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
                    {a.markedCount} / {a.expected} marks · {a.studentCount} students
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: TAB_BAR_HEIGHT }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base, gap: Spacing.md },
  heroCard: {
    marginHorizontal: Spacing.screen,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  assignCard: { borderRadius: Radius.lg, padding: Spacing.base },
  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
});
