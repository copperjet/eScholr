/**
 * ST Subject Analysis
 * Detailed performance breakdown for a subject/stream/semester combo.
 * Entry: marks.tsx assignment row → /analysis?subjectId=&streamId=&semesterId=
 */
import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { useSubjectAnalysis } from '../../../hooks/useAnalysis';
import type { StudentResult } from '../../../hooks/useAnalysis';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function SubjectAnalysisScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { subjectId, streamId, semesterId } = useLocalSearchParams<{
    subjectId: string;
    streamId: string;
    semesterId: string;
  }>();

  const { data, isLoading, isError, refetch } = useSubjectAnalysis(
    subjectId ?? null,
    streamId ?? null,
    semesterId ?? null,
    user?.schoolId ?? '',
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load analysis" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Analysis" showBack />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Skeleton width="100%" height={80} radius={Radius.lg} />
          <Skeleton width="100%" height={120} radius={Radius.lg} style={{ marginTop: Spacing.base }} />
          <Skeleton width="100%" height={200} radius={Radius.lg} style={{ marginTop: Spacing.base }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Analysis" showBack />
        <EmptyState title="No data" description="No marks entered yet for this assignment." icon="bar-chart-outline" />
      </SafeAreaView>
    );
  }

  const top3 = data.studentRankings.slice(0, 3);
  const bottom3 = [...data.studentRankings].reverse().slice(0, 3);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Analysis"
        subtitle={`${data.subjectName} · ${data.streamName}`}
        showBack
      />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Semester badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.badge, { backgroundColor: colors.brand.primary + '18' }]}>
            <Ionicons name="calendar-outline" size={12} color={colors.brand.primary} />
            <ThemedText variant="caption" style={{ color: colors.brand.primary, marginLeft: 4 }}>
              {data.semesterName}
            </ThemedText>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
            <ThemedText variant="caption" color="muted">{data.studentCount} students</ThemedText>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard label="Class Average" value={data.avg !== null ? `${data.avg}%` : '—'} color={colors.brand.primary} colors={colors} />
          <StatCard label="Pass Rate" value={data.passRate !== null ? `${data.passRate}%` : '—'} color={Colors.semantic.success} colors={colors} />
          <StatCard label="Highest" value={data.max !== null ? `${data.max}%` : '—'} color={Colors.semantic.warning} colors={colors} />
        </View>

        {/* Assessment breakdown */}
        <SectionTitle title="Assessment Breakdown" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {data.assessmentStats.map(stat => (
            <View key={stat.label} style={[styles.assessRow, { borderBottomColor: colors.border }]}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600', width: 80 }}>{stat.label}</ThemedText>
              <Pill label={`Avg ${stat.avg ?? '—'}%`} color={colors.brand.primary} colors={colors} />
              <Pill label={`Min ${stat.min ?? '—'}%`} color={Colors.semantic.error} colors={colors} />
              <Pill label={`Max ${stat.max ?? '—'}%`} color={Colors.semantic.success} colors={colors} />
            </View>
          ))}
        </View>

        {/* Grade distribution */}
        <SectionTitle title="Grade Distribution" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {data.gradeDistribution.length === 0 ? (
            <ThemedText variant="bodySm" color="muted" style={{ textAlign: 'center', padding: Spacing.base }}>
              No marks entered yet.
            </ThemedText>
          ) : (
            data.gradeDistribution.map(entry => (
              <View key={entry.label} style={styles.gradeRow}>
                <ThemedText variant="label" style={{ width: 28, color: entry.color, fontWeight: '700' }}>
                  {entry.label}
                </ThemedText>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(entry.percent, 2)}%` as any, backgroundColor: entry.color }]} />
                </View>
                <ThemedText variant="caption" color="muted" style={{ width: 48, textAlign: 'right' }}>
                  {entry.count} ({entry.percent}%)
                </ThemedText>
              </View>
            ))
          )}
        </View>

        {/* Top performers */}
        <SectionTitle title="Top Performers" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {top3.length === 0 ? (
            <ThemedText variant="bodySm" color="muted" style={{ textAlign: 'center', padding: Spacing.base }}>No data.</ThemedText>
          ) : (
            top3.map((s, i) => <StudentRow key={s.studentId} student={s} rank={i + 1} variant="top" colors={colors} />)
          )}
        </View>

        {/* Students needing attention */}
        {data.deviations.length > 0 && (
          <>
            <SectionTitle title="Needs Attention" subtitle={`>15pts below avg (${data.avg}%)`} colors={colors} />
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {data.deviations.map((s, i) => (
                <StudentRow key={s.studentId} student={s} rank={data.studentRankings.findIndex(r => r.studentId === s.studentId) + 1} variant="low" colors={colors} />
              ))}
            </View>
          </>
        )}

        {/* Full ranking */}
        <SectionTitle title="Class Ranking" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {data.studentRankings.length === 0 ? (
            <ThemedText variant="bodySm" color="muted" style={{ textAlign: 'center', padding: Spacing.base }}>No marks entered yet.</ThemedText>
          ) : (
            data.studentRankings.map((s, i) => (
              <StudentRow key={s.studentId} student={s} rank={i + 1} variant="neutral" colors={colors} />
            ))
          )}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, subtitle, colors }: { title: string; subtitle?: string; colors: any }) {
  return (
    <View style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}>
      <ThemedText variant="label" style={{ fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textPrimary }}>
        {title}
      </ThemedText>
      {subtitle && <ThemedText variant="caption" color="muted">{subtitle}</ThemedText>}
    </View>
  );
}

function StatCard({ label, value, color, colors }: { label: string; value: string; color: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: color + '40', borderWidth: 1.5 }]}>
      <ThemedText style={{ fontSize: 22, fontWeight: '800', color }}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 2 }}>{label}</ThemedText>
    </View>
  );
}

function Pill({ label, color, colors }: { label: string; color: string; colors: any }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '14', borderColor: color + '40' }]}>
      <ThemedText variant="caption" style={{ color, fontWeight: '600' }}>{label}</ThemedText>
    </View>
  );
}

function StudentRow({ student, rank, variant, colors }: {
  student: StudentResult;
  rank: number;
  variant: 'top' | 'low' | 'neutral';
  colors: any;
}) {
  const rankColor = variant === 'top'
    ? Colors.semantic.success
    : variant === 'low'
    ? Colors.semantic.warning
    : colors.textMuted;

  return (
    <View style={[styles.studentRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.rankBadge, { backgroundColor: rankColor + '18' }]}>
        <ThemedText variant="caption" style={{ color: rankColor, fontWeight: '700' }}>#{rank}</ThemedText>
      </View>
      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
        <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{student.studentName}</ThemedText>
        <ThemedText variant="caption" color="muted">{student.studentNumber}</ThemedText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <ThemedText style={{ fontWeight: '700', color: rankColor, fontSize: 15 }}>
          {student.total !== null ? `${student.total}%` : '—'}
        </ThemedText>
        <ThemedText variant="caption" color="muted">{student.gradeLabel}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 80 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.base },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.base, borderRadius: Radius.lg },
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  assessRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap',
  },
  pill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  gradeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  barTrack: { flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, minWidth: 4 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
});
