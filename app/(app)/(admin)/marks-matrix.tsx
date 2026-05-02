/**
 * Admin Marks Completion Matrix
 * Rows = streams, columns = subjects. Each cell shows entry %, color-coded.
 * Tap cell → marks-unlock if locked, else info sheet.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, BottomSheet, Skeleton, EmptyState, ErrorState, ScreenHeader, AcademicPeriodPicker,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// ─── types ────────────────────────────────────────────────────────────────────

interface MatrixCell {
  assignmentId: string | null;
  entered: number;
  total: number;
  isLocked: boolean;
  isComplete: boolean;
  windowOpen: boolean;
}

interface MatrixRow {
  streamId: string;
  streamName: string;
  gradeName: string;
  cells: Record<string, MatrixCell>; // keyed by subjectId
}

interface MatrixData {
  subjectIds: string[];
  subjectNames: Record<string, string>;
  rows: MatrixRow[];
  semesterName: string;
}

// ─── data hook ────────────────────────────────────────────────────────────────

function useMarksMatrix(schoolId: string, overrideSemesterId?: string | null) {
  return useQuery<MatrixData>({
    queryKey: ['admin-marks-matrix', schoolId, overrideSemesterId ?? null],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const db = supabase as any;

      const [assignmentsRes, activeRes] = await Promise.all([
        db.from('subject_teacher_assignments')
          .select(`
            id, subject_id, stream_id, semester_id, is_locked,
            subjects ( name ),
            streams ( name, grades ( name ) ),
            semesters ( name, is_active, marks_window_open )
          `)
          .eq('school_id', schoolId),
        overrideSemesterId
          ? db.from('semesters').select('id, name').eq('id', overrideSemesterId).limit(1).single()
          : db.from('semesters').select('id, name').eq('school_id', schoolId).eq('is_active', true).limit(1).single(),
      ]);

      const assignments: any[] = assignmentsRes.data ?? [];
      const activeSemId: string = activeRes.data?.id ?? '';
      const semName: string = activeRes.data?.name ?? '';

      // Filter to selected semester
      const active = assignments.filter((a: any) => a.semester_id === activeSemId);
      if (active.length === 0) {
        return { subjectIds: [], subjectNames: {}, rows: [], semesterName: semName };
      }

      const streamIds  = [...new Set(active.map((a: any) => a.stream_id as string))];
      const subjectIds = [...new Set(active.map((a: any) => a.subject_id as string))];

      const [studentsRes, marksRes] = await Promise.all([
        db.from('students')
          .select('id, stream_id')
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .in('stream_id', streamIds),
        db.from('marks')
          .select('student_id, subject_id, stream_id')
          .eq('school_id', schoolId)
          .eq('semester_id', activeSemId)
          .not('value', 'is', null),
      ]);

      const countByStream: Record<string, number> = {};
      ((studentsRes.data ?? []) as any[]).forEach((s: any) => {
        countByStream[s.stream_id] = (countByStream[s.stream_id] ?? 0) + 1;
      });

      // Group entered marks
      const enteredKey = (subj: string, stream: string) => `${subj}::${stream}`;
      const enteredSets: Record<string, Set<string>> = {};
      ((marksRes.data ?? []) as any[]).forEach((m: any) => {
        const k = enteredKey(m.subject_id, m.stream_id);
        if (!enteredSets[k]) enteredSets[k] = new Set();
        enteredSets[k].add(m.student_id);
      });

      const subjectNames: Record<string, string> = {};
      active.forEach((a: any) => {
        subjectNames[a.subject_id] = a.subjects?.name ?? a.subject_id;
      });

      // Build rows
      const streamMap: Record<string, MatrixRow> = {};
      active.forEach((a: any) => {
        if (!streamMap[a.stream_id]) {
          streamMap[a.stream_id] = {
            streamId: a.stream_id,
            streamName: a.streams?.name ?? a.stream_id,
            gradeName: a.streams?.grades?.name ?? '',
            cells: {},
          };
        }
        const total = countByStream[a.stream_id] ?? 0;
        const entered = enteredSets[enteredKey(a.subject_id, a.stream_id)]?.size ?? 0;
        streamMap[a.stream_id].cells[a.subject_id] = {
          assignmentId: a.id,
          entered,
          total,
          isLocked: a.is_locked ?? false,
          isComplete: total > 0 && entered >= total,
          windowOpen: a.semesters?.marks_window_open ?? true,
        };
      });

      // Stable subject ordering
      const orderedSubjects = subjectIds.sort((a, b) =>
        (subjectNames[a] ?? '').localeCompare(subjectNames[b] ?? ''),
      );

      return {
        subjectIds: orderedSubjects,
        subjectNames,
        rows: Object.values(streamMap).sort((a, b) =>
          a.gradeName.localeCompare(b.gradeName) || a.streamName.localeCompare(b.streamName),
        ),
        semesterName: semName,
      };
    },
  });
}

// ─── cell color ───────────────────────────────────────────────────────────────

function cellColor(cell: MatrixCell | undefined): string {
  if (!cell) return 'transparent';
  if (cell.isComplete) return Colors.semantic.success;
  if (!cell.windowOpen) return Colors.semantic.error;
  if (cell.entered === 0) return '#9CA3AF';
  const pct = cell.total > 0 ? cell.entered / cell.total : 0;
  if (pct >= 0.75) return Colors.semantic.warning;
  return Colors.semantic.info;
}

function cellBg(cell: MatrixCell | undefined): string {
  return (cellColor(cell) ?? '#9CA3AF') + '22';
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MarksMatrixScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useMarksMatrix(user?.schoolId ?? '', selectedSemesterId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetCell, setSheetCell] = useState<{
    cell: MatrixCell; subjectName: string; streamName: string;
  } | null>(null);

  const openCell = useCallback((cell: MatrixCell, subjectName: string, streamName: string) => {
    haptics.selection();
    setSheetCell({ cell, subjectName, streamName });
    setSheetVisible(true);
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load marks matrix" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const totalCells = (data?.rows.length ?? 0) * (data?.subjectIds.length ?? 0);
  const completedCells = data?.rows.reduce((acc, row) =>
    acc + Object.values(row.cells).filter((c) => c.isComplete).length, 0) ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Marks Matrix"
        subtitle={`${data?.semesterName ?? '—'} · ${completedCells}/${totalCells} complete`}
        showBack
      />
      <AcademicPeriodPicker
        schoolId={user?.schoolId ?? ''}
        semesterId={selectedSemesterId}
        onChangeSemester={setSelectedSemesterId}
      />

      {isLoading ? (
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={100} height={14} />
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} width={44} height={36} radius={Radius.sm} style={{ marginLeft: 6 }} />
              ))}
            </View>
          ))}
        </View>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="No assignments" description="No subject assignments found for the active semester." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}>
            {/* Column header */}
            <View style={[styles.colHeaderRow, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
              <View style={styles.streamLabelCell}>
                <ThemedText variant="label" color="muted" style={{ fontSize: 9 }}>STREAM</ThemedText>
              </View>
              {data.subjectIds.map((sId) => (
                <View key={sId} style={styles.subjectHeaderCell}>
                  <ThemedText
                    variant="label"
                    color="muted"
                    style={{ fontSize: 8, textAlign: 'center' }}
                    numberOfLines={3}
                  >
                    {(data.subjectNames[sId] ?? sId).toUpperCase()}
                  </ThemedText>
                </View>
              ))}
            </View>

            {/* Data rows */}
            {data.rows.map((row, idx) => (
              <View
                key={row.streamId}
                style={[
                  styles.dataRow,
                  {
                    backgroundColor: idx % 2 === 0 ? colors.background : colors.surface,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.streamLabelCell}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
                    {row.streamName}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted" style={{ fontSize: 10 }}>
                    {row.gradeName}
                  </ThemedText>
                </View>

                {data.subjectIds.map((sId) => {
                  const cell = row.cells[sId];
                  if (!cell) {
                    return (
                      <View key={sId} style={[styles.matrixCell, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                        <ThemedText variant="label" color="muted" style={{ fontSize: 10 }}>—</ThemedText>
                      </View>
                    );
                  }
                  const color = cellColor(cell);
                  const pct = cell.total > 0 ? Math.round((cell.entered / cell.total) * 100) : 0;
                  return (
                    <TouchableOpacity
                      key={sId}
                      onPress={() => openCell(cell, data.subjectNames[sId] ?? sId, row.streamName)}
                      style={[styles.matrixCell, { backgroundColor: cellBg(cell), borderColor: color + '60' }]}
                      activeOpacity={0.7}
                    >
                      {cell.isLocked ? (
                        <Ionicons name="lock-closed" size={12} color={color} />
                      ) : (
                        <ThemedText variant="label" style={{ color, fontWeight: '800', fontSize: 11 }}>
                          {pct}%
                        </ThemedText>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Legend */}
            <View style={[styles.legend, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
              {[
                { color: Colors.semantic.success, label: 'Complete' },
                { color: Colors.semantic.warning, label: '≥75%' },
                { color: Colors.semantic.info, label: 'In progress' },
                { color: '#9CA3AF', label: 'Not started' },
                { color: Colors.semantic.error, label: 'Closed' },
              ].map(({ color, label }) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <ThemedText variant="caption" color="muted" style={{ fontSize: 10 }}>{label}</ThemedText>
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Cell detail sheet */}
      <BottomSheet
        visible={sheetVisible && !!sheetCell}
        onClose={() => setSheetVisible(false)}
        title={sheetCell ? `${sheetCell.streamName} — ${sheetCell.subjectName}` : ''}
        snapHeight={320}
      >
        {sheetCell && (
          <View style={styles.sheetContent}>
            <View style={[styles.statRow, { backgroundColor: colors.surfaceSecondary, borderRadius: Radius.md }]}>
              <View style={styles.statItem}>
                <ThemedText variant="h3" style={{ color: cellColor(sheetCell.cell) }}>
                  {sheetCell.cell.total > 0
                    ? `${Math.round((sheetCell.cell.entered / sheetCell.cell.total) * 100)}%`
                    : '—'}
                </ThemedText>
                <ThemedText variant="caption" color="muted">Completion</ThemedText>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <ThemedText variant="h3">{sheetCell.cell.entered}</ThemedText>
                <ThemedText variant="caption" color="muted">Entered</ThemedText>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <ThemedText variant="h3">{sheetCell.cell.total}</ThemedText>
                <ThemedText variant="caption" color="muted">Students</ThemedText>
              </View>
            </View>

            {sheetCell.cell.isLocked && (
              <View style={[styles.infoBanner, { backgroundColor: Colors.semantic.warningLight }]}>
                <Ionicons name="lock-closed" size={14} color={Colors.semantic.warning} />
                <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: 8, flex: 1 }}>
                  Marks are locked. Unlock to allow corrections.
                </ThemedText>
              </View>
            )}

            {!sheetCell.cell.windowOpen && (
              <View style={[styles.infoBanner, { backgroundColor: Colors.semantic.errorLight }]}>
                <Ionicons name="alert-circle" size={14} color={Colors.semantic.error} />
                <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, marginLeft: 8, flex: 1 }}>
                  Marks window is closed for this semester.
                </ThemedText>
              </View>
            )}

            {sheetCell.cell.assignmentId && (
              <TouchableOpacity
                onPress={() => {
                  setSheetVisible(false);
                  haptics.light();
                  router.push({
                    pathname: '/(app)/(admin)/marks-unlock',
                    params: { assignmentId: sheetCell.cell.assignmentId! },
                  } as any);
                }}
                style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}
              >
                <Ionicons name="construct-outline" size={16} color="#fff" />
                <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                  {sheetCell.cell.isLocked ? 'Unlock Marks' : 'View / Correct Marks'}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const STREAM_LABEL_W = 110;
const CELL_W = 52;
const CELL_H = 44;

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
  skeletonWrap: { padding: Spacing.base, gap: 10 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
  },
  streamLabelCell: { width: STREAM_LABEL_W, paddingHorizontal: 12 },
  subjectHeaderCell: { width: CELL_W, alignItems: 'center', paddingHorizontal: 2 },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  matrixCell: {
    width: CELL_W - 4,
    height: CELL_H,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  sheetContent: { gap: 14 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 40 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    marginTop: 4,
  },
});
