/**
 * HRT Class Analysis
 * Shows performance across all subjects for the class teacher's assigned stream.
 * Tap any subject row → ST-style detail view.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader, AcademicPeriodPicker,
} from '../../../components/ui';
import { useHRTClassAnalysis } from '../../../hooks/useAnalysis';
import type { SubjectSummary } from '../../../hooks/useAnalysis';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function HRTClassAnalysisScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useHRTClassAnalysis(
    user?.staffId ?? null,
    user?.schoolId ?? '',
    selectedSemesterId,
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load analysis" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Class Analysis"
        subtitle={data ? `${data.gradeName} · ${data.streamName}` : undefined}
        showBack
      />
      <AcademicPeriodPicker
        schoolId={user?.schoolId ?? ''}
        semesterId={selectedSemesterId ?? (data ? null : null)}
        onChangeSemester={setSelectedSemesterId}
      />

      {isLoading ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={76} radius={Radius.lg} style={{ marginBottom: Spacing.sm }} />
          ))}
        </ScrollView>
      ) : !data || data.subjects.length === 0 ? (
        <EmptyState
          title="No data yet"
          description="No marks entered for this class this semester."
          icon="bar-chart-outline"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Overview cards */}
          <View style={styles.statsRow}>
            <OverviewCard label="Students" value={String(data.studentCount)} color={colors.brand.primary} colors={colors} />
            <OverviewCard label="Class Avg" value={data.overallAvg !== null ? `${data.overallAvg}%` : '—'} color={Colors.semantic.success} colors={colors} />
            <OverviewCard label="Pass Rate" value={data.overallPassRate !== null ? `${data.overallPassRate}%` : '—'} color={Colors.semantic.warning} colors={colors} />
          </View>

          {/* Semester label */}
          {data.semesterName ? (
            <View style={[styles.semBadge, { backgroundColor: colors.brand.primary + '14' }]}>
              <Ionicons name="calendar-outline" size={12} color={colors.brand.primary} />
              <ThemedText variant="caption" style={{ color: colors.brand.primary, marginLeft: 4 }}>
                {data.semesterName}
              </ThemedText>
            </View>
          ) : null}

          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>
            SUBJECTS ({data.subjects.length})
          </ThemedText>

          {data.subjects.map(subject => (
            <SubjectRow
              key={`${subject.subjectId}-${subject.streamId}`}
              subject={subject}
              colors={colors}
              onPress={() => router.push({
                pathname: '/(app)/(st)/analysis',
                params: {
                  subjectId: subject.subjectId,
                  streamId: subject.streamId,
                  semesterId: selectedSemesterId ?? '',
                },
              } as any)}
            />
          ))}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OverviewCard({ label, value, color, colors }: { label: string; value: string; color: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: color + '40', borderWidth: 1.5 }]}>
      <ThemedText style={{ fontSize: 22, fontWeight: '800', color }}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 2 }}>{label}</ThemedText>
    </View>
  );
}

function SubjectRow({ subject, colors, onPress }: { subject: SubjectSummary; colors: any; onPress: () => void }) {
  const passColor = subject.passRate !== null && subject.passRate >= 70
    ? Colors.semantic.success
    : subject.passRate !== null && subject.passRate >= 50
    ? Colors.semantic.warning
    : Colors.semantic.error;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.subjectRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>{subject.subjectName}</ThemedText>
        <ThemedText variant="caption" color="muted">
          {subject.gradeName} · {subject.streamName} · {subject.studentCount} students
        </ThemedText>
        {/* Mini grade distribution */}
        {subject.gradeDistribution.length > 0 && (
          <View style={styles.miniDist}>
            {subject.gradeDistribution.slice(0, 6).map(g => (
              <View key={g.label} style={[styles.miniBar, { backgroundColor: g.color, width: `${Math.max(g.percent, 4)}%` as any }]} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.statsCol}>
        <ThemedText style={{ fontWeight: '800', fontSize: 18, color: colors.brand.primary }}>
          {subject.avg !== null ? `${subject.avg}%` : '—'}
        </ThemedText>
        <ThemedText variant="caption" style={{ color: passColor, fontWeight: '600' }}>
          {subject.passRate !== null ? `${subject.passRate}% pass` : '—'}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 80 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.base, borderRadius: Radius.lg },
  semBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, marginBottom: Spacing.base },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing.sm },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1,
    marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  statsCol: { alignItems: 'flex-end', minWidth: 72 },
  miniDist: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6, gap: 1 },
  miniBar: { height: '100%', borderRadius: 1 },
});
