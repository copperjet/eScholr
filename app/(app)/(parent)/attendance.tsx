import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, RefreshControl, ScrollView, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, EmptyState, ErrorState, SectionHeader,
  ProgressBar, ScreenHeader, FastList, ListItemSkeleton,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors, resolveAttColor, resolveAttBg } from '../../../constants/Colors';
import type { AttendanceStatus } from '../../../types/database';

const STATUS_LABEL: Record<string, string> = {
  present: 'Present', absent: 'Absent', late: 'Late', ap: 'Auth. Absent', sick: 'Sick',
};

interface ChildRow {
  id: string; full_name: string; photo_url: string | null;
  grades: { name: string } | null; streams: { name: string } | null;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-children', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, grades(name), streams(name))')
        .eq('parent_id', parentId!).eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.students).filter(Boolean) as ChildRow[];
    },
  });
}

function useChildAttendance(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-child-attendance', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('attendance_records')
        .select('date, status, semesters(name)')
        .eq('student_id', studentId!)
        .eq('school_id', schoolId)
        .order('date', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ParentAttendance() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ studentId?: string }>();

  const { data: children, isLoading: childrenLoading, isError: childrenError, refetch: refetchChildren } =
    useChildren(user?.parentId ?? null, user?.schoolId ?? '');

  const initialIdx = useMemo(() => {
    if (!params.studentId || !children) return 0;
    const i = children.findIndex(c => c.id === params.studentId);
    return i >= 0 ? i : 0;
  }, [params.studentId, children]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  useEffect(() => { setSelectedIdx(initialIdx); }, [initialIdx]);

  const activeChild = children?.[selectedIdx] ?? null;
  const { data: records, isLoading, isError, refetch, isRefetching } =
    useChildAttendance(activeChild?.id ?? null, user?.schoolId ?? '');

  const total        = records?.length ?? 0;
  const presentCount = (records ?? []).filter((r: any) => r.status === 'present').length;
  const lateCount    = (records ?? []).filter((r: any) => r.status === 'late').length;
  const absentCount  = (records ?? []).filter((r: any) => r.status === 'absent').length;
  const rate         = total > 0 ? Math.round((presentCount / total) * 100) : 0;
  const rateColor    = rate >= 90 ? Colors.semantic.success : rate >= 80 ? Colors.semantic.warning : Colors.semantic.error;

  if (childrenError) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Attendance" showBack />
      <ErrorState title="Could not load" description="Try again." onRetry={refetchChildren} />
    </SafeAreaView>
  );

  if (!childrenLoading && (!children || children.length === 0)) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Attendance" showBack />
      <EmptyState title="No children linked" description="Contact the school front desk." />
    </SafeAreaView>
  );

  if (isError) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Attendance" showBack />
      <ErrorState title="Could not load attendance" description="Try again." onRetry={refetch} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Attendance" showBack />

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
                <Avatar name={c.full_name} photoUrl={c.photo_url} size={28} />
                <ThemedText style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textPrimary }}>
                  {c.full_name.split(' ')[0]}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <FastList
        data={records ?? []}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
        ListHeaderComponent={
          isLoading ? (
            <View style={{ gap: Spacing.sm }}><ListItemSkeleton /><ListItemSkeleton /></View>
          ) : (
            <>
              <Card variant="elevated" style={styles.summaryCard}>
                <View style={styles.rateRow}>
                  <View>
                    <ThemedText variant="label" color="muted">ATTENDANCE RATE</ThemedText>
                    <ThemedText style={{ fontSize: 40, fontWeight: '800', color: rateColor, letterSpacing: -1, marginTop: 2 }}>
                      {rate}%
                    </ThemedText>
                  </View>
                  <View style={[styles.ratePill, { backgroundColor: rateColor + '18' }]}>
                    <ThemedText style={{ color: rateColor, fontWeight: '700', fontSize: 14 }}>
                      {rate >= 90 ? 'Excellent' : rate >= 80 ? 'Good' : 'Needs attention'}
                    </ThemedText>
                  </View>
                </View>
                <ProgressBar value={rate} max={100} color={rateColor} style={{ marginBottom: Spacing.md }} />
                <View style={styles.pillRow}>
                  {[
                    { label: 'Present', count: presentCount, status: 'present' as AttendanceStatus },
                    { label: 'Late',    count: lateCount,    status: 'late'    as AttendanceStatus },
                    { label: 'Absent',  count: absentCount,  status: 'absent'  as AttendanceStatus },
                  ].map(({ label, count, status }) => (
                    <View key={label} style={[styles.pill, { backgroundColor: resolveAttBg(status, scheme) }]}>
                      <ThemedText style={{ fontSize: 20, fontWeight: '700', color: resolveAttColor(status) }}>{count}</ThemedText>
                      <ThemedText style={{ fontSize: 11, color: resolveAttColor(status), opacity: 0.85 }}>{label}</ThemedText>
                    </View>
                  ))}
                </View>
              </Card>
              <SectionHeader title="Recent Records" />
            </>
          )
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState title="No records" description="Attendance records appear once teachers submit." icon="calendar-outline" />
          ) : null
        }
        renderItem={({ item: r }: { item: any }) => {
          const status: AttendanceStatus = r.status ?? 'absent';
          const color = resolveAttColor(status);
          const bg    = resolveAttBg(status, scheme);
          return (
            <Card variant="elevated" style={styles.recordCard}>
              <View style={styles.recordRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }}>
                    {r.date ? format(new Date(r.date), 'EEEE, d MMM yyyy') : ''}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">{r.semesters?.name}</ThemedText>
                </View>
                <View style={[styles.statusPill, { backgroundColor: bg }]}>
                  <ThemedText style={{ color, fontSize: 12, fontWeight: '700' }}>
                    {STATUS_LABEL[status] ?? status}
                  </ThemedText>
                </View>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  list:        { paddingBottom: TAB_BAR_HEIGHT + Spacing.lg },
  childRow:    { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm },
  childChip:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: Spacing.md, borderRadius: Radius.full, borderWidth: 1 },
  summaryCard: { marginHorizontal: Spacing.screen, marginBottom: Spacing.base },
  rateRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  ratePill:    { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, alignSelf: 'flex-start', marginTop: 6 },
  pillRow:     { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  pill:        { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, gap: 2 },
  recordCard:  { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm },
  recordRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  statusPill:  { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
});
