/**
 * Subject Teacher Remarks
 * One free-text remark per student per subject per semester.
 * Stored in report_subject_remarks (matched to the student's draft report).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, TextInput, KeyboardAvoidingView, Platform, Alert, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const MAX = 400;

interface Row {
  studentId: string;
  fullName: string;
  studentNumber: string;
  photoUrl: string | null;
  reportId: string | null;
  remark: string;
}

function useRemarkData(
  assignmentId: string,
  schoolId: string,
) {
  return useQuery<{ rows: Row[]; subjectId: string; subjectName: string; streamName: string; semesterName: string }>({
    queryKey: ['subject-remarks', assignmentId, schoolId],
    enabled: !!assignmentId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data: a } = await db
        .from('subject_teacher_assignments')
        .select(`id, subject_id, stream_id, semester_id,
                 subjects ( name ),
                 streams  ( name ),
                 semesters( name )`)
        .eq('id', assignmentId)
        .eq('school_id', schoolId)
        .single();
      if (!a) return { rows: [], subjectId: '', subjectName: '—', streamName: '—', semesterName: '—' };

      const [stRes, repRes] = await Promise.all([
        db.from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', a.stream_id)
          .eq('status', 'active')
          .order('full_name'),
        db.from('reports')
          .select('id, student_id')
          .eq('school_id', schoolId)
          .eq('semester_id', a.semester_id),
      ]);

      const reportByStudent: Record<string, string> = {};
      ((repRes.data ?? []) as any[]).forEach((r: any) => { reportByStudent[r.student_id] = r.id; });

      const reportIds = Object.values(reportByStudent);
      const remarkByReport: Record<string, string> = {};
      if (reportIds.length > 0) {
        const { data: remarks } = await db
          .from('report_subject_remarks')
          .select('report_id, remark')
          .eq('school_id', schoolId)
          .eq('subject_id', a.subject_id)
          .in('report_id', reportIds);
        ((remarks ?? []) as any[]).forEach((r: any) => { remarkByReport[r.report_id] = r.remark; });
      }

      const rows: Row[] = ((stRes.data ?? []) as any[]).map((s: any) => {
        const reportId = reportByStudent[s.id] ?? null;
        return {
          studentId:     s.id,
          fullName:      s.full_name,
          studentNumber: s.student_number,
          photoUrl:      s.photo_url ?? null,
          reportId,
          remark:        (reportId && remarkByReport[reportId]) ?? '',
        };
      });

      return {
        rows,
        subjectId:    a.subject_id,
        subjectName:  a.subjects?.name  ?? '—',
        streamName:   a.streams?.name   ?? '—',
        semesterName: a.semesters?.name ?? '—',
      };
    },
  });
}

export default function SubjectRemarksScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const schoolId = user?.schoolId ?? '';
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useRemarkData(assignmentId ?? '', schoolId);
  const rows = data?.rows ?? [];

  const [local, setLocal] = useState<Record<string, string>>({});
  const merged = useMemo(() => {
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.studentId] = local[r.studentId] ?? r.remark; });
    return m;
  }, [rows, local]);

  const save = useMutation({
    mutationFn: async ({ row, value }: { row: Row; value: string }) => {
      if (!row.reportId) {
        throw new Error('Report not initialized for this student. Ask the admin to initialize reports for this semester.');
      }
      const db = supabase as any;
      if (value.trim().length === 0) {
        await db.from('report_subject_remarks')
          .delete()
          .eq('report_id', row.reportId)
          .eq('subject_id', data!.subjectId)
          .eq('school_id', schoolId);
      } else {
        await db.from('report_subject_remarks').upsert({
          school_id:  schoolId,
          report_id:  row.reportId,
          subject_id: data!.subjectId,
          remark:     value,
          entered_by: user!.staffId!,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'report_id,subject_id' });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subject-remarks', assignmentId, schoolId] }),
  });

  const handleBlur = useCallback((row: Row) => {
    const v = (local[row.studentId] ?? row.remark).trim();
    if (v === row.remark.trim()) return;
    save.mutate({ row, value: v }, {
      onError: (e: any) => {
        haptics.error();
        Alert.alert('Could not save', e?.message ?? 'Try again.');
      },
      onSuccess: () => haptics.light(),
    });
  }, [local, save]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Subject Remarks" showBack />
        <ErrorState title="Could not load" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={data?.subjectName ?? 'Subject Remarks'}
        subtitle={data ? `${data.streamName} · ${data.semesterName}` : undefined}
        showBack
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isLoading ? (
          <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={80} radius={Radius.lg} />)}
          </View>
        ) : rows.length === 0 ? (
          <EmptyState title="No students" description="No active students in this stream." />
        ) : (
          <FastList
            data={rows}
            keyExtractor={(r) => r.studentId}
            contentContainerStyle={{ padding: Spacing.base, paddingBottom: 60, gap: Spacing.sm }}
            renderItem={({ item }) => {
              const value = merged[item.studentId] ?? '';
              const needsInit = !item.reportId;
              return (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
                  <View style={styles.row}>
                    <Avatar name={item.fullName} photoUrl={item.photoUrl} size={36} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <ThemedText variant="body" style={{ fontWeight: '600' }}>{item.fullName}</ThemedText>
                      <ThemedText variant="caption" color="muted">{item.studentNumber}</ThemedText>
                    </View>
                    <ThemedText variant="caption" color="muted">{value.length}/{MAX}</ThemedText>
                  </View>
                  <TextInput
                    value={value}
                    onChangeText={(t) => {
                      if (t.length <= MAX) setLocal((p) => ({ ...p, [item.studentId]: t }));
                    }}
                    onBlur={() => handleBlur(item)}
                    placeholder={needsInit ? 'Reports not initialized yet — ask admin' : 'Subject teacher remark…'}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    editable={!needsInit}
                    style={[styles.input, {
                      color: colors.textPrimary,
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border,
                      opacity: needsInit ? 0.5 : 1,
                    }]}
                  />
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
  card: { borderRadius: Radius.lg, padding: Spacing.md, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  row:  { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderRadius: Radius.md, borderWidth: 1, padding: 10, minHeight: 64, textAlignVertical: 'top', fontSize: 14, lineHeight: 20,
  },
});
