import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, ListItemSkeleton,
  EmptyState, ErrorState, SectionHeader, IconChip,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors, resolveAttBg, resolveAttColor } from '../../../constants/Colors';
import type { AttendanceStatus } from '../../../types/database';

const TODAY_LABEL = format(new Date(), 'EEEE, d MMM');

interface ChildRow {
  id: string; full_name: string; photo_url: string | null;
  student_number: string; stream_id: string;
  grades: { name: string } | null; streams: { name: string } | null;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-children', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, student_number, stream_id, grades(name), streams(name))')
        .eq('parent_id', parentId!).eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.students).filter(Boolean) as ChildRow[];
    },
  });
}

function useChildDashboard(child: ChildRow | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-child-dash', child?.id, schoolId],
    enabled: !!child && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data: sem } = await supabase
        .from('semesters').select('id, name, start_date, end_date')
        .eq('school_id', schoolId).eq('is_active', true).limit(1).single();
      const semesterId = (sem as any)?.id;
      if (!semesterId) return { semester: null, report: null, attendance: null, dayBook: [] };
      const [attSumRes, reportRes, dayBookRes] = await Promise.all([
        (supabase.rpc as any)('get_attendance_summary', { p_student_id: child!.id, p_semester_id: semesterId }),
        supabase.from('reports').select('id, status, overall_percentage, released_at, semesters(name)')
          .eq('school_id', schoolId).eq('student_id', child!.id).eq('semester_id', semesterId).maybeSingle(),
        supabase.from('day_book_entries')
          .select('id, category, description, date, created_at, staff:created_by(full_name)')
          .eq('school_id', schoolId).eq('student_id', child!.id)
          .eq('send_to_parent', true).eq('archived', false)
          .order('date', { ascending: false }).limit(5),
      ]);
      return { semester: sem, report: reportRes.data, attendance: (attSumRes.data as any)?.[0] ?? null, dayBook: dayBookRes.data ?? [] };
    },
  });
}

export default function ParentHome() {
  const { colors, scheme } = useTheme();
  const { user }           = useAuthStore();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: children, isLoading: childrenLoading, isError: childrenError, refetch: refetchChildren } =
    useChildren(user?.parentId ?? null, user?.schoolId ?? '');

  const activeChild = children?.[selectedIdx] ?? null;
  const { data, isLoading, refetch, isRefetching } = useChildDashboard(activeChild, user?.schoolId ?? '');

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
  }, []);

  if (childrenError) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ErrorState title="Could not load" description="Check your connection and try again." onRetry={refetchChildren} />
    </SafeAreaView>
  );

  if (!childrenLoading && (!children || children.length === 0)) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <EmptyState title="No children linked" description="Your account is not yet linked to a student. Contact the school front desk." />
    </SafeAreaView>
  );

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
            <ThemedText variant="caption" color="muted">{TODAY_LABEL}</ThemedText>
            <ThemedText variant="h2">{greeting}, {user?.fullName?.split(' ')[0] ?? 'Parent'} 👋</ThemedText>
          </View>
          <Pressable
            onPress={() => router.push('/(app)/notifications' as any)}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* ── Child selector / hero card ── */}
        {(children ?? []).length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childRow}>
            {(children ?? []).map((c, i) => {
              const active = i === selectedIdx;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedIdx(i)}
                  style={[styles.childChip, { backgroundColor: active ? colors.brand.primary : colors.surface, borderColor: active ? colors.brand.primary : colors.border }]}
                >
                  <Avatar name={c.full_name} photoUrl={c.photo_url} size={32} />
                  <View>
                    <ThemedText style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textPrimary }}>
                      {c.full_name.split(' ')[0]}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : colors.textMuted }}>
                      {c.grades?.name} · {c.streams?.name}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Single child card */}
        {activeChild && (children ?? []).length === 1 && (
          <View style={[styles.childHero, { backgroundColor: colors.brand.primary }, Shadow.md]}>
            <Avatar name={activeChild.full_name} photoUrl={activeChild.photo_url} size={52} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{activeChild.full_name}</ThemedText>
              <ThemedText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>
                {[activeChild.grades?.name, activeChild.streams?.name, activeChild.student_number].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
          </View>
        )}

        {/* ── Report card ── */}
        <SectionHeader title="Latest Report" />
        {isLoading ? (
          <View style={styles.cardPad}><ListItemSkeleton /></View>
        ) : data?.report ? (
          <ReportCard report={data.report} />
        ) : (
          <Card variant="tinted" style={[styles.cardPad, { flexDirection: 'row', alignItems: 'center', gap: Spacing.md }]}>
            <IconChip icon={<Ionicons name="document-text-outline" size={18} color={colors.textMuted} />} bg={colors.surfaceTertiary} />
            <ThemedText variant="body" color="muted">Report for this term is not yet available.</ThemedText>
          </Card>
        )}

        {/* ── Attendance ── */}
        <SectionHeader title="Attendance This Term" />
        {isLoading ? (
          <View style={styles.cardPad}><ListItemSkeleton /></View>
        ) : data?.attendance ? (
          <AttendanceCard summary={data.attendance} scheme={scheme} />
        ) : (
          <Card variant="tinted" style={styles.cardPad}>
            <ThemedText color="muted" style={{ textAlign: 'center' }}>No attendance recorded yet.</ThemedText>
          </Card>
        )}

        {/* ── Day Book ── */}
        <SectionHeader title="Day Book" />
        {isLoading ? (
          <><ListItemSkeleton /><ListItemSkeleton /></>
        ) : (data?.dayBook ?? []).length === 0 ? (
          <Card variant="tinted" style={[styles.cardPad, { alignItems: 'center', paddingVertical: Spacing.xl }]}>
            <ThemedText color="muted">No updates yet.</ThemedText>
          </Card>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {(data!.dayBook).map((entry: any) => <DayBookRow key={entry.id} entry={entry} />)}
          </View>
        )}

        {/* ── Quick links ── */}
        <SectionHeader title="Quick Links" />
        <View style={styles.quickLinks}>
          {[
            { icon: 'megaphone-outline',     label: 'Announcements', route: '/(app)/announcements' },
            { icon: 'calendar-outline',      label: 'Timetable',     route: '/(app)/timetable' },
            { icon: 'notifications-outline', label: 'Notifications', route: '/(app)/notifications' },
          ].map(({ icon, label, route }) => (
            <Pressable
              key={label}
              onPress={() => router.push(route as any)}
              style={({ pressed }) => [
                styles.quickLink,
                { backgroundColor: colors.surface },
                Shadow.sm,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <IconChip icon={<Ionicons name={icon as any} size={20} color={colors.brand.primary} />} size={44} />
              <ThemedText style={{ fontSize: 12, fontWeight: '600', color: colors.brand.primary, marginTop: Spacing.sm, textAlign: 'center' }}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────

function ReportCard({ report }: { report: any }) {
  const { colors } = useTheme();
  const statusMap: Record<string, { label: string; color: string; icon: string }> = {
    draft:             { label: 'Draft',                  color: colors.textMuted,        icon: 'document-outline' },
    pending_approval:  { label: 'Pending approval',       color: Colors.semantic.warning,  icon: 'time-outline' },
    approved:          { label: 'Approved',               color: Colors.semantic.info,     icon: 'checkmark-circle-outline' },
    finance_pending:   { label: 'Awaiting fee clearance', color: Colors.semantic.warning,  icon: 'cash-outline' },
    under_review:      { label: 'Under review',           color: Colors.semantic.warning,  icon: 'alert-circle-outline' },
    released:          { label: 'Released',               color: Colors.semantic.success,  icon: 'checkmark-done-circle' },
  };
  const s        = statusMap[report.status] ?? statusMap.draft;
  const released = report.status === 'released';

  return (
    <Pressable
      disabled={!released}
      onPress={() => released && router.push({ pathname: '/(app)/report-viewer', params: { report_id: report.id, pdf_url: report.pdf_url ?? '', student_name: '', is_draft: 'false' } } as any)}
      style={({ pressed }) => [{ opacity: pressed && released ? 0.85 : 1 }]}
    >
      <Card variant="elevated" accentColor={s.color} style={styles.cardPad}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="label" color="muted">{report.semesters?.name?.toUpperCase() ?? 'THIS TERM'}</ThemedText>
            {released && report.overall_percentage !== null
              ? <ThemedText style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.3, marginTop: 2 }}>{Number(report.overall_percentage).toFixed(1)}%</ThemedText>
              : <ThemedText variant="h3" style={{ marginTop: 2 }}>{s.label}</ThemedText>
            }
          </View>
          <IconChip icon={<Ionicons name={s.icon as any} size={20} color={s.color} />} bg={s.color + '18'} size={44} />
        </View>
        {released ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md }}>
            <ThemedText style={{ color: Colors.semantic.success, fontWeight: '600', fontSize: 14 }}>View full report</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={Colors.semantic.success} />
          </View>
        ) : (
          <ThemedText variant="bodySm" color="muted" style={{ marginTop: Spacing.sm }}>
            You'll be notified when the report is released.
          </ThemedText>
        )}
      </Card>
    </Pressable>
  );
}

function AttendanceCard({ summary, scheme }: { summary: any; scheme: 'light' | 'dark' }) {
  const pct    = Number(summary.percentage ?? 0);
  const status: AttendanceStatus = pct >= 95 ? 'present' : pct >= 85 ? 'late' : 'absent';
  const color  = resolveAttColor(status);
  const bg     = resolveAttBg(status, scheme);

  return (
    <Card variant="elevated" style={styles.cardPad}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
        <View>
          <ThemedText variant="label" color="muted">OVERALL</ThemedText>
          <ThemedText style={{ fontSize: 28, fontWeight: '700', color, letterSpacing: -0.3 }}>{pct.toFixed(1)}%</ThemedText>
        </View>
        <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: bg }}>
          <ThemedText style={{ color, fontWeight: '700', fontSize: 14 }}>
            {pct >= 95 ? 'Excellent' : pct >= 85 ? 'Good' : 'Needs attention'}
          </ThemedText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[
          { label: 'Present', value: summary.present_count, key: 'present' as AttendanceStatus },
          { label: 'Late',    value: summary.late_count,    key: 'late'    as AttendanceStatus },
          { label: 'Absent',  value: summary.absent_count,  key: 'absent'  as AttendanceStatus },
          { label: 'AP',      value: summary.ap_count,      key: 'ap'      as AttendanceStatus },
        ].map(({ label, value, key }) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <ThemedText style={{ fontSize: 18, fontWeight: '700', color: resolveAttColor(key) }}>{value ?? 0}</ThemedText>
            <ThemedText variant="caption" color="muted">{label}</ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const CAT_META: Record<string, { color: string; icon: string; label: string }> = {
  achievement:       { color: Colors.semantic.success, icon: 'star',            label: 'Achievement' },
  academic_concern:  { color: Colors.semantic.error,   icon: 'alert-circle',    label: 'Academic concern' },
  behaviour_minor:   { color: Colors.semantic.warning, icon: 'warning',         label: 'Behaviour' },
  behaviour_serious: { color: '#DC2626',               icon: 'close-circle',    label: 'Behaviour (serious)' },
  attendance_note:   { color: Colors.semantic.info,    icon: 'calendar',        label: 'Attendance' },
  health:            { color: '#7C3AED',               icon: 'medkit',          label: 'Health' },
  communication:     { color: '#14B8A6',               icon: 'chatbubble',      label: 'Note from school' },
  other:             { color: '#6B7280',               icon: 'document-text',   label: 'Update' },
};

function DayBookRow({ entry }: { entry: any }) {
  const cat         = CAT_META[entry.category] ?? CAT_META.other;
  const teacherName = entry.staff?.full_name ?? 'Staff';

  return (
    <Card variant="elevated" accentColor={cat.color} style={styles.cardPad}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
        <IconChip icon={<Ionicons name={cat.icon as any} size={16} color={cat.color} />} bg={cat.color + '18'} size={36} radius={18} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ThemedText style={{ color: cat.color, fontWeight: '700', fontSize: 13 }}>{cat.label}</ThemedText>
            <ThemedText variant="caption" color="muted">{format(new Date(entry.date), 'd MMM')}</ThemedText>
          </View>
          <ThemedText variant="body">{entry.description}</ThemedText>
          <ThemedText variant="caption" color="muted">— {teacherName}</ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  scroll:     { paddingBottom: Spacing['2xl'] },
  topBar:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base, gap: Spacing.sm },
  iconBtn:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  childRow:   { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingBottom: Spacing.base },
  childChip:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  childHero:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.screen, borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.base },
  cardPad:    { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm },
  quickLinks: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen },
  quickLink:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
});
