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
  ThemedText, Card, Avatar, Badge,
  ListItemSkeleton, ErrorState, SectionHeader, StatCard, IconChip,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors, resolveAttBg, resolveAttColor } from '../../../constants/Colors';

// Computed inside component to avoid stale dates after midnight
function useToday() {
  return useMemo(() => ({
    iso: format(new Date(), 'yyyy-MM-dd'),
    label: format(new Date(), 'EEEE dd/MM'),
  }), []);
}

/**
 * Single RPC `get_hrt_dashboard` replaces the old 5-query waterfall.
 * Server returns one JSONB payload — no more sequential round-trips.
 */
function useHRTDashboard(staffId: string | null, schoolId: string, todayISO: string) {
  return useQuery({
    queryKey: ['hrt-dashboard', staffId, schoolId, todayISO],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_hrt_dashboard', {
        p_staff_id:  staffId!,
        p_school_id: schoolId,
      });
      if (error) throw error;
      const payload = (data ?? {}) as any;
      if (!payload.assignment) {
        // No assignment = data state, not error
        return { noAssignment: true } as any;
      }

      // Reshape to keep the screen's existing rendering contract.
      return {
        assignment: {
          stream_id:   payload.assignment.streamId,
          semester_id: payload.assignment.semesterId,
          streams: {
            name: payload.assignment.streamName,
            grades: {
              name: payload.assignment.gradeName,
              school_sections: { name: payload.assignment.sectionName },
            },
          },
          semesters: {
            name:     payload.assignment.semesterName,
            end_date: payload.assignment.semesterEnd,
          },
        },
        attendance:        payload.attendance,
        marksEntered:      payload.marksEntered ?? 0,
        totalStudents:     payload.totalStudents ?? 0,
        firstSubjectName:  payload.firstSubjectName ?? 'FA1',
        semesterEndDate:   payload.assignment.semesterEnd,
        dayBook:           payload.dayBook ?? [],
      };
    },
  });
}

export default function HRTHome() {
  const { colors, scheme } = useTheme();
  const { user, school } = useAuthStore();
  const today = useToday();
  const { data, isLoading, isError, refetch, isRefetching } =
    useHRTDashboard(user?.staffId ?? null, user?.schoolId ?? '', today.iso);

  const a        = data?.assignment as any;
  const streamName  = a?.streams?.name ?? '—';
  const gradeName   = a?.streams?.grades?.name ?? '';
  const sectionName = a?.streams?.grades?.school_sections?.name ?? '';

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Check your connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  // No assignment yet
  if ((data as any)?.noAssignment) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <ThemedText variant="h3" style={{ marginTop: 16 }}>No Class Assigned</ThemedText>
          <ThemedText color="muted" style={{ textAlign: 'center', marginTop: 8, maxWidth: 280 }}>
            You haven't been assigned as a class teacher yet. Ask your administrator to assign you in HRT/ST Assignments.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const submitted = data?.attendance.registerSubmitted;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText variant="caption" color="muted">{today.label}</ThemedText>
            <ThemedText variant="h2">
              {greeting}, {user?.fullName?.split(' ')[0] ?? 'Teacher'} 👋
            </ThemedText>
            {streamName !== '—' && (
              <ThemedText variant="bodySm" color="muted">
                {[sectionName, gradeName, streamName && `Class ${streamName}`].filter(Boolean).join(' · ')}
              </ThemedText>
            )}
          </View>
          <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
            <Avatar name={user?.fullName ?? 'T'} photoUrl={school?.logo_url} size={44} />
          </Pressable>
        </View>

        {/* ── Attendance hero card ── */}
        <Pressable
          onPress={() => router.push('/(app)/(hrt)/attendance')}
          style={({ pressed }) => [
            styles.attCard,
            { backgroundColor: colors.brand.primary, opacity: pressed ? 0.93 : 1 },
            Shadow.lg,
          ]}
        >
          <View style={styles.attCardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>
                Today's Attendance
              </ThemedText>
              {isLoading ? (
                <View style={{ height: 28, width: 140, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, marginTop: 6 }} />
              ) : (
                <ThemedText style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 4 }}>
                  {submitted ? `${data!.attendance.presentCount} present` : 'Register not submitted'}
                </ThemedText>
              )}
            </View>
            <View style={[styles.attStatusChip, {
              backgroundColor: submitted ? 'rgba(255,255,255,0.2)' : Colors.semantic.warningLight,
            }]}>
              <Ionicons
                name={submitted ? 'checkmark-circle' : 'time-outline'}
                size={22}
                color={submitted ? '#fff' : Colors.semantic.warning}
              />
            </View>
          </View>

          {submitted && !isLoading ? (
            <View style={styles.attPills}>
              <AttPill label="Present" count={data!.attendance.presentCount} color={resolveAttColor('present')} bg="rgba(255,255,255,0.15)" />
              <AttPill label="Absent"  count={data!.attendance.absentCount}  color="#fca5a5" bg="rgba(255,255,255,0.15)" />
              <AttPill label="Late"    count={data!.attendance.lateCount}    color="#fde68a" bg="rgba(255,255,255,0.15)" />
            </View>
          ) : !submitted && !isLoading ? (
            <View style={styles.tapRow}>
              <Ionicons name="arrow-forward-circle-outline" size={16} color="rgba(255,255,255,0.7)" />
              <ThemedText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginLeft: 6 }}>Tap to open register</ThemedText>
            </View>
          ) : null}
        </Pressable>

        {/* ── Quick actions: Attendance, Day Book, Marks ── */}
        <SectionHeader title="Quick Actions" />
        <View style={styles.qaRow}>
          {[
            { icon: 'checkmark-circle-outline', label: 'Attendance', color: Colors.semantic.success, route: '/(app)/(hrt)/attendance' },
            { icon: 'book-outline',           label: 'Day Book',   color: '#7C3AED',              route: '/(app)/(hrt)/daybook' as any },
            { icon: 'bar-chart-outline',      label: 'Marks',      color: colors.brand.primary, route: '/(app)/(hrt)/marks' },
          ].map(({ icon, label, color, route }) => (
            <Pressable
              key={label}
              onPress={() => router.push(route as any)}
              style={({ pressed }) => [styles.qaBtn, { backgroundColor: color + '14', opacity: pressed ? 0.8 : 1 }]}
            >
              <IconChip icon={<Ionicons name={icon as any} size={20} color={color} />} bg={color + '22'} size={42} />
              <ThemedText style={{ fontSize: 12, fontWeight: '600', color, marginTop: 6, textAlign: 'center' }}>{label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* ── Day Book ── */}
        <SectionHeader title="Day Book" action="See all" onAction={() => router.push('/(app)/(hrt)/daybook' as any)} />

        {isLoading ? (
          <>
            <ListItemSkeleton />
            <ListItemSkeleton />
          </>
        ) : (data?.dayBook ?? []).length === 0 ? (
          <Card variant="tinted" style={[styles.card, { alignItems: 'center', paddingVertical: Spacing.xl }]}>
            <ThemedText color="muted">No Day Book entries yet</ThemedText>
          </Card>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {(data?.dayBook ?? []).map((entry: any) => (
              <DayBookRow key={entry.id} entry={entry} />
            ))}
          </View>
        )}

        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function AttPill({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={[styles.attPill, { backgroundColor: bg }]}>
      <ThemedText style={{ color, fontSize: 18, fontWeight: '700' }}>{count}</ThemedText>
      <ThemedText style={{ color, fontSize: 11, opacity: 0.85 }}>{label}</ThemedText>
    </View>
  );
}

const CAT_META: Record<string, { color: string; icon: string }> = {
  achievement:      { color: Colors.semantic.success,  icon: 'star-outline' },
  academic_concern: { color: Colors.semantic.error,    icon: 'alert-circle-outline' },
  behaviour_minor:  { color: Colors.semantic.warning,  icon: 'warning-outline' },
  behaviour_major:  { color: '#DC2626',                icon: 'close-circle-outline' },
  health:           { color: '#7C3AED',                icon: 'medkit-outline' },
  general:          { color: '#6B7280',                icon: 'document-text-outline' },
};

function DayBookRow({ entry }: { entry: any }) {
  const { colors } = useTheme();
  const cat         = CAT_META[entry.category] ?? CAT_META.general;
  const studentName = entry.students?.full_name ?? 'Student';

  return (
    <Card variant="elevated" accentColor={cat.color} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
        <Avatar name={studentName} photoUrl={entry.students?.photo_url} size={36} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ThemedText variant="h4" numberOfLines={1}>{studentName}</ThemedText>
            <ThemedText variant="caption" color="muted">{format(new Date(entry.date), 'd MMM')}</ThemedText>
          </View>
          <ThemedText variant="bodySm" color="secondary" numberOfLines={2}>{entry.description}</ThemedText>
        </View>
        <IconChip
          icon={<Ionicons name={cat.icon as any} size={14} color={cat.color} />}
          bg={cat.color + '18'}
          size={30}
          radius={15}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: TAB_BAR_HEIGHT },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.base,
    gap: Spacing.md,
  },
  attCard: {
    marginHorizontal: Spacing.screen,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  attCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  attStatusChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  attPills:      { flexDirection: 'row', gap: Spacing.sm },
  attPill:       { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, gap: 2 },
  tapRow:        { flexDirection: 'row', alignItems: 'center' },
  qaRow:         { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  qaBtn:         { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
  card:          { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm },
});
