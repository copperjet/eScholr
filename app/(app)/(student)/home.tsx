import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Card, Badge,
  EmptyState, ErrorState, SectionHeader, StatCard,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const TODAY = format(new Date(), 'EEEE dd/MM');

function useStudentDashboard(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['student-dashboard', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      // Get active semester
      const { data: sem } = await (supabase as any)
        .from('semesters')
        .select('id, name, start_date, end_date')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .single();
      if (!sem) throw new Error('No active semester');

      const [profileRes, attendanceRes, marksRes, reportsRes, dayBookRes, invoicesRes] = await Promise.all([
        (supabase as any).from('students').select('*, streams(name, grades(name)), school_sections(name)').eq('id', studentId!).single(),
        (supabase as any).from('attendance_records').select('date, status').eq('student_id', studentId!).eq('semester_id', sem.id).order('date', { ascending: false }).limit(30),
        (supabase as any).from('marks').select('assessment_type, value, subjects(name)').eq('student_id', studentId!).eq('semester_id', sem.id).order('created_at', { ascending: false }),
        (supabase as any).from('reports').select('id, status, overall_percentage, class_position, pdf_url, released_at').eq('student_id', studentId!).eq('semester_id', sem.id).order('created_at', { ascending: false }).limit(1),
        (supabase as any).from('day_book_entries').select('id, date, category, description').eq('student_id', studentId!).order('date', { ascending: false }).limit(3),
        (supabase as any).from('invoices').select('id, invoice_number, total_amount, balance, status, due_date').eq('student_id', studentId!).eq('semester_id', sem.id).order('created_at', { ascending: false }),
      ]);

      const attendance = attendanceRes.data ?? [];
      const presentCount = attendance.filter((r: any) => r.status === 'present').length;
      const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

      const invoices = invoicesRes.data ?? [];
      const totalOutstanding = invoices.filter((i: any) => i.status !== 'paid').reduce((sum: number, i: any) => sum + (i.balance ?? 0), 0);

      return {
        profile: profileRes.data,
        semester: sem,
        attendance: { records: attendance, rate: attendanceRate, count: attendance.length },
        marks: marksRes.data ?? [],
        latestReport: (reportsRes.data ?? [])[0] ?? null,
        dayBook: dayBookRes.data ?? [],
        invoices,
        totalOutstanding,
      };
    },
  });
}

export default function StudentHome() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();

  const studentId = user?.studentId ?? null;
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isError, refetch, isRefetching } = useStudentDashboard(studentId, schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Check connection." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const profile = data?.profile;
  const semester = data?.semester;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <View>
            <ThemedText variant="caption" color="muted">{TODAY}</ThemedText>
            <ThemedText variant="h2">My School</ThemedText>
          </View>
          <Pressable onPress={() => router.push('/(app)/notifications' as any)} style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Student Card */}
        {isLoading || !profile ? (
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary }} />
              <View style={{ flex: 1, marginLeft: Spacing.md, gap: 8 }}>
                <View style={{ height: 18, width: '70%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
                <View style={{ height: 14, width: '50%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
                <View style={{ height: 12, width: '35%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.heroCard, { backgroundColor: colors.brand.primary }]}>
            <View style={styles.heroRow}>
              <Avatar name={profile.full_name} photoUrl={profile.photo_url} size={64} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <ThemedText style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>{profile.full_name}</ThemedText>
                <ThemedText style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                  {profile.grades?.name} {profile.streams?.name}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  {semester?.name}
                </ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Quick Stats */}
        <SectionHeader title="This Term" />
        {isLoading ? (
          <View style={styles.statRow}>
            {[0,1,2].map(i => <StatCard key={i} label="—" value="—" icon="ellipse" style={styles.statCell} />)}
          </View>
        ) : (
          <View style={styles.statRow}>
            <StatCard
              label="Attendance"
              value={`${data?.attendance.rate ?? 0}%`}
              icon="calendar"
              iconBg={Colors.semantic.infoLight}
              iconColor={Colors.semantic.info}
              style={styles.statCell}
            />
            <StatCard
              label="Marks"
              value={`${data?.marks.length ?? 0}`}
              icon="school"
              iconBg={Colors.semantic.successLight}
              iconColor={Colors.semantic.success}
              style={styles.statCell}
            />
            <StatCard
              label="Days Present"
              value={`${data?.attendance.count ?? 0}`}
              icon="checkmark-circle"
              iconBg={Colors.semantic.warningLight}
              iconColor={Colors.semantic.warning}
              style={styles.statCell}
            />
          </View>
        )}

        {/* Latest Report */}
        <SectionHeader title="Latest Report" />
        {isLoading ? (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <View style={{ gap: 8 }}>
              <View style={{ height: 16, width: '60%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
              <View style={{ height: 12, width: '40%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
            </View>
          </Card>
        ) : data?.latestReport ? (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <ThemedText style={{ fontWeight: '600' }}>{semester?.name} Report</ThemedText>
                {data.latestReport.overall_percentage != null && (
                  <ThemedText variant="caption" color="muted">
                    {data.latestReport.overall_percentage.toFixed(1)}% · Position {data.latestReport.class_position ?? '-'}
                  </ThemedText>
                )}
              </View>
              <Badge
                label={data.latestReport.status === 'released' ? 'Released' : data.latestReport.status}
                preset={data.latestReport.status === 'released' ? 'success' : 'warning'}
              />
            </View>
            {data.latestReport.pdf_url && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/(app)/report-viewer' as any,
                  params: { pdf_url: data.latestReport.pdf_url, report_id: data.latestReport.id }
                })}
                style={[styles.viewBtn, { backgroundColor: colors.brand.primary }]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '600' }}>View Report</ThemedText>
              </Pressable>
            )}
          </Card>
        ) : (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <ThemedText color="muted">No report available yet.</ThemedText>
          </Card>
        )}

        {/* Quick Links */}
        <SectionHeader title="Quick Links" />
        <View style={styles.quickRow}>
          <Pressable onPress={() => router.push('/(app)/(student)/timetable' as any)} style={styles.quickTile}>
            <View style={[styles.quickIcon, { backgroundColor: colors.brand.primarySoft }]}>
              <Ionicons name="calendar-outline" size={24} color={colors.brand.primary} />
            </View>
            <ThemedText variant="caption" style={{ marginTop: 4 }}>Timetable</ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(student)/announcements' as any)} style={styles.quickTile}>
            <View style={[styles.quickIcon, { backgroundColor: colors.brand.primarySoft }]}>
              <Ionicons name="megaphone-outline" size={24} color={colors.brand.primary} />
            </View>
            <ThemedText variant="caption" style={{ marginTop: 4 }}>Announcements</ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/(student)/homework' as any)} style={styles.quickTile}>
            <View style={[styles.quickIcon, { backgroundColor: colors.brand.primarySoft }]}>
              <Ionicons name="book-outline" size={24} color={colors.brand.primary} />
            </View>
            <ThemedText variant="caption" style={{ marginTop: 4 }}>Homework</ThemedText>
          </Pressable>
        </View>

        {/* Fees */}
        <SectionHeader title="Fees" />
        {isLoading ? (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <View style={{ gap: 8 }}>
              <View style={{ height: 16, width: '60%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
              <View style={{ height: 12, width: '40%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
            </View>
          </Card>
        ) : data?.invoices && data.invoices.length > 0 ? (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
              <ThemedText variant="label" color="muted">OUTSTANDING</ThemedText>
              <ThemedText variant="h4" style={{ color: data!.totalOutstanding > 0 ? Colors.semantic.error : Colors.semantic.success }}>
                {data?.totalOutstanding?.toLocaleString?.() ?? 0}
              </ThemedText>
            </View>
            {data?.invoices.slice(0, 2).map((inv: any) => (
              <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <View>
                  <ThemedText style={{ fontWeight: '500' }}>{inv.invoice_number}</ThemedText>
                  <ThemedText variant="caption" color="muted">Due: {inv.due_date ?? '—'}</ThemedText>
                </View>
                <Badge
                  label={inv.status}
                  preset={inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : 'error'}
                  variant="tonal"
                />
              </View>
            ))}
          </Card>
        ) : (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <ThemedText color="muted">No invoices for this term.</ThemedText>
          </Card>
        )}

        {/* Recent Day Book */}
        <SectionHeader title="Recent Notes" />
        {isLoading ? (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <View style={{ gap: 8 }}>
              <View style={{ height: 16, width: '60%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
              <View style={{ height: 12, width: '40%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
            </View>
          </Card>
        ) : data?.dayBook.length === 0 ? (
          <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
            <ThemedText color="muted">No notes yet.</ThemedText>
          </Card>
        ) : (
          data?.dayBook.map((entry: any) => (
            <Card key={entry.id} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
              <Badge label={entry.category} preset="info" variant="tonal" style={{ alignSelf: 'flex-start', marginBottom: Spacing.xs }} />
              <ThemedText variant="body">{entry.description}</ThemedText>
              <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
                {entry.date ? format(new Date(entry.date), 'dd/MM/yy') : ''}
              </ThemedText>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screen, paddingTop: Spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  heroCard: { marginHorizontal: Spacing.screen, marginBottom: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: Spacing.screen, marginBottom: Spacing.lg },
  quickTile: { alignItems: 'center' },
  quickIcon: { width: 56, height: 56, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.screen, marginBottom: Spacing.lg },
  statCell: { flex: 1, alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md },
  viewBtn: {
    marginTop: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: Radius.md, alignSelf: 'flex-start',
  },
});
