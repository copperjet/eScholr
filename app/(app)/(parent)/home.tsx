import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, Skeleton, SkeletonRow,
  EmptyState, ErrorState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors, resolveAttBg, resolveAttColor } from '../../../constants/Colors';
import type { AttendanceStatus } from '../../../types/database';

const TODAY_LABEL = format(new Date(), 'EEEE, d MMMM');

interface ChildRow {
  id: string;
  full_name: string;
  photo_url: string | null;
  student_number: string;
  stream_id: string;
  grades: { name: string } | null;
  streams: { name: string } | null;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-children', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, student_number, stream_id, grades(name), streams(name))')
        .eq('parent_id', parentId!)
        .eq('school_id', schoolId);
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
        .from('semesters')
        .select('id, name, start_date, end_date')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();

      const semesterId = (sem as any)?.id;
      if (!semesterId) return { semester: null, report: null, attendance: null, dayBook: [] };

      const [attSumRes, reportRes, dayBookRes] = await Promise.all([
        (supabase.rpc as any)('get_attendance_summary', { p_student_id: child!.id, p_semester_id: semesterId }),
        supabase
          .from('reports')
          .select('id, status, overall_percentage, released_at, semesters(name)')
          .eq('school_id', schoolId)
          .eq('student_id', child!.id)
          .eq('semester_id', semesterId)
          .maybeSingle(),
        supabase
          .from('day_book_entries')
          .select('id, category, description, date, created_at, staff:created_by(full_name)')
          .eq('school_id', schoolId)
          .eq('student_id', child!.id)
          .eq('send_to_parent', true)
          .eq('archived', false)
          .order('date', { ascending: false })
          .limit(5),
      ]);

      const attSummary = (attSumRes.data as any)?.[0] ?? null;
      return {
        semester: sem,
        report: reportRes.data,
        attendance: attSummary,
        dayBook: dayBookRes.data ?? [],
      };
    },
  });
}

export default function ParentHome() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();
  const [selectedChildIdx, setSelectedChildIdx] = useState(0);

  const { data: children, isLoading: childrenLoading, isError: childrenError, refetch: refetchChildren } =
    useChildren(user?.parentId ?? null, user?.schoolId ?? '');

  const activeChild = children?.[selectedChildIdx] ?? null;

  const { data, isLoading, refetch, isRefetching } =
    useChildDashboard(activeChild, user?.schoolId ?? '');

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (childrenError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load" description="Check your connection and try again." onRetry={refetchChildren} />
      </SafeAreaView>
    );
  }

  if (!childrenLoading && (!children || children.length === 0)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <EmptyState
          title="No children linked"
          description="Your account is not yet linked to a student. Contact the school front desk."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText variant="bodySm" color="muted">{TODAY_LABEL}</ThemedText>
            <ThemedText variant="h3">
              {greeting}, {user?.fullName?.split(' ')[0] ?? 'Parent'} 👋
            </ThemedText>
          </View>
          <TouchableOpacity style={[styles.bellBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Child switcher */}
        {childrenLoading ? (
          <Skeleton width="100%" height={72} radius={Radius.lg} style={{ marginBottom: Spacing.base }} />
        ) : (children ?? []).length === 1 ? (
          <ChildHeaderSingle child={activeChild!} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.base }}
            style={{ marginBottom: Spacing.base }}
          >
            {(children ?? []).map((c, i) => {
              const selected = i === selectedChildIdx;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedChildIdx(i)}
                  activeOpacity={0.85}
                  style={[
                    styles.childChip,
                    {
                      backgroundColor: selected ? colors.brand.primary : colors.surface,
                      borderColor: selected ? colors.brand.primary : colors.border,
                    },
                  ]}
                >
                  <Avatar name={c.full_name} photoUrl={c.photo_url} size={36} />
                  <View>
                    <ThemedText variant="bodySm" style={{ color: selected ? '#fff' : colors.textPrimary, fontWeight: '600' }}>
                      {c.full_name.split(' ')[0]}
                    </ThemedText>
                    <ThemedText variant="caption" style={{ color: selected ? '#ffffffCC' : colors.textMuted }}>
                      {c.grades?.name} · {c.streams?.name}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Report card */}
        <ThemedText variant="label" color="muted" style={styles.sectionLabel}>LATEST REPORT</ThemedText>
        {isLoading ? (
          <Card style={styles.card}><SkeletonRow lines={2} /></Card>
        ) : data?.report ? (
          <ReportCard report={data.report} colors={colors} />
        ) : (
          <Card style={styles.card}>
            <View style={styles.reportEmpty}>
              <Ionicons name="document-text-outline" size={24} color={colors.textMuted} />
              <ThemedText variant="body" color="muted" style={{ marginLeft: Spacing.sm }}>
                Report for this term is not yet available.
              </ThemedText>
            </View>
          </Card>
        )}

        {/* Attendance */}
        <ThemedText variant="label" color="muted" style={styles.sectionLabel}>ATTENDANCE THIS TERM</ThemedText>
        {isLoading ? (
          <Card style={styles.card}><SkeletonRow lines={2} /></Card>
        ) : data?.attendance ? (
          <AttendanceCard summary={data.attendance} scheme={scheme} />
        ) : (
          <Card style={styles.card}>
            <ThemedText variant="body" color="muted" style={{ textAlign: 'center' }}>No attendance recorded yet.</ThemedText>
          </Card>
        )}

        {/* Day Book */}
        <View style={styles.sectionRow}>
          <ThemedText variant="label" color="muted">DAY BOOK</ThemedText>
          {(data?.dayBook ?? []).length > 0 && (
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ThemedText variant="bodySm" color="brand">See all</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <Card style={styles.card}><SkeletonRow lines={3} /></Card>
        ) : (data?.dayBook ?? []).length === 0 ? (
          <Card style={[styles.card, { alignItems: 'center', paddingVertical: Spacing.xl }]}>
            <ThemedText variant="body" color="muted">No updates yet.</ThemedText>
          </Card>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {(data?.dayBook ?? []).map((entry: any) => (
              <DayBookRow key={entry.id} entry={entry} />
            ))}
          </View>
        )}

        {/* Quick links */}
        <View style={[styles.sectionRow, { marginTop: Spacing.base }]}>
          <ThemedText variant="label" color="muted">QUICK LINKS</ThemedText>
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <TouchableOpacity
            onPress={() => router.push('/(app)/announcements' as any)}
            style={[styles.quickLink, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="megaphone-outline" size={20} color={colors.brand.primary} />
            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '600', marginTop: 4, textAlign: 'center' }}>Announcements</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(app)/timetable' as any)}
            style={[styles.quickLink, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.brand.primary} />
            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '600', marginTop: 4, textAlign: 'center' }}>Timetable</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(app)/notifications' as any)}
            style={[styles.quickLink, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.brand.primary} />
            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '600', marginTop: 4, textAlign: 'center' }}>Notifications</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChildHeaderSingle({ child }: { child: ChildRow }) {
  return (
    <Card style={{ marginBottom: Spacing.base }}>
      <View style={styles.childHeaderRow}>
        <Avatar name={child.full_name} photoUrl={child.photo_url} size={48} />
        <View style={{ flex: 1 }}>
          <ThemedText variant="h4">{child.full_name}</ThemedText>
          <ThemedText variant="bodySm" color="muted">
            {child.grades?.name} · {child.streams?.name} · {child.student_number}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

function ReportCard({ report, colors }: { report: any; colors: any }) {
  const statusMap: Record<string, { label: string; color: string; icon: string }> = {
    draft:             { label: 'Draft',                    color: colors.textMuted,        icon: 'document-outline' },
    pending_approval:  { label: 'Pending approval',         color: Colors.semantic.warning,  icon: 'time-outline' },
    approved:          { label: 'Approved',                 color: Colors.semantic.info,     icon: 'checkmark-circle-outline' },
    finance_pending:   { label: 'Awaiting fee clearance',   color: Colors.semantic.warning,  icon: 'cash-outline' },
    under_review:      { label: 'Under review',             color: Colors.semantic.warning,  icon: 'alert-circle-outline' },
    released:          { label: 'Released',                 color: Colors.semantic.success,  icon: 'checkmark-done-circle' },
  };
  const s = statusMap[report.status] ?? statusMap.draft;
  const released = report.status === 'released';
  const semesterName = report.semesters?.name ?? 'This term';

  const handleViewReport = () => {
    if (!released) return;
    router.push({
      pathname: '/(app)/report-viewer',
      params: { report_id: report.id, pdf_url: report.pdf_url ?? '', student_name: '', is_draft: 'false' },
    } as any);
  };

  return (
    <TouchableOpacity activeOpacity={released ? 0.85 : 1} onPress={handleViewReport} disabled={!released}>
      <Card accentColor={s.color} style={styles.card}>
        <View style={styles.reportTop}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="label" color="muted">{semesterName.toUpperCase()}</ThemedText>
            {released && report.overall_percentage !== null ? (
              <ThemedText variant="h2">{Number(report.overall_percentage).toFixed(1)}%</ThemedText>
            ) : (
              <ThemedText variant="h4">{s.label}</ThemedText>
            )}
          </View>
          <View style={[styles.reportIcon, { backgroundColor: s.color + '18' }]}>
            <Ionicons name={s.icon as any} size={24} color={s.color} />
          </View>
        </View>
        {released ? (
          <View style={styles.viewReportRow}>
            <ThemedText variant="bodySm" color="brand" style={{ fontWeight: '600' }}>View full report</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={colors.brand.primary} />
          </View>
        ) : (
          <ThemedText variant="bodySm" color="muted">
            You will be notified when the report is released.
          </ThemedText>
        )}
      </Card>
    </TouchableOpacity>
  );
}

function AttendanceCard({ summary, scheme }: { summary: any; scheme: 'light' | 'dark' }) {
  const pct = Number(summary.percentage ?? 0);
  const status: AttendanceStatus = pct >= 95 ? 'present' : pct >= 85 ? 'late' : 'absent';
  const color = resolveAttColor(status);
  const bg = resolveAttBg(status, scheme);

  return (
    <Card style={styles.card}>
      <View style={styles.attTop}>
        <View>
          <ThemedText variant="label" color="muted">OVERALL</ThemedText>
          <ThemedText variant="h2" style={{ color }}>{pct.toFixed(1)}%</ThemedText>
        </View>
        <View style={[styles.attBadge, { backgroundColor: bg }]}>
          <ThemedText variant="bodySm" style={{ color, fontWeight: '700' }}>
            {pct >= 95 ? 'Excellent' : pct >= 85 ? 'Good' : 'Needs attention'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.attPills}>
        <AttStat label="Present" value={summary.present_count} color={resolveAttColor('present')} />
        <AttStat label="Late" value={summary.late_count} color={resolveAttColor('late')} />
        <AttStat label="Absent" value={summary.absent_count} color={resolveAttColor('absent')} />
        <AttStat label="AP" value={summary.ap_count} color={resolveAttColor('ap')} />
      </View>
    </Card>
  );
}

function AttStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.attStat}>
      <ThemedText variant="h4" style={{ color }}>{value ?? 0}</ThemedText>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
    </View>
  );
}

function DayBookRow({ entry }: { entry: any }) {
  const catColors: Record<string, { color: string; icon: string; label: string }> = {
    achievement:        { color: '#10B981', icon: 'star',            label: 'Achievement' },
    academic_concern:   { color: '#EF4444', icon: 'alert-circle',    label: 'Academic concern' },
    behaviour_minor:    { color: '#F59E0B', icon: 'warning',         label: 'Behaviour' },
    behaviour_serious:  { color: '#DC2626', icon: 'close-circle',    label: 'Behaviour (serious)' },
    attendance_note:    { color: '#3B82F6', icon: 'calendar',        label: 'Attendance' },
    health:             { color: '#8B5CF6', icon: 'medkit',          label: 'Health' },
    communication:      { color: '#14B8A6', icon: 'chatbubble',      label: 'Note from school' },
    other:              { color: '#6B7280', icon: 'document-text',   label: 'Update' },
  };
  const cat = catColors[entry.category] ?? catColors.other;
  const teacherName = entry.staff?.full_name ?? 'Staff';

  return (
    <Card accentColor={cat.color} style={{ marginBottom: Spacing.sm }}>
      <View style={styles.dayBookRow}>
        <View style={[styles.dayBookIcon, { backgroundColor: cat.color + '18' }]}>
          <Ionicons name={cat.icon as any} size={16} color={cat.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.dayBookHeader}>
            <ThemedText variant="bodySm" style={{ color: cat.color, fontWeight: '700' }}>{cat.label}</ThemedText>
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
  safe: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.base },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.lg },
  bellBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  childHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sectionLabel: { marginTop: Spacing.base, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.base, marginBottom: Spacing.sm },
  card: { marginBottom: Spacing.sm },
  reportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  reportIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reportEmpty: { flexDirection: 'row', alignItems: 'center' },
  viewReportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  attTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  attBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  attPills: { flexDirection: 'row', justifyContent: 'space-between' },
  attStat: { flex: 1, alignItems: 'center', gap: 2 },
  dayBookRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  dayBookIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayBookHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickLink: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
