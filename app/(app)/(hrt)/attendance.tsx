import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, differenceInHours, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { triggerAbsenceNotification } from '../../../lib/notifications';
import {
  ThemedText, Avatar, FAB, BottomSheet,
  Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors, resolveAttBg, resolveAttColor } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import type { AttendanceStatus } from '../../../types/database';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const TODAY_DISPLAY = format(new Date(), 'EEE dd/MM/yy');

const STATUSES: { value: AttendanceStatus; label: string; icon: string }[] = [
  { value: 'present', label: 'Present',              icon: 'checkmark-circle' },
  { value: 'late',    label: 'Late',                 icon: 'time' },
  { value: 'absent',  label: 'Absent',               icon: 'close-circle' },
  { value: 'ap',      label: 'Authorised Absence',   icon: 'shield-checkmark' },
  { value: 'sick',    label: 'Sick / Medical',        icon: 'medkit' },
];

interface StudentRow {
  id: string;
  full_name: string;
  student_number: string;
  photo_url: string | null;
  attendance_status: AttendanceStatus | null;
  record_id: string | null;
  submitted_at: string | null;
}

interface RegisterData {
  students: StudentRow[];
  streamId: string | null;
  semesterId: string | null;
  streamName: string;
  isLocked: boolean;
  submittedByMe: boolean;
  submittedByOther: boolean;
  submittedByOtherName: string | null;
  submittedAt: string | null;
  existingApReasons: Record<string, string>;
}

function useAttendanceRegister(staffId: string | null, schoolId: string) {
  return useQuery<RegisterData>({
    queryKey: ['attendance-register', staffId, schoolId, TODAY],
    enabled: !!staffId && !!schoolId,
    staleTime: 0,
    queryFn: async () => {
      const { data: assignment } = await (supabase as any)
        .from('hrt_assignments')
        .select('stream_id, semester_id, streams ( name )')
        .eq('school_id', schoolId)
        .or(`staff_id.eq.${staffId},co_hrt_staff_id.eq.${staffId}`)
        .limit(1)
        .single();

      if (!assignment) {
        return {
          students: [], streamId: null, semesterId: null, streamName: '',
          isLocked: false, submittedByMe: false, submittedByOther: false,
          submittedByOtherName: null, submittedAt: null, existingApReasons: {},
        };
      }

      const { stream_id, semester_id } = assignment as any;
      const streamName = (assignment as any).streams?.name ?? '';

      const [studentsRes, attendanceRes, apRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', stream_id)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('attendance_records')
          .select('id, student_id, status, register_locked, submitted_by, submitted_at, staff:submitted_by ( full_name )')
          .eq('school_id', schoolId)
          .eq('stream_id', stream_id)
          .eq('date', TODAY),
        supabase
          .from('excused_absence_requests')
          .select('attendance_record_id, reason_text'),
      ]);

      const attendance = (attendanceRes.data ?? []) as any[];
      const attMap: Record<string, any> = {};
      attendance.forEach((a: any) => { attMap[a.student_id] = a; });

      const isLocked = attendance.some((a: any) => a.register_locked);
      const submitterRecord = attendance.find((a: any) => a.submitted_by);
      const submittedBy = submitterRecord?.submitted_by ?? null;
      const submittedByMe = !!submittedBy && submittedBy === staffId;
      const submittedByOther = !!submittedBy && submittedBy !== staffId;
      const submittedByOtherName = submittedByOther
        ? (submitterRecord?.staff?.full_name ?? 'Your co-HRT')
        : null;
      const submittedAt = submitterRecord?.submitted_at ?? null;

      // Build AP reasons from excused_absence_requests
      const apRecordIds = attendance
        .filter((a: any) => a.status === 'ap')
        .map((a: any) => a.id);
      const apRows = (apRes.data ?? []).filter(
        (r: any) => apRecordIds.includes(r.attendance_record_id),
      );
      const apReasonByRecordId: Record<string, string> = {};
      apRows.forEach((r: any) => { apReasonByRecordId[r.attendance_record_id] = r.reason_text; });
      const existingApReasons: Record<string, string> = {};
      attendance.forEach((a: any) => {
        if (a.status === 'ap' && apReasonByRecordId[a.id]) {
          existingApReasons[a.student_id] = apReasonByRecordId[a.id];
        }
      });

      const students: StudentRow[] = (studentsRes.data ?? []).map((s: any) => ({
        ...s,
        attendance_status: attMap[s.id]?.status ?? null,
        record_id: attMap[s.id]?.id ?? null,
        submitted_at: attMap[s.id]?.submitted_at ?? null,
      }));

      return {
        students, streamId: stream_id, semesterId: semester_id, streamName,
        isLocked, submittedByMe, submittedByOther, submittedByOtherName,
        submittedAt, existingApReasons,
      };
    },
  });
}

function useExamPeriod(schoolId: string) {
  return useQuery({
    queryKey: ['exam-period', schoolId, TODAY],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('calendar_events')
        .select('id, title, start_date, end_date')
        .eq('school_id', schoolId)
        .eq('event_type', 'exam_period')
        .lte('start_date', TODAY)
        .gte('end_date', TODAY)
        .limit(1)
        .maybeSingle();
      return data as { id: string; title: string } | null;
    },
  });
}

export default function AttendanceScreen() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useAttendanceRegister(
    user?.staffId ?? null,
    user?.schoolId ?? '',
  );
  const { data: examPeriod } = useExamPeriod(user?.schoolId ?? '');

  const [localStatuses, setLocalStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [apReasons, setApReasons] = useState<Record<string, string>>({});
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [bulkSheetVisible, setBulkSheetVisible] = useState(false);
  const [apPendingStatus, setApPendingStatus] = useState(false);
  const [apDraftReason, setApDraftReason] = useState('');
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionSheetVisible, setCorrectionSheetVisible] = useState(false);
  const [correctionStudent, setCorrectionStudent] = useState<StudentRow | null>(null);
  const [correctionNewStatus, setCorrectionNewStatus] = useState<AttendanceStatus | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const examInitialisedRef = useRef(false);

  // Pre-mark all students as Present during exam period (once per mount)
  useEffect(() => {
    if (examPeriod && data?.students && !examInitialisedRef.current && !data.isLocked) {
      examInitialisedRef.current = true;
      const preset: Record<string, AttendanceStatus> = {};
      data.students.forEach((s) => {
        if (!s.attendance_status) preset[s.id] = 'present';
      });
      if (Object.keys(preset).length > 0) setLocalStatuses(prev => ({ ...preset, ...prev }));
    }
  }, [examPeriod, data?.students, data?.isLocked]);

  const effectiveStatuses = useMemo(() => {
    const base: Record<string, AttendanceStatus> = {};
    (data?.students ?? []).forEach((s) => {
      if (s.attendance_status) base[s.id] = s.attendance_status;
    });
    return { ...base, ...localStatuses };
  }, [data?.students, localStatuses]);

  const markedCount = Object.keys(effectiveStatuses).length;
  const totalCount  = data?.students?.length ?? 0;
  const allMarked   = markedCount === totalCount && totalCount > 0;

  // ── Status selection ────────────────────────────────────────

  const handleStatusSelect = useCallback((status: AttendanceStatus) => {
    if (status === 'ap') {
      setApPendingStatus(true);
      setApDraftReason('');
      return;
    }
    haptics.selection();
    setLocalStatuses(prev => {
      const current = prev[selectedStudent!.id] ?? null;
      if (current === status) {
        // Untick: deselect so teacher can pick a different status
        const next = { ...prev };
        delete next[selectedStudent!.id];
        return next;
      }
      return { ...prev, [selectedStudent!.id]: status };
    });
    setSheetVisible(false);
  }, [selectedStudent]);

  const confirmApStatus = useCallback(() => {
    if (!apDraftReason.trim()) return;
    haptics.selection();
    setLocalStatuses(prev => ({ ...prev, [selectedStudent!.id]: 'ap' }));
    setApReasons(prev => ({ ...prev, [selectedStudent!.id]: apDraftReason.trim() }));
    setApPendingStatus(false);
    setSheetVisible(false);
  }, [selectedStudent, apDraftReason]);

  const openStudentSheet = useCallback((student: StudentRow) => {
    if (data?.isLocked || data?.submittedByOther) return;
    setSelectedStudent(student);
    setApPendingStatus(false);
    setApDraftReason(
      apReasons[student.id] ?? data?.existingApReasons?.[student.id] ?? '',
    );
    setSheetVisible(true);
  }, [data?.isLocked, data?.submittedByOther, apReasons, data?.existingApReasons]);

  // ── Bulk mark ───────────────────────────────────────────────

  const markAll = useCallback((status: AttendanceStatus) => {
    if (status === 'ap') {
      haptics.error();
      Alert.alert('Bulk AP not supported', 'Authorised Absence requires an individual reason for each student.');
      setBulkSheetVisible(false);
      return;
    }
    haptics.medium();
    const all: Record<string, AttendanceStatus> = {};
    (data?.students ?? []).forEach((s) => { all[s.id] = status; });
    setLocalStatuses(all);
    setBulkSheetVisible(false);
  }, [data?.students]);

  // ── Submit register ─────────────────────────────────────────

  const handleSubmit = async () => {
    if (!data?.streamId || !data?.semesterId || !allMarked) return;

    // Validate AP reasons
    const apStudents = Object.entries(effectiveStatuses)
      .filter(([, s]) => s === 'ap')
      .map(([id]) => id);
    for (const sid of apStudents) {
      const reason = apReasons[sid] ?? data.existingApReasons?.[sid];
      if (!reason) {
        const student = data.students.find((s) => s.id === sid);
        setSubmitError(
          `Please add a reason for ${student?.full_name ?? 'a student'}'s Authorised Absence.`,
        );
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);

    // Re-check for race — co-HRT first-submit-wins
    const { data: existing } = await (supabase as any)
      .from('attendance_records')
      .select('submitted_by, register_locked')
      .eq('school_id', user?.schoolId ?? '')
      .eq('stream_id', data.streamId)
      .eq('date', TODAY)
      .limit(1)
      .maybeSingle();

    if (
      existing &&
      (existing as any).submitted_by &&
      (existing as any).submitted_by !== user?.staffId
    ) {
      setSubmitting(false);
      haptics.error();
      setSubmitError("Your co-HRT already submitted today's register.");
      queryClient.invalidateQueries({ queryKey: ['attendance-register'] });
      return;
    }

    // Build records
    const records = Object.entries(effectiveStatuses).map(([studentId, status]) => ({
      school_id: user?.schoolId,
      student_id: studentId,
      stream_id: data.streamId,
      semester_id: data.semesterId,
      date: TODAY,
      status,
      submitted_by: user?.staffId,
      submitted_at: new Date().toISOString(),
      register_locked: true,
    }));

    const { data: upserted, error } = await (supabase as any)
      .from('attendance_records')
      .upsert(records as any, { onConflict: 'student_id,date' })
      .select('id, student_id, status');

    if (error) {
      setSubmitting(false);
      haptics.error();
      setSubmitError('Could not save attendance. Please try again.');
      return;
    }

    // Save AP excused_absence_requests
    if (apStudents.length > 0 && upserted) {
      const apUpserts = apStudents.map((sid) => {
        const record = (upserted as any[]).find((r: any) => r.student_id === sid);
        return {
          school_id: user?.schoolId,
          attendance_record_id: record?.id,
          reason_text: apReasons[sid] ?? data.existingApReasons?.[sid] ?? '',
          granted_by: user?.staffId,
          granted_at: new Date().toISOString(),
        };
      }).filter((r) => r.attendance_record_id);
      if (apUpserts.length > 0) {
        await (supabase as any)
          .from('excused_absence_requests')
          .upsert(apUpserts as any, { onConflict: 'attendance_record_id' });
      }
    }

    // Fire absence notifications (fire-and-forget per absent student)
    const absentStudents = Object.entries(effectiveStatuses)
      .filter(([, s]) => s === 'absent')
      .map(([id]) => id);
    if (absentStudents.length > 0 && user?.staffId) {
      const nameParts = (user.fullName ?? '').split(' ');
      const markedByName =
        nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
          : nameParts[0] ?? 'Teacher';
      absentStudents.forEach((sid) => {
        triggerAbsenceNotification({
          school_id: user.schoolId,
          student_id: sid,
          stream_id: data.streamId!,
          date: TODAY,
          marked_by_name: markedByName,
        });
      });
    }

    // Audit log (fire-and-forget)
    (supabase as any).from('audit_logs').insert({
      school_id: user?.schoolId,
      event_type: 'attendance_submitted',
      actor_id: user?.staffId,
      data: {
        stream_id: data.streamId,
        date: TODAY,
        record_count: records.length,
        present: records.filter((r) => r.status === 'present').length,
        absent: records.filter((r) => r.status === 'absent').length,
        late: records.filter((r) => r.status === 'late').length,
      },
    } as any).then(() => {});

    setSubmitting(false);
    haptics.success();
    setSubmitted(true);
    queryClient.invalidateQueries({ queryKey: ['attendance-register'] });
    queryClient.invalidateQueries({ queryKey: ['hrt-dashboard'] });
  };

  // ── Correction (within 24h by submitting HRT) ────────────────

  const within24h = useMemo(() => {
    if (!data?.submittedAt) return false;
    const diff = differenceInHours(new Date(), parseISO(data.submittedAt));
    return diff < 24;
  }, [data?.submittedAt]);

  const openCorrectionSheet = useCallback((student: StudentRow) => {
    setCorrectionStudent(student);
    setCorrectionNewStatus(student.attendance_status);
    setCorrectionNote('');
    setCorrectionSheetVisible(true);
  }, []);

  const handleSaveCorrection = async () => {
    if (!correctionStudent || !correctionNewStatus || correctionNote.trim().length < 3) return;
    setCorrectionSaving(true);
    haptics.light();

    const db = supabase as any;
    const { error } = await db
      .from('attendance_records')
      .update({
        status: correctionNewStatus,
        corrected_by: user?.staffId,
        corrected_at: new Date().toISOString(),
        correction_note: correctionNote.trim(),
      })
      .eq('student_id', correctionStudent.id)
      .eq('date', TODAY)
      .eq('school_id', user?.schoolId ?? '');

    if (error) {
      setCorrectionSaving(false);
      haptics.error();
      Alert.alert('Error', 'Could not save correction. Please try again.');
      return;
    }

    // Audit log
    (supabase as any).from('audit_logs').insert({
      school_id: user?.schoolId,
      event_type: 'attendance_corrected',
      actor_id: user?.staffId,
      data: {
        student_id: correctionStudent.id,
        old_status: correctionStudent.attendance_status,
        new_status: correctionNewStatus,
        note: correctionNote.trim(),
        date: TODAY,
      },
    } as any).then(() => {});

    haptics.success();
    setCorrectionSaving(false);
    setCorrectionSheetVisible(false);
    queryClient.invalidateQueries({ queryKey: ['attendance-register'] });
  };

  // ── Render ──────────────────────────────────────────────────

  if (submitted) {
    return (
      <SubmittedView
        streamName={data?.streamName ?? ''}
        presentCount={Object.values(effectiveStatuses).filter((s) => s === 'present').length}
        absentCount={Object.values(effectiveStatuses).filter((s) => s === 'absent').length}
        lateCount={Object.values(effectiveStatuses).filter((s) => s === 'late').length}
        otherCount={Object.values(effectiveStatuses).filter((s) => s === 'ap' || s === 'sick').length}
        total={totalCount}
        onViewRegister={() => { setSubmitted(false); setCorrectionMode(true); }}
        onHome={() => router.replace('/(app)/(hrt)/home')}
      />
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Could not load register"
          description="Check your connection and try again."
          onRetry={refetch}
        />
      </SafeAreaView>
    );
  }

  const isReadOnly = (data?.isLocked && !correctionMode) || data?.submittedByOther;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={data?.streamName ? `${data.streamName} Register` : 'Attendance Register'}
        subtitle={TODAY_DISPLAY}
        showBack
        right={
          <TouchableOpacity
            onPress={() => router.push('/(app)/(hrt)/attendance-history' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="time-outline" size={20} color={colors.brand.primary} />
          </TouchableOpacity>
        }
      />

      {/* Exam period banner */}
      {examPeriod && (
        <View style={[styles.examBanner, { backgroundColor: Colors.semantic.warningLight }]}>
          <Ionicons name="school-outline" size={14} color={Colors.semantic.warning} />
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: Spacing.sm, flex: 1 }}>
            Exam Period — {examPeriod.title}
          </ThemedText>
        </View>
      )}

      {/* Progress bar */}
      {!isReadOnly && (
        <View style={[styles.progressRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <ThemedText variant="bodySm" color="muted">{markedCount} / {totalCount} marked</ThemedText>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: allMarked ? Colors.semantic.success : colors.brand.primary,
                  width: totalCount > 0 ? `${(markedCount / totalCount) * 100}%` : '0%',
                },
              ]}
            />
          </View>
          {allMarked && <Ionicons name="checkmark-circle" size={14} color={Colors.semantic.success} />}
        </View>
      )}

      {/* Lock / co-HRT / correction banners */}
      {data?.submittedByOther && (
        <View style={[styles.infoBanner, { backgroundColor: colors.brand.primary + '14' }]}>
          <Ionicons name="lock-closed" size={14} color={colors.brand.primary} />
          <ThemedText variant="bodySm" style={{ color: colors.brand.primary, marginLeft: Spacing.sm, flex: 1 }}>
            Submitted by {data.submittedByOtherName}. Viewing read-only.
          </ThemedText>
        </View>
      )}
      {correctionMode && within24h && (
        <View style={[styles.infoBanner, { backgroundColor: Colors.semantic.warningLight }]}>
          <Ionicons name="create-outline" size={14} color={Colors.semantic.warning} />
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: Spacing.sm, flex: 1 }}>
            Correction mode — tap any student to correct their status.
          </ThemedText>
        </View>
      )}
      {correctionMode && !within24h && (
        <View style={[styles.infoBanner, { backgroundColor: Colors.semantic.errorLight }]}>
          <Ionicons name="lock-closed" size={14} color={Colors.semantic.error} />
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, marginLeft: Spacing.sm, flex: 1 }}>
            24-hour correction window has passed. Contact Admin for amendments.
          </ThemedText>
        </View>
      )}

      {/* Bulk action button (top-right, shown when not read-only) */}
      {!isReadOnly && totalCount > 0 && (
        <TouchableOpacity
          onPress={() => setBulkSheetVisible(true)}
          style={[styles.bulkBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        >
          <Ionicons name="flash-outline" size={16} color={colors.brand.primary} />
          <ThemedText variant="bodySm" style={{ color: colors.brand.primary, marginLeft: 6 }}>
            Mark all students…
          </ThemedText>
        </TouchableOpacity>
      )}

      {/* Student list */}
      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="30%" height={11} />
              </View>
              <Skeleton width={70} height={28} radius={14} />
            </View>
          ))}
        </View>
      ) : totalCount === 0 ? (
        <EmptyState
          title="No students found"
          description="There are no active students in your class."
        />
      ) : (
        <FastList
          data={data?.students ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <StudentAttendanceRow
              student={item}
              status={effectiveStatuses[item.id] ?? null}
              apReason={apReasons[item.id] ?? data?.existingApReasons?.[item.id]}
              isReadOnly={!!isReadOnly}
              inCorrectionMode={correctionMode && within24h}
              scheme={scheme}
              colors={colors}
              onPress={() => {
                if (correctionMode && within24h) {
                  openCorrectionSheet(item);
                } else if (!isReadOnly) {
                  openStudentSheet(item);
                }
              }}
            />
          )}
        />
      )}

      {/* Submit error */}
      {submitError && (
        <View style={[styles.errorBanner, { backgroundColor: Colors.semantic.errorLight }]}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.semantic.error} />
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, marginLeft: Spacing.sm, flex: 1 }}>
            {submitError}
          </ThemedText>
          <TouchableOpacity onPress={() => setSubmitError(null)}>
            <Ionicons name="close" size={16} color={Colors.semantic.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Submit FAB (only when not read-only and not correction mode) */}
      {!isReadOnly && !correctionMode && totalCount > 0 && (
        <FAB
          icon={
            allMarked
              ? <Ionicons name="checkmark" size={24} color="#fff" />
              : <Ionicons name="send-outline" size={22} color="#fff" />
          }
          label={submitting ? 'Saving…' : allMarked ? 'Submit Register' : `${totalCount - markedCount} not marked`}
          onPress={handleSubmit}
          disabled={!allMarked || submitting}
          color={allMarked ? Colors.semantic.success : colors.brand.primary}
        />
      )}

      {/* Individual status picker sheet */}
      <BottomSheet
        visible={sheetVisible && !!selectedStudent}
        onClose={() => { setSheetVisible(false); setApPendingStatus(false); }}
        title={selectedStudent?.full_name}
        snapHeight={apPendingStatus ? 480 : 400}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.statusOptions}>
            {STATUSES.map((s) => {
              const isActive = effectiveStatuses[selectedStudent?.id ?? ''] === s.value;
              const isApSelected = apPendingStatus && s.value === 'ap';
              return (
                <View key={s.value}>
                  <TouchableOpacity
                    onPress={() => handleStatusSelect(s.value)}
                    style={[
                      styles.statusOption,
                      {
                        backgroundColor: isActive || isApSelected
                          ? resolveAttBg(s.value, scheme)
                          : colors.surfaceSecondary,
                        borderColor: isActive || isApSelected
                          ? resolveAttColor(s.value)
                          : colors.border,
                      },
                    ]}
                  >
                    <Ionicons name={s.icon as any} size={22} color={resolveAttColor(s.value)} />
                    <ThemedText variant="bodyLg" style={{ color: resolveAttColor(s.value), fontWeight: '600', flex: 1 }}>
                      {s.label}
                    </ThemedText>
                    {isActive && !apPendingStatus && (
                      <Ionicons name="checkmark" size={18} color={resolveAttColor(s.value)} />
                    )}
                  </TouchableOpacity>

                  {/* AP inline reason input */}
                  {isApSelected && (
                    <View style={[styles.apReasonBox, { backgroundColor: resolveAttBg('ap', scheme), borderColor: resolveAttColor('ap') }]}>
                      <ThemedText variant="label" color="muted" style={{ marginBottom: 6 }}>
                        Reason for authorised absence (required)
                      </ThemedText>
                      <TextInput
                        value={apDraftReason}
                        onChangeText={setApDraftReason}
                        placeholder="e.g. Family bereavement"
                        placeholderTextColor={colors.textMuted}
                        style={[
                          styles.apInput,
                          { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
                        ]}
                        maxLength={200}
                        autoFocus
                        multiline
                        numberOfLines={2}
                      />
                      <TouchableOpacity
                        onPress={confirmApStatus}
                        disabled={!apDraftReason.trim()}
                        style={[
                          styles.apConfirmBtn,
                          { backgroundColor: apDraftReason.trim() ? resolveAttColor('ap') : colors.border },
                        ]}
                      >
                        <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
                          Confirm AP
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>

      {/* Bulk action sheet */}
      <BottomSheet
        visible={bulkSheetVisible}
        onClose={() => setBulkSheetVisible(false)}
        title="Mark all students as…"
        snapHeight={440}
      >
        <TouchableOpacity
          onPress={() => markAll('present')}
          style={[styles.quickPresentBtn, { backgroundColor: Colors.semantic.success }]}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700', marginLeft: Spacing.sm }}>
            Mark All Present
          </ThemedText>
        </TouchableOpacity>
        <ThemedText variant="caption" color="muted" style={styles.orLabel}>or choose another status</ThemedText>
        <View style={styles.statusOptions}>
          {STATUSES.filter((s) => s.value !== 'present' && s.value !== 'ap').map((s) => (
            <TouchableOpacity
              key={s.value}
              onPress={() => markAll(s.value)}
              style={[styles.statusOption, { backgroundColor: resolveAttBg(s.value, scheme), borderColor: resolveAttColor(s.value) }]}
            >
              <Ionicons name={s.icon as any} size={22} color={resolveAttColor(s.value)} />
              <ThemedText variant="bodyLg" style={{ color: resolveAttColor(s.value), fontWeight: '600' }}>
                {s.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Correction sheet (HRT within 24h) */}
      <BottomSheet
        visible={correctionSheetVisible && !!correctionStudent}
        onClose={() => setCorrectionSheetVisible(false)}
        title={`Correct: ${correctionStudent?.full_name ?? ''}`}
        snapHeight={540}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.statusOptions}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s.value}
                onPress={() => setCorrectionNewStatus(s.value)}
                style={[
                  styles.statusOption,
                  {
                    backgroundColor: correctionNewStatus === s.value
                      ? resolveAttBg(s.value, scheme)
                      : colors.surfaceSecondary,
                    borderColor: correctionNewStatus === s.value
                      ? resolveAttColor(s.value)
                      : colors.border,
                  },
                ]}
              >
                <Ionicons name={s.icon as any} size={20} color={resolveAttColor(s.value)} />
                <ThemedText variant="body" style={{ color: resolveAttColor(s.value), fontWeight: '600', flex: 1 }}>
                  {s.label}
                </ThemedText>
                {correctionNewStatus === s.value && (
                  <Ionicons name="checkmark" size={16} color={resolveAttColor(s.value)} />
                )}
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.correctionNoteBox, { borderColor: colors.border }]}>
            <ThemedText variant="label" color="muted" style={{ marginBottom: 6 }}>
              Reason for correction (required)
            </ThemedText>
            <TextInput
              value={correctionNote}
              onChangeText={setCorrectionNote}
              placeholder="Explain why this status is being corrected…"
              placeholderTextColor={colors.textMuted}
              style={[styles.apInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
              maxLength={300}
              multiline
              numberOfLines={3}
            />
          </View>
          <TouchableOpacity
            onPress={handleSaveCorrection}
            disabled={correctionSaving || !correctionNewStatus || correctionNote.trim().length < 3}
            style={[
              styles.apConfirmBtn,
              {
                marginTop: Spacing.sm,
                backgroundColor:
                  correctionNote.trim().length >= 3 && correctionNewStatus && !correctionSaving
                    ? colors.brand.primary
                    : colors.border,
              },
            ]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
              {correctionSaving ? 'Saving…' : 'Save Correction'}
            </ThemedText>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────

/**
 * Memoised so FlashList recycling skips re-rendering rows whose
 * status/reason hasn't changed when the parent re-renders.
 */
const StudentAttendanceRow = React.memo(function StudentAttendanceRow({
  student, status, apReason, isReadOnly, inCorrectionMode, scheme, colors, onPress,
}: {
  student: StudentRow;
  status: AttendanceStatus | null;
  apReason?: string;
  isReadOnly: boolean;
  inCorrectionMode: boolean;
  scheme: 'light' | 'dark';
  colors: any;
  onPress: () => void;
}) {
  const attColor = status ? resolveAttColor(status) : colors.textMuted;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={isReadOnly && !inCorrectionMode ? 1 : 0.75}
      style={[styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Avatar name={student.full_name} photoUrl={student.photo_url} size={42} />
      <View style={styles.studentInfo}>
        <ThemedText variant="body" style={{ fontWeight: '600' }}>{student.full_name}</ThemedText>
        <ThemedText variant="caption" color="muted">{student.student_number}</ThemedText>
        {status === 'ap' && apReason && (
          <ThemedText variant="caption" style={{ color: resolveAttColor('ap'), marginTop: 2 }} numberOfLines={1}>
            AP: {apReason}
          </ThemedText>
        )}
      </View>
      <View style={[styles.statusChip, { backgroundColor: status ? resolveAttBg(status, scheme) : colors.surfaceSecondary, borderColor: attColor + '60' }]}>
        {status ? (
          <>
            <Ionicons
              name={STATUSES.find((s) => s.value === status)?.icon as any ?? 'ellipse'}
              size={13}
              color={attColor}
            />
            <ThemedText variant="label" style={{ color: attColor, marginLeft: 4, fontSize: 11 }}>
              {status === 'ap' ? 'AP' : status.toUpperCase()}
            </ThemedText>
          </>
        ) : (
          <ThemedText variant="label" style={{ color: colors.textMuted, fontSize: 11 }}>SET</ThemedText>
        )}
      </View>
      {inCorrectionMode && (
        <Ionicons name="create-outline" size={16} color={Colors.semantic.warning} style={{ marginLeft: 4 }} />
      )}
    </TouchableOpacity>
  );
});

function SubmittedView({
  streamName, presentCount, absentCount, lateCount, otherCount, total, onViewRegister, onHome,
}: {
  streamName: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  otherCount: number;
  total: number;
  onViewRegister: () => void;
  onHome: () => void;
}) {
  const { colors } = useTheme();
  const scale    = useSharedValue(0.4);
  const opacity  = useSharedValue(0);
  const contentY = useSharedValue(30);
  const contentO = useSharedValue(0);

  useEffect(() => {
    scale.value    = withSpring(1, { damping: 12, stiffness: 140 });
    opacity.value  = withTiming(1, { duration: 300 });
    contentY.value = withDelay(200, withSpring(0, { damping: 14 }));
    contentO.value = withDelay(200, withTiming(1, { duration: 350 }));
  }, []);

  const iconStyle    = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: contentY.value }], opacity: contentO.value }));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.submittedContainer}>
        <Animated.View style={[styles.successIcon, { backgroundColor: Colors.semantic.successLight }, iconStyle]}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.semantic.success} />
        </Animated.View>
        <Animated.View style={[{ alignItems: 'center', width: '100%' }, contentStyle]}>
          <ThemedText variant="h2" style={styles.successTitle}>Register Submitted</ThemedText>
          <ThemedText variant="body" color="muted" style={styles.successSub}>
            {streamName ? `${streamName} — ` : ''}{TODAY_DISPLAY}
          </ThemedText>
          <View style={[styles.statsGrid, { borderColor: colors.border }]}>
            {[
              { label: 'Present', count: presentCount, color: Colors.attendance.present },
              { label: 'Absent',  count: absentCount,  color: Colors.attendance.absent  },
              { label: 'Late',    count: lateCount,    color: Colors.attendance.late    },
              { label: 'Other',   count: otherCount,   color: Colors.attendance.ap      },
            ].map((item, i, arr) => (
              <View
                key={item.label}
                style={[styles.statBox, { borderColor: colors.border }, i > 0 && styles.statBoxBorder]}
              >
                <ThemedText variant="h2" style={{ color: item.color }}>{item.count}</ThemedText>
                <ThemedText variant="caption" color="muted">{item.label}</ThemedText>
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => { haptics.light(); onHome(); }}
            style={[styles.doneBtn, { backgroundColor: colors.brand.primary }]}
            activeOpacity={0.85}
          >
            <Ionicons name="home-outline" size={18} color="#fff" />
            <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>Back to Home</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={onViewRegister} style={styles.viewRegisterBtn}>
            <ThemedText variant="body" color="brand">View / Correct Register</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  examBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
  },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skeletonList: { padding: Spacing.base, gap: Spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  studentInfo: { flex: 1, gap: 2 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    minWidth: 60,
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  statusOptions: { gap: Spacing.sm, paddingVertical: Spacing.xs ?? 4 },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  apReasonBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  apInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  apConfirmBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  correctionNoteBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  quickPresentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
  },
  orLabel: { textAlign: 'center', marginBottom: Spacing.sm },
  submittedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  successIcon: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  successTitle: { marginBottom: Spacing.sm, textAlign: 'center' },
  successSub: { textAlign: 'center', marginBottom: Spacing.xl },
  statsGrid: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: Spacing['2xl'],
    width: '100%',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: Spacing.base, gap: 4 },
  statBoxBorder: { borderLeftWidth: StyleSheet.hairlineWidth },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.base,
    borderRadius: Radius.full,
    marginBottom: Spacing.base,
  },
  viewRegisterBtn: { paddingVertical: Spacing.sm },
});
