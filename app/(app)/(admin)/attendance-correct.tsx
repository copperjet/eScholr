import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, BottomSheet, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { useStreamRegister, type StreamRegisterRecord } from '../../../hooks/useAttendance';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors, resolveAttBg, resolveAttColor } from '../../../constants/Colors';
import type { AttendanceStatus } from '../../../types/database';
import { haptics } from '../../../lib/haptics';

const STATUSES: { value: AttendanceStatus; label: string; icon: string }[] = [
  { value: 'present', label: 'Present',            icon: 'checkmark-circle' },
  { value: 'late',    label: 'Late',               icon: 'time' },
  { value: 'absent',  label: 'Absent',             icon: 'close-circle' },
  { value: 'ap',      label: 'Auth. Absence',      icon: 'shield-checkmark' },
  { value: 'sick',    label: 'Sick / Medical',      icon: 'medkit' },
];

export default function AttendanceCorrectScreen() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ streamId: string; date: string; streamName: string }>();

  const streamId   = params.streamId;
  const date       = params.date ?? format(new Date(), 'yyyy-MM-dd');
  const streamName = params.streamName ?? 'Stream';
  const dateDisplay = format(new Date(date + 'T00:00:00'), 'EEE, d MMM yyyy');

  const { data, isLoading, isError, refetch } = useStreamRegister(
    streamId,
    date,
    user?.schoolId ?? '',
  );

  const [selectedRecord, setSelectedRecord] = useState<StreamRegisterRecord | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [newStatus, setNewStatus] = useState<AttendanceStatus | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpenCorrection = (record: StreamRegisterRecord) => {
    haptics.light();
    setSelectedRecord(record);
    setNewStatus((record.status as AttendanceStatus) ?? 'present');
    setNote('');
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (!selectedRecord || !newStatus || note.trim().length < 5) return;
    setSaving(true);
    haptics.medium();

    const oldStatus = selectedRecord.status;

    // If record exists, UPDATE. If not, INSERT (admin marking for absent HRT).
    let saveError: any = null;

    if (selectedRecord.recordId) {
      const db = supabase as any;
      const { error } = await db
        .from('attendance_records')
        .update({
          status: newStatus,
          corrected_by: user?.staffId,
          corrected_at: new Date().toISOString(),
          correction_note: note.trim(),
        })
        .eq('id', selectedRecord.recordId)
        .eq('school_id', user?.schoolId ?? '');
      saveError = error;
    } else {
      // No record yet — admin is entering on behalf of absent HRT
      const { error } = await (supabase as any)
        .from('attendance_records')
        .insert({
          school_id:       user?.schoolId,
          student_id:      selectedRecord.studentId,
          stream_id:       streamId,
          semester_id:     null, // best effort — will be resolved server-side via trigger
          date,
          status:          newStatus,
          submitted_by:    user?.staffId,
          submitted_at:    new Date().toISOString(),
          register_locked: true,
          corrected_by:    user?.staffId,
          correction_note: `Admin entry: ${note.trim()}`,
        } as any);
      saveError = error;
    }

    if (saveError) {
      setSaving(false);
      haptics.error();
      Alert.alert('Error', 'Could not save correction. Please try again.');
      return;
    }

    // Audit log — non-negotiable
    await (supabase as any).from('audit_logs').insert({
      school_id:  user?.schoolId,
      event_type: 'attendance_corrected',
      actor_id:   user?.staffId,
      data: {
        student_id:  selectedRecord.studentId,
        student_name: selectedRecord.studentName,
        stream_id:   streamId,
        date,
        old_status:  oldStatus,
        new_status:  newStatus,
        note:        note.trim(),
        admin_correction: true,
      },
    } as any);

    haptics.success();
    setSaving(false);
    setSheetVisible(false);
    queryClient.invalidateQueries({ queryKey: ['stream-register', streamId, date] });
    queryClient.invalidateQueries({ queryKey: ['attendance-overview'] });
  };

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

  const records = data?.records ?? [];
  const submittedAt = data?.submittedAt;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={streamName} subtitle={dateDisplay} showBack />

      {/* Admin correction notice */}
      <View style={[styles.noticeBanner, { backgroundColor: Colors.semantic.infoLight }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={Colors.semantic.info} />
        <ThemedText variant="bodySm" style={{ color: Colors.semantic.info, marginLeft: Spacing.sm, flex: 1 }}>
          Admin corrections are permanent and audit-logged. A note is required.
        </ThemedText>
      </View>

      {/* Submission status */}
      {submittedAt && (
        <View style={[styles.submittedRow, { borderBottomColor: colors.border }]}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.semantic.success} />
          <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>
            Register submitted · {format(new Date(submittedAt), 'd MMM, HH:mm')}
          </ThemedText>
        </View>
      )}
      {!submittedAt && !isLoading && (
        <View style={[styles.submittedRow, { borderBottomColor: colors.border }]}>
          <Ionicons name="alert-circle-outline" size={14} color={Colors.semantic.warning} />
          <ThemedText variant="caption" style={{ color: Colors.semantic.warning, marginLeft: 6 }}>
            No register submitted — admin entry will lock the register.
          </ThemedText>
        </View>
      )}

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="30%" height={11} />
              </View>
              <Skeleton width={64} height={28} radius={14} />
            </View>
          ))}
        </View>
      ) : records.length === 0 ? (
        <EmptyState
          title="No students found"
          description="There are no active students in this stream."
        />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.studentId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AdminStudentRow
              record={item}
              colors={colors}
              scheme={scheme}
              onPress={() => handleOpenCorrection(item)}
            />
          )}
        />
      )}

      {/* Correction bottom sheet */}
      <BottomSheet
        visible={sheetVisible && !!selectedRecord}
        onClose={() => setSheetVisible(false)}
        title={`Correct: ${selectedRecord?.studentName ?? ''}`}
        snapHeight={560}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Current status notice */}
          {selectedRecord?.status && (
            <View style={[styles.currentStatusRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <ThemedText variant="caption" color="muted">Current status: </ThemedText>
              <ThemedText variant="caption" style={{ color: resolveAttColor(selectedRecord.status as AttendanceStatus), fontWeight: '700' }}>
                {selectedRecord.status.toUpperCase()}
              </ThemedText>
            </View>
          )}

          {/* Status options */}
          <View style={styles.statusOptions}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s.value}
                onPress={() => { haptics.selection(); setNewStatus(s.value); }}
                style={[
                  styles.statusOption,
                  {
                    backgroundColor: newStatus === s.value
                      ? resolveAttBg(s.value, scheme)
                      : colors.surfaceSecondary,
                    borderColor: newStatus === s.value
                      ? resolveAttColor(s.value)
                      : colors.border,
                  },
                ]}
              >
                <Ionicons name={s.icon as any} size={20} color={resolveAttColor(s.value)} />
                <ThemedText variant="body" style={{ color: resolveAttColor(s.value), fontWeight: '600', flex: 1 }}>
                  {s.label}
                </ThemedText>
                {newStatus === s.value && (
                  <Ionicons name="checkmark" size={16} color={resolveAttColor(s.value)} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Mandatory note */}
          <View style={[styles.noteBox, { borderTopColor: colors.border }]}>
            <ThemedText variant="label" color="muted" style={{ marginBottom: 6 }}>
              Reason for correction <ThemedText variant="label" style={{ color: Colors.semantic.error }}>*</ThemedText>
            </ThemedText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Required — explain why this status is being changed…"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.noteInput,
                {
                  color: colors.textPrimary,
                  borderColor: note.trim().length > 0 && note.trim().length < 5
                    ? Colors.semantic.error
                    : colors.border,
                  backgroundColor: colors.background,
                },
              ]}
              maxLength={500}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            {note.trim().length > 0 && note.trim().length < 5 && (
              <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: 4 }}>
                Note must be at least 5 characters.
              </ThemedText>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !newStatus || note.trim().length < 5}
            style={[
              styles.saveBtn,
              {
                backgroundColor:
                  !saving && newStatus && note.trim().length >= 5
                    ? Colors.semantic.error  // red = serious admin action
                    : colors.border,
              },
            ]}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
              {saving ? 'Saving…' : 'Save Admin Correction'}
            </ThemedText>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function AdminStudentRow({
  record, colors, scheme, onPress,
}: {
  record: StreamRegisterRecord;
  colors: any;
  scheme: 'light' | 'dark';
  onPress: () => void;
}) {
  const status = record.status as AttendanceStatus | null;
  const attColor = status ? resolveAttColor(status) : colors.textMuted;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Avatar name={record.studentName} photoUrl={record.photoUrl} size={42} />
      <View style={styles.studentInfo}>
        <ThemedText variant="body" style={{ fontWeight: '600' }}>{record.studentName}</ThemedText>
        <ThemedText variant="caption" color="muted">{record.studentNumber}</ThemedText>
        {record.correctionNote && (
          <ThemedText variant="caption" style={{ color: Colors.semantic.warning }} numberOfLines={1}>
            Corrected: {record.correctionNote}
          </ThemedText>
        )}
      </View>
      <View style={[styles.statusChip, { backgroundColor: status ? resolveAttBg(status, scheme) : colors.surfaceSecondary, borderColor: attColor + '60' }]}>
        {status ? (
          <ThemedText variant="label" style={{ color: attColor, fontSize: 11 }}>
            {status === 'ap' ? 'AP' : status.toUpperCase()}
          </ThemedText>
        ) : (
          <ThemedText variant="label" style={{ color: colors.textMuted, fontSize: 11 }}>—</ThemedText>
        )}
      </View>
      <Ionicons name="create-outline" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
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
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
  },
  submittedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonList: { padding: Spacing.base, gap: Spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  studentInfo: { flex: 1, gap: 2 },
  statusChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    minWidth: 48,
    alignItems: 'center',
  },
  currentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  statusOptions: { gap: Spacing.sm },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  noteBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: 14,
    minHeight: 80,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
});
