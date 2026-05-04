import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Skeleton, EmptyState, ErrorState, ProgressBar, FastList, ScreenHeader } from '../../../components/ui';
import { Spacing, Radius, Typography } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const ASSESSMENT_TYPES = ['fa1', 'fa2', 'summative'] as const;
const TYPE_LABELS: Record<string, string> = { fa1: 'FA1', fa2: 'FA2', summative: 'Summative' };
const TYPE_MAX: Record<string, number> = { fa1: 100, fa2: 100, summative: 100 };

interface Assignment {
  subject_id: string;
  stream_id: string;
  semester_id: string;
  subjects: { name: string } | null;
  streams: { name: string; grades: { name: string } | null } | null;
}

function useMarksData(staffId: string | null, schoolId: string, selectedAssignment: Assignment | null) {
  return useQuery({
    queryKey: ['marks-entry', staffId, schoolId, selectedAssignment?.stream_id, selectedAssignment?.subject_id],
    enabled: !!staffId && !!schoolId && !!selectedAssignment,
    queryFn: async () => {
      const { stream_id, semester_id } = selectedAssignment!;

      const [studentsRes, marksRes, semRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', stream_id)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('marks')
          .select('student_id, subject_id, assessment_type, value, is_excused, is_locked')
          .eq('school_id', schoolId)
          .eq('stream_id', stream_id)
          .eq('semester_id', semester_id),
        supabase
          .from('semesters')
          .select('id, name, marks_open_date, marks_close_date')
          .eq('id', semester_id)
          .single(),
      ]);

      const marksMap: Record<string, Record<string, Record<string, { value: number | null; is_excused: boolean; is_locked: boolean }>>> = {};
      for (const m of (marksRes.data ?? []) as any[]) {
        marksMap[m.subject_id] = marksMap[m.subject_id] || {};
        marksMap[m.subject_id][m.student_id] = marksMap[m.subject_id][m.student_id] || {};
        marksMap[m.subject_id][m.student_id][m.assessment_type] = {
          value: m.value,
          is_excused: m.is_excused,
          is_locked: m.is_locked,
        };
      }

      const sem = semRes.data as any;
      const now = Date.now();
      const openMs = sem?.marks_open_date ? new Date(sem.marks_open_date).getTime() : null;
      const closeMs = sem?.marks_close_date ? new Date(sem.marks_close_date).getTime() : null;
      const windowOpen = openMs !== null && closeMs !== null && now >= openMs && now <= closeMs;
      const windowStatus = !openMs || !closeMs ? 'unset' : now < openMs ? 'pending' : now > closeMs ? 'closed' : 'open';

      return {
        students: studentsRes.data ?? [],
        marksMap,
        streamId: stream_id,
        semesterId: semester_id,
        semester: sem,
        windowOpen,
        windowStatus,
      };
    },
  });
}

function useAssignments(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['hrt-marks-assignments', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    queryFn: async () => {
      const { data: hrtAssignment } = await (supabase as any)
        .from('hrt_assignments')
        .select('stream_id, semester_id')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId)
        .limit(1)
        .single();
      if (!hrtAssignment) return [] as Assignment[];
      const { stream_id, semester_id } = hrtAssignment as any;

      const { data } = await (supabase as any)
        .from('subject_teacher_assignments')
        .select('subject_id, stream_id, semester_id, subjects(name), streams(name, grades(name))')
        .eq('stream_id', stream_id)
        .eq('semester_id', semester_id)
        .eq('school_id', schoolId);
      return (data ?? []) as unknown as Assignment[];
    },
  });
}

export default function MarksScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: assignments, isLoading: assignsLoading, isError: assignsError, refetch: refetchAssigns } =
    useAssignments(user?.staffId ?? null, user?.schoolId ?? '');

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedType, setSelectedType] = useState<string>('fa1');
  const [localMarks, setLocalMarks] = useState<Record<string, string>>({});

  const currentAssignment = assignments?.[selectedIdx] ?? null;

  const { data, isLoading, isError, refetch } = useMarksData(
    user?.staffId ?? null,
    user?.schoolId ?? '',
    currentAssignment,
  );

  const subjectId = currentAssignment?.subject_id;
  const subjectName = currentAssignment?.subjects?.name ?? '—';
  const streamName = currentAssignment?.streams?.name ?? '—';
  const gradeName = currentAssignment?.streams?.grades?.name ?? '';

  const getStoredEntry = (studentId: string) =>
    (data?.marksMap as any)?.[subjectId ?? '']?.[studentId]?.[selectedType];

  const getStoredMark = (studentId: string) => {
    const e = getStoredEntry(studentId);
    return e?.value ?? null;
  };

  const entriesCount = ((data?.students ?? []) as any[]).filter((s: any) => getStoredMark(s.id) !== null).length;
  const totalStudents = data?.students?.length ?? 0;
  const readOnly = !data?.windowOpen;

  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const saveMark = useMutation({
    mutationFn: async ({ studentId, value }: { studentId: string; value: number | null }) => {
      const prevEntry = getStoredEntry(studentId);
      const prevValue = prevEntry?.value ?? null;

      const { data: upserted, error } = await (supabase as any)
        .from('marks')
        .upsert({
          school_id: user?.schoolId,
          student_id: studentId,
          subject_id: subjectId,
          stream_id: data?.streamId,
          semester_id: data?.semesterId,
          assessment_type: selectedType,
          value,
          entered_by: user?.staffId,
        } as any, { onConflict: 'student_id,subject_id,semester_id,assessment_type' })
        .select('id')
        .single();

      if (error) throw error;

      // Audit log — edit vs first entry
      (supabase as any).from('audit_logs').insert({
        school_id: user?.schoolId,
        event_type: prevValue === null ? 'mark_entered' : 'mark_edited',
        actor_id: user?.staffId,
        student_id: studentId,
        data: {
          mark_id: (upserted as any)?.id,
          subject_id: subjectId,
          assessment_type: selectedType,
          old_value: prevValue,
          new_value: value,
        },
      } as any).then(() => {});

      // Deviation warning: >25 pts vs class average
      if (value !== null && data?.students?.length) {
        const others = (data.students as any[])
          .filter((s: any) => s.id !== studentId)
          .map((s: any) => getStoredMark(s.id))
          .filter((v) => v !== null) as number[];
        if (others.length >= 3) {
          const avg = others.reduce((a, b) => a + b, 0) / others.length;
          if (Math.abs(value - avg) >= 25) {
            (supabase as any).from('mark_notes').insert({
              school_id: user?.schoolId,
              mark_id: (upserted as any)?.id,
              note_type: 'deviation_warning',
              note_text: `Mark of ${value} deviates ${Math.abs(value - avg).toFixed(1)} pts from class average (${avg.toFixed(1)}).`,
              created_by: user?.staffId,
            } as any).then(() => {});
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marks-entry'] });
    },
    onError: () => {
      haptics.error();
    },
  });

  const handleSave = useCallback((studentId: string) => {
    if (readOnly) return;
    const raw = localMarks[studentId];
    if (raw === undefined) return;
    const parsed = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && (isNaN(parsed!) || parsed! < 0 || parsed! > TYPE_MAX[selectedType])) {
      haptics.error();
      return;
    }
    haptics.light();
    saveMark.mutate({ studentId, value: parsed });
    setLocalMarks(prev => { const n = { ...prev }; delete n[studentId]; return n; });
  }, [localMarks, selectedType, readOnly, saveMark]);

  const focusNext = useCallback((currentStudentId: string) => {
    const students = (data?.students ?? []) as any[];
    const idx = students.findIndex(s => s.id === currentStudentId);
    const next = students[idx + 1];
    if (next) inputRefs.current[next.id]?.focus();
  }, [data?.students]);

  // ── Error / empty early returns ────────────────────────────
  if (assignsError || isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Could not load marks"
          description="Check your connection and try again."
          onRetry={() => { refetchAssigns(); refetch(); }}
        />
      </SafeAreaView>
    );
  }

  if (!assignsLoading && (!assignments || assignments.length === 0)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <EmptyState
          title="No subject assignments"
          description="You are not yet assigned as a subject teacher for any class. Contact Admin."
        />
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Marks Entry"
        subtitle={[gradeName, streamName, subjectName].filter(Boolean).join(' · ')}
      />

      {/* Window status banner */}
      {data && data.windowStatus !== 'open' && (
        <View style={[
          styles.windowBanner,
          {
            backgroundColor: data.windowStatus === 'closed'
              ? Colors.semantic.errorLight
              : data.windowStatus === 'pending'
              ? Colors.semantic.warningLight
              : colors.surfaceSecondary,
          },
        ]}>
          <Ionicons
            name={data.windowStatus === 'closed' ? 'lock-closed' : 'time-outline'}
            size={14}
            color={
              data.windowStatus === 'closed' ? Colors.semantic.error
              : data.windowStatus === 'pending' ? Colors.semantic.warning
              : colors.textMuted
            }
          />
          <ThemedText variant="bodySm" style={{
            marginLeft: Spacing.sm,
            color: data.windowStatus === 'closed' ? Colors.semantic.error
              : data.windowStatus === 'pending' ? Colors.semantic.warning
              : colors.textMuted,
          }}>
            {data.windowStatus === 'closed' && 'Marks window closed. Entries are read-only.'}
            {data.windowStatus === 'pending' && `Marks window opens ${data.semester?.marks_open_date ? new Date(data.semester.marks_open_date).toLocaleDateString() : 'soon'}.`}
            {data.windowStatus === 'unset' && 'Marks window not yet configured by Admin.'}
          </ThemedText>
        </View>
      )}

      {/* Subject/stream tabs */}
      {!assignsLoading && (assignments ?? []).length > 1 && (
        <View style={[styles.subjectTabs, { borderBottomColor: colors.border }]}>
          <FastList
            horizontal
            data={assignments ?? []}
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => { setSelectedIdx(index); setLocalMarks({}); }}
                style={[
                  styles.subjectTab,
                  {
                    backgroundColor: selectedIdx === index ? colors.brand.primary : colors.surfaceSecondary,
                    borderColor: selectedIdx === index ? colors.brand.primary : colors.border,
                  },
                ]}
              >
                <ThemedText
                  variant="bodySm"
                  style={{ color: selectedIdx === index ? '#fff' : colors.textSecondary, fontWeight: '600' }}
                >
                  {item.subjects?.name} · {item.streams?.name}
                </ThemedText>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Assessment type selector */}
      <View style={[styles.typeRow, { backgroundColor: colors.surfaceSecondary }]}>
        {ASSESSMENT_TYPES.map(type => (
          <TouchableOpacity
            key={type}
            onPress={() => { setSelectedType(type); setLocalMarks({}); }}
            style={[
              styles.typeBtn,
              selectedType === type && { backgroundColor: colors.background, borderRadius: Radius.md },
            ]}
          >
            <ThemedText
              variant="bodySm"
              style={{
                fontWeight: selectedType === type ? '700' : '400',
                color: selectedType === type ? colors.brand.primary : colors.textMuted,
              }}
            >
              {TYPE_LABELS[type]}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Progress */}
      <View style={[styles.progressBar, { borderBottomColor: colors.border }]}>
        <ThemedText variant="bodySm" color="muted">{entriesCount} / {totalStudents} entered</ThemedText>
        <ProgressBar value={entriesCount} max={totalStudents || 1} color={colors.brand.primary} style={{ flex: 1, marginHorizontal: Spacing.sm }} />
        <ThemedText variant="bodySm" color="muted">/{TYPE_MAX[selectedType]}</ThemedText>
      </View>

      {/* Class average banner */}
      {entriesCount > 0 && (
        <ClassAvgBanner students={data?.students ?? []} getStoredMark={(sid) => getStoredMark(sid)} colors={colors} />
      )}

      {/* Student marks list */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {(isLoading || assignsLoading) ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={36} height={36} radius={18} />
                <Skeleton width="45%" height={14} style={{ marginLeft: Spacing.md }} />
                <Skeleton width={60} height={40} radius={Radius.md} style={{ marginLeft: 'auto' }} />
              </View>
            ))}
          </View>
        ) : totalStudents === 0 ? (
          <EmptyState
            title="No students in class"
            description="This class has no active students."
          />
        ) : (
          <FastList
            data={data?.students ?? []}
            keyExtractor={item => (item as any).id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const s = item as any;
              const entry = getStoredEntry(s.id);
              const stored = entry?.value ?? null;
              const isExcused = entry?.is_excused ?? false;
              const isLocked = entry?.is_locked ?? false;
              const localVal = localMarks[s.id];
              const displayVal = localVal !== undefined ? localVal : (stored !== null ? String(stored) : '');
              const isDirty = localVal !== undefined;
              const isLast = index === (data?.students?.length ?? 0) - 1;
              const rowReadOnly = readOnly || isLocked;

              return (
                <View style={[styles.markRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.markRowLeft}>
                    <ThemedText variant="caption" color="muted" style={styles.rowNum}>{index + 1}</ThemedText>
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="body" style={{ fontWeight: '600' }}>{s.full_name}</ThemedText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ThemedText variant="caption" color="muted">{s.student_number}</ThemedText>
                        {isExcused && (
                          <View style={[styles.naBadge, { backgroundColor: colors.brand.primary + '18' }]}>
                            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontSize: 10, fontWeight: '700' }}>N/A</ThemedText>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={styles.markInputWrap}>
                    <TextInput
                      ref={r => { inputRefs.current[s.id] = r; }}
                      value={displayVal}
                      editable={!rowReadOnly}
                      onChangeText={v => setLocalMarks(prev => ({ ...prev, [s.id]: v }))}
                      onBlur={() => handleSave(s.id)}
                      onSubmitEditing={() => { handleSave(s.id); focusNext(s.id); }}
                      placeholder={isExcused ? 'N/A' : '—'}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      returnKeyType={isLast ? 'done' : 'next'}
                      blurOnSubmit={isLast}
                      maxLength={5}
                      style={[
                        styles.markInput,
                        Typography.h4,
                        {
                          color: rowReadOnly ? colors.textMuted : colors.textPrimary,
                          backgroundColor: rowReadOnly
                            ? colors.surfaceSecondary
                            : isDirty ? colors.brand.primary + '12' : colors.surfaceSecondary,
                          borderColor: isDirty ? colors.brand.primary : colors.border,
                        },
                      ]}
                    />
                    {isDirty && !rowReadOnly && (
                      <TouchableOpacity onPress={() => handleSave(s.id)} style={styles.saveDot}>
                        <Ionicons name="checkmark" size={14} color={colors.brand.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ClassAvgBanner({ students, getStoredMark, colors }: { students: any[]; getStoredMark: (id: string) => number | null; colors: any }) {
  const values = students.map(s => getStoredMark(s.id)).filter(v => v !== null) as number[];
  if (values.length === 0) return null;
  const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  const max = Math.max(...values).toFixed(0);
  const min = Math.min(...values).toFixed(0);

  return (
    <View style={[styles.avgBanner, { backgroundColor: colors.brand.primary + '10', borderBottomColor: colors.border }]}>
      <Ionicons name="analytics-outline" size={16} color={colors.brand.primary} />
      <ThemedText variant="bodySm" style={{ color: colors.brand.primary, marginLeft: 6 }}>
        Class avg: <ThemedText variant="bodySm" style={{ fontWeight: '700', color: colors.brand.primary }}>{avg}</ThemedText>
        {'  '}High: {max}{'  '}Low: {min}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  windowBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  subjectTabs: { paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  subjectTab: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  typeRow: { flexDirection: 'row', margin: Spacing.base, borderRadius: Radius.md, padding: 4 },
  typeBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  progressBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  avgBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  skeletonList: { padding: Spacing.base, gap: Spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  list: { paddingBottom: 40 },
  markRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth },
  markRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowNum: { width: 20, textAlign: 'center' },
  markInputWrap: { position: 'relative' },
  markInput: { width: 72, height: 48, borderRadius: Radius.md, borderWidth: 1.5, textAlign: 'center', paddingHorizontal: 4 },
  saveDot: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  naBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
});
