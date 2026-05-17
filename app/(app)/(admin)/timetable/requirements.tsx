/**
 * Subject Period Requirements
 * Matrix: grades (tabs) → subjects × streams, cell = periods/week
 * Tap cell → edit sheet (periods, double period options, room preference)
 */
import React, { useState, useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, BottomSheet, FormField, Button,
  Skeleton, EmptyState, ErrorState, ToggleRow, FilterChipRow,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useSubjectRequirements, useUpsertSubjectRequirement, useDeleteSubjectRequirement,
  type SubjectRequirement, type RoomType,
} from '../../../../hooks/useTimetableBuilder';

// ── Types ────────────────────────────────────────────────────

interface Grade { id: string; name: string; }
interface Stream { id: string; name: string; grade_id: string; }
interface Subject { id: string; name: string; department: string | null; }

const ROOM_TYPE_OPTIONS: Array<{ value: RoomType | ''; label: string }> = [
  { value: '', label: 'Any room' },
  { value: 'classroom',    label: 'Classroom' },
  { value: 'lab',          label: 'Lab' },
  { value: 'computer_lab', label: 'Computer Lab' },
  { value: 'hall',         label: 'Hall' },
  { value: 'library',      label: 'Library' },
  { value: 'sports',       label: 'Sports' },
];

// ── Data ─────────────────────────────────────────────────────

function useStructure(schoolId: string) {
  return useQuery<{ grades: Grade[]; streams: Stream[]; subjects: Subject[] }>({
    queryKey: ['ttb-structure', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const [gRes, stRes, subRes] = await Promise.all([
        db.from('grades').select('id, name').eq('school_id', schoolId).order('name'),
        db.from('streams').select('id, name, grade_id').eq('school_id', schoolId).order('name'),
        db.from('subjects').select('id, name, department').eq('school_id', schoolId).order('name'),
      ]);
      return {
        grades:   (gRes.data  ?? []) as Grade[],
        streams:  (stRes.data ?? []) as Stream[],
        subjects: (subRes.data ?? []) as Subject[],
      };
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────

interface ReqForm {
  periods_per_week: string;
  double_period_allowed: boolean;
  min_double_periods: string;
  max_double_periods: string;
  preferred_room_type: RoomType | '';
  priority: string;
}

const emptyForm = (): ReqForm => ({
  periods_per_week: '5',
  double_period_allowed: false,
  min_double_periods: '0',
  max_double_periods: '0',
  preferred_room_type: '',
  priority: '5',
});

function reqToForm(r: SubjectRequirement): ReqForm {
  return {
    periods_per_week:     String(r.periods_per_week),
    double_period_allowed: r.double_period_allowed,
    min_double_periods:   String(r.min_double_periods),
    max_double_periods:   String(r.max_double_periods),
    preferred_room_type:  (r.preferred_room_type ?? '') as RoomType | '',
    priority:             String(r.priority),
  };
}

// ── Main ─────────────────────────────────────────────────────

export default function RequirementsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const structure = useStructure(sid);
  const reqsQuery = useSubjectRequirements(sid);
  const upsert    = useUpsertSubjectRequirement();
  const remove    = useDeleteSubjectRequirement();

  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<'grade' | 'stream'>('grade');

  // Sheet state
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<SubjectRequirement | null>(null);
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editScopeId, setEditScopeId] = useState('');
  const [form, setForm] = useState<ReqForm>(emptyForm());

  // ── Derived ──────────────────────────────────────────────

  const grades   = structure.data?.grades  ?? [];
  const streams  = structure.data?.streams ?? [];
  const subjects = structure.data?.subjects ?? [];
  const reqs     = reqsQuery.data ?? [];

  const activeGradeId = selectedGradeId ?? grades[0]?.id ?? null;

  const gradeChips = useMemo(
    () => grades.map((g) => ({ value: g.id, label: g.name })),
    [grades],
  );

  const streamsForGrade = useMemo(
    () => streams.filter((s) => s.grade_id === activeGradeId),
    [streams, activeGradeId],
  );

  // Build req map: key = `${scopeId}:${subjectId}`
  const reqMap = useMemo(() => {
    const m: Record<string, SubjectRequirement> = {};
    for (const r of reqs) {
      const scopeId = r.stream_id ?? r.grade_id ?? '';
      m[`${scopeId}:${r.subject_id}`] = r;
    }
    return m;
  }, [reqs]);

  // Column headers: grade or streams within grade
  const columns: Array<{ id: string; label: string; isGrade: boolean }> = useMemo(() => {
    if (scopeMode === 'grade') {
      return activeGradeId ? [{ id: activeGradeId, label: 'Grade default', isGrade: true }] : [];
    }
    return streamsForGrade.map((s) => ({ id: s.id, label: s.name, isGrade: false }));
  }, [scopeMode, activeGradeId, streamsForGrade]);

  // ── Handlers ─────────────────────────────────────────────

  function openEdit(subjectId: string, scopeId: string, isGrade: boolean) {
    haptics('light');
    const existing = reqMap[`${scopeId}:${subjectId}`];
    setEditing(existing ?? null);
    setEditSubjectId(subjectId);
    setEditScopeId(scopeId);
    setForm(existing ? reqToForm(existing) : emptyForm());
    setSheet(true);
  }

  async function save() {
    const isGrade = scopeMode === 'grade';
    const payload: Omit<SubjectRequirement, 'id'> = {
      school_id:            sid,
      grade_id:             isGrade ? editScopeId : null,
      stream_id:            isGrade ? null : editScopeId,
      subject_id:           editSubjectId,
      periods_per_week:     Math.max(1, parseInt(form.periods_per_week) || 5),
      double_period_allowed: form.double_period_allowed,
      min_double_periods:   parseInt(form.min_double_periods) || 0,
      max_double_periods:   parseInt(form.max_double_periods) || 0,
      preferred_room_type:  form.preferred_room_type || null,
      requires_specific_room_id: null,
      priority:             Math.min(10, Math.max(1, parseInt(form.priority) || 5)),
    };
    try {
      await upsert.mutateAsync(payload);
      haptics('success');
      setSheet(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save');
    }
  }

  async function deleteReq() {
    if (!editing) { setSheet(false); return; }
    Alert.alert('Remove requirement', 'Remove this period requirement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync({ id: editing.id, school_id: sid });
            haptics('success');
            setSheet(false);
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to delete');
          }
        },
      },
    ]);
  }

  // ── Render helpers ────────────────────────────────────────

  const CELL_W = 72;
  const ROW_H  = 48;
  const COL_H  = 56;
  const LABEL_W = 140;

  function cellColor(ppw: number) {
    if (ppw <= 2) return colors.primary + '22';
    if (ppw <= 4) return colors.primary + '44';
    return colors.primary + '77';
  }

  // ── Loading / error ───────────────────────────────────────

  if (structure.isLoading || reqsQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Subject Requirements" />
        <View style={{ padding: Spacing.lg }}>
          {[1,2,3,4].map((i) => <Skeleton key={i} height={48} style={{ marginBottom: 8 }} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (structure.isError || reqsQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Subject Requirements" />
        <ErrorState message="Failed to load data" onRetry={() => { structure.refetch(); reqsQuery.refetch(); }} />
      </SafeAreaView>
    );
  }

  if (subjects.length === 0 || grades.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Subject Requirements" />
        <EmptyState
          icon="book-outline"
          title="No subjects or grades found"
          description="Set up your school structure first"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Subject Requirements" subtitle="Periods per week per subject" />

      {/* Grade tabs */}
      <FilterChipRow
        options={gradeChips}
        selected={activeGradeId ?? ''}
        onSelect={(v) => setSelectedGradeId(v)}
        style={{ paddingHorizontal: Spacing.md, marginBottom: 4 }}
      />

      {/* Scope toggle: grade default vs per-stream */}
      <View style={[styles.scopeRow, { borderBottomColor: colors.border }]}>
        {(['grade', 'stream'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => { haptics('light'); setScopeMode(s); }}
            style={[styles.scopeBtn, scopeMode === s && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <ThemedText style={[styles.scopeLabel, scopeMode === s && { color: colors.primary }]}>
              {s === 'grade' ? 'Grade default' : 'Per stream'}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Matrix */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <ScrollView>
          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={[styles.subjectLabel, { width: LABEL_W, backgroundColor: colors.surface }]}>
              <ThemedText style={styles.headerText}>Subject</ThemedText>
            </View>
            {columns.map((col) => (
              <View
                key={col.id}
                style={[styles.colHeader, { width: CELL_W, height: COL_H, backgroundColor: colors.surface }]}
              >
                <ThemedText style={styles.colHeaderText} numberOfLines={2}>{col.label}</ThemedText>
              </View>
            ))}
          </View>

          {/* Subject rows */}
          {subjects.map((subject) => (
            <View key={subject.id} style={[styles.row, { height: ROW_H, borderBottomColor: colors.border }]}>
              <View style={[styles.subjectLabel, { width: LABEL_W }]}>
                <ThemedText style={styles.subjectName} numberOfLines={1}>{subject.name}</ThemedText>
                {subject.department ? (
                  <ThemedText style={[styles.subjectDept, { color: colors.textSecondary }]} numberOfLines={1}>
                    {subject.department}
                  </ThemedText>
                ) : null}
              </View>

              {columns.map((col) => {
                const req = reqMap[`${col.id}:${subject.id}`];
                return (
                  <TouchableOpacity
                    key={col.id}
                    onPress={() => openEdit(subject.id, col.id, col.isGrade)}
                    style={[
                      styles.cell,
                      { width: CELL_W, height: ROW_H, borderRightColor: colors.border },
                      req ? { backgroundColor: cellColor(req.periods_per_week) } : null,
                    ]}
                  >
                    {req ? (
                      <>
                        <ThemedText style={[styles.cellValue, { color: colors.primary }]}>
                          {req.periods_per_week}
                        </ThemedText>
                        {req.double_period_allowed ? (
                          <ThemedText style={[styles.cellSub, { color: colors.textSecondary }]}>2x</ThemedText>
                        ) : null}
                      </>
                    ) : (
                      <Ionicons name="add" size={16} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </ScrollView>

      {/* Edit Sheet */}
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Period Requirement">
        <ScrollView style={{ padding: Spacing.md }}>
          <FormField
            label="Periods per week"
            value={form.periods_per_week}
            onChangeText={(v) => setForm((f) => ({ ...f, periods_per_week: v }))}
            keyboardType="number-pad"
            placeholder="5"
          />

          <ToggleRow
            label="Allow double periods"
            value={form.double_period_allowed}
            onValueChange={(v) => setForm((f) => ({ ...f, double_period_allowed: v }))}
          />

          {form.double_period_allowed ? (
            <View style={styles.doubleRow}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <FormField
                  label="Min doubles"
                  value={form.min_double_periods}
                  onChangeText={(v) => setForm((f) => ({ ...f, min_double_periods: v }))}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Max doubles"
                  value={form.max_double_periods}
                  onChangeText={(v) => setForm((f) => ({ ...f, max_double_periods: v }))}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            </View>
          ) : null}

          <ThemedText style={[styles.fieldLabel, { color: colors.textSecondary }]}>Preferred room type</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
            <View style={styles.chipRow}>
              {ROOM_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { haptics('light'); setForm((f) => ({ ...f, preferred_room_type: opt.value as any })); }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: form.preferred_room_type === opt.value ? colors.primary : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ThemedText style={{ color: form.preferred_room_type === opt.value ? '#fff' : colors.text, fontSize: 13 }}>
                    {opt.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <FormField
            label="Priority (1–10)"
            value={form.priority}
            onChangeText={(v) => setForm((f) => ({ ...f, priority: v }))}
            keyboardType="number-pad"
            placeholder="5"
          />

          <View style={styles.actions}>
            {editing ? (
              <Button
                label="Remove"
                variant="destructive"
                onPress={deleteReq}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
            ) : null}
            <Button
              label="Save"
              onPress={save}
              loading={upsert.isPending}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scopeRow:  { flexDirection: 'row', borderBottomWidth: 1 },
  scopeBtn:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  scopeLabel: { fontSize: 14, fontWeight: '500' },
  headerRow: { flexDirection: 'row' },
  colHeader: { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: 1 },
  colHeaderText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  row:       { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  subjectLabel: { justifyContent: 'center', paddingHorizontal: Spacing.sm },
  subjectName:  { fontSize: 13, fontWeight: '500' },
  subjectDept:  { fontSize: 11, marginTop: 1 },
  headerText:   { fontSize: 12, fontWeight: '600' },
  cell: {
    justifyContent: 'center', alignItems: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  cellValue: { fontSize: 15, fontWeight: '700' },
  cellSub:   { fontSize: 10, marginTop: 1 },
  doubleRow: { flexDirection: 'row' },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: Spacing.xs },
  chipRow:    { flexDirection: 'row', gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.sm, borderWidth: 1, marginRight: Spacing.xs,
  },
  actions: { flexDirection: 'row', marginTop: Spacing.lg, marginBottom: Spacing.xl },
});
