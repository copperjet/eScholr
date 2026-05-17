/**
 * Biweekly Marks Entry — subject teacher
 * Single mark per student under the 'biweekly' assessment_type.
 * Reachable from marks-entry header. Reads max_marks from the biweekly
 * assessment_template (default 20). Stored in the existing marks table
 * so the standard total calculation can include it when the template
 * weight is > 0.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import { useUpdateMark } from '../../../hooks/useMarks';
import { useAssessmentTemplates } from '../../../hooks/useAssessmentConfig';

interface Row {
  studentId: string;
  fullName: string;
  studentNumber: string;
  photoUrl: string | null;
  current: number | null;
  markId: string | null;
  isLocked: boolean;
  isExcused: boolean;
}

function useBiweekly(
  assignmentId: string,
  schoolId: string,
) {
  return useQuery<{ rows: Row[]; assignment: { subject_id: string; stream_id: string; semester_id: string; subjectName: string; streamName: string; semesterName: string; isWindowOpen: boolean } | null }>({
    queryKey: ['biweekly-entry', assignmentId, schoolId],
    enabled: !!assignmentId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data: a } = await db
        .from('subject_teacher_assignments')
        .select(`id, subject_id, stream_id, semester_id,
                 subjects ( name ), streams ( name ), semesters ( name, marks_window_open )`)
        .eq('id', assignmentId)
        .eq('school_id', schoolId)
        .single();
      if (!a) return { rows: [], assignment: null };

      const [stRes, mkRes] = await Promise.all([
        db.from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', a.stream_id)
          .eq('status', 'active')
          .order('full_name'),
        db.from('marks')
          .select('id, student_id, value, is_excused, is_locked')
          .eq('school_id', schoolId)
          .eq('subject_id', a.subject_id)
          .eq('stream_id', a.stream_id)
          .eq('semester_id', a.semester_id)
          .eq('assessment_type', 'biweekly'),
      ]);

      const byStudent: Record<string, any> = {};
      ((mkRes.data ?? []) as any[]).forEach((m: any) => { byStudent[m.student_id] = m; });

      const rows: Row[] = ((stRes.data ?? []) as any[]).map((s: any) => {
        const m = byStudent[s.id];
        return {
          studentId:     s.id,
          fullName:      s.full_name,
          studentNumber: s.student_number,
          photoUrl:      s.photo_url ?? null,
          current:       m?.value ?? null,
          markId:        m?.id ?? null,
          isLocked:      !!m?.is_locked,
          isExcused:     !!m?.is_excused,
        };
      });

      return {
        rows,
        assignment: {
          subject_id:   a.subject_id,
          stream_id:    a.stream_id,
          semester_id:  a.semester_id,
          subjectName:  a.subjects?.name  ?? '—',
          streamName:   a.streams?.name   ?? '—',
          semesterName: a.semesters?.name ?? '—',
          isWindowOpen: a.semesters?.marks_window_open ?? true,
        },
      };
    },
  });
}

export default function BiweeklyEntryScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();

  const { data, isLoading, isError, refetch } = useBiweekly(assignmentId ?? '', schoolId);
  const rows = data?.rows ?? [];
  const assignment = data?.assignment;

  const { data: templates = [] } = useAssessmentTemplates(schoolId);
  const biweekly = useMemo(() => templates.find((t) => t.code === 'biweekly') ?? null, [templates]);
  const maxMarks = biweekly?.max_marks ?? 20;

  const updateMark = useUpdateMark(schoolId, assignmentId ?? undefined);
  const [local, setLocal] = useState<Record<string, string>>({});

  const handleBlur = useCallback(async (row: Row) => {
    if (!assignment) return;
    const raw = local[row.studentId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') return;
    let num = parseFloat(trimmed);
    if (isNaN(num)) {
      setLocal((p) => { const c = { ...p }; delete c[row.studentId]; return c; });
      return;
    }
    if (num < 0)        num = 0;
    if (num > maxMarks) num = maxMarks;
    try {
      await updateMark.mutateAsync({
        studentId:      row.studentId,
        subjectId:      assignment.subject_id,
        streamId:       assignment.stream_id,
        semesterId:     assignment.semester_id,
        assessmentType: 'biweekly',
        value:          num,
        enteredBy:      user!.staffId!,
        oldValue:       row.current,
        markId:         row.markId ?? undefined,
      });
      haptics.light();
      refetch();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    }
  }, [local, assignment, maxMarks, updateMark, user, refetch]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Biweekly" showBack />
        <ErrorState title="Could not load" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={assignment ? `${assignment.subjectName} · Biweekly` : 'Biweekly'}
        subtitle={assignment ? `${assignment.streamName} · ${assignment.semesterName} · /${maxMarks}` : undefined}
        showBack
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!biweekly ? (
          <EmptyState
            title="Biweekly disabled"
            description="Ask the admin to enable a 'biweekly' assessment in Assessment Config."
            icon="time-outline"
          />
        ) : isLoading ? (
          <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={64} radius={Radius.lg} />)}
          </View>
        ) : rows.length === 0 ? (
          <EmptyState title="No students" description="No active students in this stream." />
        ) : (
          <FastList
            data={rows}
            keyExtractor={(r) => r.studentId}
            contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm }}
            renderItem={({ item }) => {
              const editable = (assignment?.isWindowOpen ?? true) && !item.isLocked && !item.isExcused;
              const value = local[item.studentId] !== undefined
                ? local[item.studentId]
                : item.current !== null ? String(item.current) : '';
              return (
                <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
                  <Avatar name={item.fullName} photoUrl={item.photoUrl} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>{item.fullName}</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: colors.textMuted }}>{item.studentNumber}</ThemedText>
                  </View>
                  <TextInput
                    value={value}
                    onChangeText={(t) => {
                      if (!editable) return;
                      setLocal((p) => ({ ...p, [item.studentId]: t.replace(/[^0-9.]/g, '') }));
                    }}
                    onBlur={() => editable && handleBlur(item)}
                    placeholder={item.isExcused ? 'N/A' : '—'}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    editable={editable}
                    style={[styles.input, {
                      color: colors.textPrimary,
                      backgroundColor: editable ? colors.surfaceSecondary : colors.border,
                      borderColor: colors.border,
                    }]}
                  />
                  <ThemedText style={{ marginLeft: 6, color: colors.textMuted, fontSize: 14 }}>/{maxMarks}</ThemedText>
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, fontSize: 15,
    width: 70, textAlign: 'right',
  },
});
