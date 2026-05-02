/**
 * Admin / HOD / Principal Result Analysis
 * Role-aware:
 *   HOD       → scoped to their department's subjects
 *   principal → all sections (or filtered by one), full school view
 *   admin     → same as principal
 *
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
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader, AcademicPeriodPicker, Chip,
} from '../../../components/ui';
import { useHODDeptAnalysis, usePrincipalAnalysis } from '../../../hooks/useAnalysis';
import type { SubjectSummary } from '../../../hooks/useAnalysis';
import { useSemesters } from '../../../hooks/useAdmin';
import { useDepartmentScope } from '../../../lib/roleScope';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

export default function AdminAnalysisScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const role = user?.activeRole ?? '';
  const department = useDepartmentScope();
  const isHOD = role === 'hod';

  return isHOD
    ? <HODAnalysisView department={department} schoolId={user?.schoolId ?? ''} colors={colors} user={user} />
    : <PrincipalAnalysisView schoolId={user?.schoolId ?? ''} colors={colors} user={user} />;
}

// ─── HOD View ─────────────────────────────────────────────────────────────────

function HODAnalysisView({ department, schoolId, colors, user }: {
  department: string | null; schoolId: string; colors: any; user: any;
}) {
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useHODDeptAnalysis(department, schoolId, semesterId);

  if (!department) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Department Analysis" showBack />
        <EmptyState title="No department assigned" description="Ask your admin to assign a department to your HOD role." icon="business-outline" />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load analysis" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Dept Analysis" subtitle={department} showBack />
      <AcademicPeriodPicker schoolId={schoolId} semesterId={semesterId} onChangeSemester={setSemesterId} />

      {isLoading ? <LoadingState /> : !data || data.subjects.length === 0 ? (
        <EmptyState title="No data" description="No marks entered for department subjects this semester." icon="bar-chart-outline" />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.statsRow}>
            <StatCard label="Assignments" value={String(data.totalSubjectAssignments)} color={colors.brand.primary} colors={colors} />
            <StatCard label="Dept Avg" value={data.overallAvg !== null ? `${data.overallAvg}%` : '—'} color={Colors.semantic.success} colors={colors} />
            <StatCard label="Pass Rate" value={data.overallPassRate !== null ? `${data.overallPassRate}%` : '—'} color={Colors.semantic.warning} colors={colors} />
          </View>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>
            SUBJECTS · {department.toUpperCase()} ({data.subjects.length})
          </ThemedText>
          {data.subjects.map(s => (
            <SubjectRow key={`${s.subjectId}-${s.streamId}`} subject={s} colors={colors}
              semesterId={semesterId}
            />
          ))}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Principal / Admin View ───────────────────────────────────────────────────

function PrincipalAnalysisView({ schoolId, colors, user }: { schoolId: string; colors: any; user: any }) {
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [filterSectionId, setFilterSectionId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = usePrincipalAnalysis(schoolId, semesterId, filterSectionId);

  // Build section options from the returned data for the filter chips
  const sectionOptions = data?.sections.map(s => ({ id: s.sectionId, name: s.sectionName })) ?? [];

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load analysis" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const totalSubjects = data?.sections.reduce((a, s) => a + s.subjects.length, 0) ?? 0;
  const allAvgs = data?.sections.flatMap(s => s.subjects.map(sub => sub.avg)).filter((v): v is number => v !== null) ?? [];
  const schoolAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length * 10) / 10 : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="School Analysis" subtitle="Results by section" showBack />
      <AcademicPeriodPicker schoolId={schoolId} semesterId={semesterId} onChangeSemester={setSemesterId} />

      {/* Section filter chips */}
      {sectionOptions.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All Sections" selected={!filterSectionId} onPress={() => { haptics.light(); setFilterSectionId(null); }} />
          {sectionOptions.map(s => (
            <Chip key={s.id} label={s.name} selected={filterSectionId === s.id}
              onPress={() => { haptics.light(); setFilterSectionId(s.id === filterSectionId ? null : s.id); }}
            />
          ))}
        </ScrollView>
      )}

      {isLoading ? <LoadingState /> : !data || data.sections.length === 0 ? (
        <EmptyState title="No data" description="No marks entered this semester." icon="bar-chart-outline" />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* School-wide stats */}
          <View style={styles.statsRow}>
            <StatCard label="Sections" value={String(data.sections.length)} color={colors.brand.primary} colors={colors} />
            <StatCard label="School Avg" value={schoolAvg !== null ? `${schoolAvg}%` : '—'} color={Colors.semantic.success} colors={colors} />
            <StatCard label="Subjects" value={String(totalSubjects)} color={Colors.semantic.warning} colors={colors} />
          </View>

          {data.sections.map(section => (
            <View key={section.sectionId}>
              {/* Section header */}
              <View style={[styles.sectionHeader, { backgroundColor: colors.brand.primary + '10', borderColor: colors.brand.primary + '30' }]}>
                <Ionicons name="business-outline" size={14} color={colors.brand.primary} />
                <ThemedText style={{ fontWeight: '700', color: colors.brand.primary, marginLeft: 6, flex: 1 }}>
                  {section.sectionName}
                </ThemedText>
                <View style={styles.sectionMeta}>
                  {section.overallAvg !== null && (
                    <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '600' }}>
                      Avg {section.overallAvg}%
                    </ThemedText>
                  )}
                  {section.overallPassRate !== null && (
                    <ThemedText variant="caption" color="muted"> · {section.overallPassRate}% pass</ThemedText>
                  )}
                </View>
              </View>

              {section.subjects.map(s => (
                <SubjectRow key={`${s.subjectId}-${s.streamId}`} subject={s} colors={colors}
                  semesterId={semesterId}
                />
              ))}
              <View style={{ height: Spacing.sm }} />
            </View>
          ))}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} width="100%" height={76} radius={Radius.lg} />
      ))}
    </ScrollView>
  );
}

function StatCard({ label, value, color, colors }: { label: string; value: string; color: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: color + '40', borderWidth: 1.5 }]}>
      <ThemedText style={{ fontSize: 20, fontWeight: '800', color }}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 2 }}>{label}</ThemedText>
    </View>
  );
}

function SubjectRow({ subject, colors, semesterId }: {
  subject: SubjectSummary; colors: any; semesterId: string | null;
}) {
  const passColor = subject.passRate !== null && subject.passRate >= 70
    ? Colors.semantic.success
    : subject.passRate !== null && subject.passRate >= 50
    ? Colors.semantic.warning
    : Colors.semantic.error;

  return (
    <TouchableOpacity
      onPress={() => {
        haptics.light();
        router.push({
          pathname: '/(app)/(st)/analysis',
          params: { subjectId: subject.subjectId, streamId: subject.streamId, semesterId: semesterId ?? '' },
        } as any);
      }}
      activeOpacity={0.75}
      style={[styles.subjectRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{subject.subjectName}</ThemedText>
        <ThemedText variant="caption" color="muted">
          {subject.gradeName} · {subject.streamName} · {subject.studentCount} students
        </ThemedText>
        {subject.gradeDistribution.length > 0 && (
          <View style={styles.miniDist}>
            {subject.gradeDistribution.slice(0, 6).map(g => (
              <View key={g.label} style={[styles.miniBar, { backgroundColor: g.color, width: `${Math.max(g.percent, 3)}%` as any }]} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.statsCol}>
        <ThemedText style={{ fontWeight: '800', fontSize: 17, color: colors.brand.primary }}>
          {subject.avg !== null ? `${subject.avg}%` : '—'}
        </ThemedText>
        <ThemedText variant="caption" style={{ color: passColor, fontWeight: '600' }}>
          {subject.passRate !== null ? `${subject.passRate}% pass` : '—'}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 80 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  statCard: { flex: 1, alignItems: 'center', padding: Spacing.base, borderRadius: Radius.lg },
  chipRow: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm, flexDirection: 'row' },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
    marginBottom: Spacing.xs, marginTop: Spacing.sm,
  },
  sectionMeta: { flexDirection: 'row', alignItems: 'center' },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1,
    marginBottom: Spacing.xs, gap: Spacing.sm,
  },
  statsCol: { alignItems: 'flex-end', minWidth: 72 },
  miniDist: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6, gap: 1 },
  miniBar: { height: '100%', borderRadius: 1 },
});
