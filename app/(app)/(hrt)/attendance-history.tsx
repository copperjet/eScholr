import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, subDays } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { AttendanceSummaryCard } from '../../../components/modules/AttendanceSummaryCard';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors, resolveAttColor } from '../../../constants/Colors';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const LOOKBACK_DAYS = 30;

interface DayRecord {
  date: string;
  isSubmitted: boolean;
  present: number;
  absent: number;
  late: number;
  ap: number;
  sick: number;
  total: number;
}

function useAttendanceHistory(staffId: string | null, schoolId: string) {
  return useQuery<{ days: DayRecord[]; streamName: string }>({
    queryKey: ['attendance-history', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      // Get HRT assignment
      const { data: assignment } = await supabase
        .from('hrt_assignments')
        .select('stream_id, semester_id, streams ( name )')
        .eq('school_id', schoolId)
        .or(`staff_id.eq.${staffId},co_hrt_staff_id.eq.${staffId}`)
        .limit(1)
        .single();

      if (!assignment) return { days: [], streamName: '' };

      const { stream_id } = assignment as any;
      const streamName = (assignment as any).streams?.name ?? '';
      const fromDate = format(subDays(new Date(), LOOKBACK_DAYS), 'yyyy-MM-dd');

      const { data: records } = await supabase
        .from('attendance_records')
        .select('date, status, submitted_by, register_locked')
        .eq('school_id', schoolId)
        .eq('stream_id', stream_id)
        .gte('date', fromDate)
        .lte('date', TODAY)
        .order('date', { ascending: false });

      // Group by date
      const byDate: Record<string, any[]> = {};
      (records ?? []).forEach((r: any) => {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push(r);
      });

      const days: DayRecord[] = Object.entries(byDate)
        .map(([date, rows]) => ({
          date,
          isSubmitted: rows.some((r) => r.register_locked),
          present: rows.filter((r) => r.status === 'present').length,
          absent:  rows.filter((r) => r.status === 'absent').length,
          late:    rows.filter((r) => r.status === 'late').length,
          ap:      rows.filter((r) => r.status === 'ap').length,
          sick:    rows.filter((r) => r.status === 'sick').length,
          total:   rows.length,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      return { days, streamName };
    },
  });
}

export default function AttendanceHistoryScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch } = useAttendanceHistory(
    user?.staffId ?? null,
    user?.schoolId ?? '',
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Could not load history"
          description="Check your connection and try again."
          onRetry={refetch}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Attendance History"
        subtitle={data?.streamName ? `${data.streamName} — last ${LOOKBACK_DAYS} days` : undefined}
        showBack
      />

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={48} height={48} radius={8} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="40%" height={14} />
                <Skeleton width="70%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : !data?.days.length ? (
        <EmptyState
          title="No attendance records"
          description="Submitted registers will appear here."
        />
      ) : (
        <FlatList
          data={data.days}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <HistoryDayRow day={item} colors={colors} />}
        />
      )}
    </SafeAreaView>
  );
}

function HistoryDayRow({ day, colors }: { day: DayRecord; colors: any }) {
  const dateObj = parseISO(day.date);
  const dayName = format(dateObj, 'EEE');
  const dateStr = format(dateObj, 'd MMM');
  const isToday = day.date === TODAY;

  const attendancePct = day.total > 0
    ? Math.round(((day.present + day.late + day.ap) / day.total) * 100)
    : 0;

  return (
    <View style={[styles.dayRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Date block */}
      <View style={[styles.dateBlock, { backgroundColor: isToday ? colors.brand.primary : colors.surfaceSecondary }]}>
        <ThemedText variant="label" style={{ color: isToday ? '#fff' : colors.textMuted, fontSize: 10 }}>
          {dayName.toUpperCase()}
        </ThemedText>
        <ThemedText variant="h4" style={{ color: isToday ? '#fff' : colors.textPrimary }}>{dateStr.split(' ')[0]}</ThemedText>
        <ThemedText variant="label" style={{ color: isToday ? '#fff' : colors.textMuted, fontSize: 10 }}>
          {dateStr.split(' ')[1]}
        </ThemedText>
      </View>

      {/* Stats */}
      <View style={styles.dayStats}>
        {day.isSubmitted ? (
          <>
            <View style={styles.statChips}>
              {day.present > 0 && <StatChip count={day.present} color={Colors.attendance.present} label="P" />}
              {day.late > 0    && <StatChip count={day.late}    color={Colors.attendance.late}    label="L" />}
              {day.absent > 0  && <StatChip count={day.absent}  color={Colors.attendance.absent}  label="A" />}
              {day.ap > 0      && <StatChip count={day.ap}      color={Colors.attendance.ap}      label="AP" />}
              {day.sick > 0    && <StatChip count={day.sick}    color={Colors.attendance.sick}    label="S" />}
            </View>
            <View style={styles.pctRow}>
              <ThemedText variant="caption" color="muted">{day.total} students</ThemedText>
              <ThemedText
                variant="caption"
                style={{
                  color: attendancePct >= 85 ? Colors.semantic.success : Colors.semantic.error,
                  fontWeight: '700',
                  marginLeft: Spacing.sm,
                }}
              >
                {attendancePct}% present
              </ThemedText>
            </View>
          </>
        ) : (
          <View style={styles.notSubmittedRow}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.semantic.warning} />
            <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: 6 }}>
              Register not submitted
            </ThemedText>
          </View>
        )}
      </View>

      {/* Status icon */}
      <Ionicons
        name={day.isSubmitted ? 'checkmark-circle' : 'time-outline'}
        size={20}
        color={day.isSubmitted ? Colors.semantic.success : Colors.semantic.warning}
      />
    </View>
  );
}

function StatChip({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <View style={[styles.chip, { borderColor: color + '60', backgroundColor: color + '18' }]}>
      <ThemedText variant="label" style={{ color, fontSize: 11, fontWeight: '700' }}>
        {count} {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  skeletonList: { padding: Spacing.base, gap: Spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    gap: Spacing.md,
    paddingRight: Spacing.md,
    ...Shadow.sm,
  },
  dateBlock: {
    width: 56,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 2,
  },
  dayStats: { flex: 1, gap: 4, paddingVertical: Spacing.sm },
  statChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  pctRow: { flexDirection: 'row', alignItems: 'center' },
  notSubmittedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
});
