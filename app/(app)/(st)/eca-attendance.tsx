import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Card, EmptyState, ErrorState, ListItemSkeleton, Avatar, Button,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import {
  useECAAssignmentsByActivity, useECAAttendance, useMarkECAAttendance,
  type ECAAttendance,
} from '../../../hooks/useECA';

type StatusKey = ECAAttendance['status'];

const STATUS_OPTIONS: Array<{ key: StatusKey; label: string; bg: string; fg: string }> = [
  { key: 'present', label: 'Present', bg: '#D1FAE5', fg: '#065F46' },
  { key: 'absent',  label: 'Absent',  bg: '#FEE2E2', fg: '#991B1B' },
  { key: 'late',    label: 'Late',    bg: '#FEF3C7', fg: '#92400E' },
  { key: 'excused', label: 'Excused', bg: '#E5E7EB', fg: '#374151' },
];

export default function ECAAttendanceScreen() {
  const { activityId, activityName } = useLocalSearchParams<{ activityId: string; activityName: string }>();
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const today  = format(new Date(), 'yyyy-MM-dd');
  const [date] = useState(today);

  const roster        = useECAAssignmentsByActivity(activityId);
  const attendance    = useECAAttendance(activityId, date);
  const markMutation  = useMarkECAAttendance();

  const [localStatus, setLocalStatus] = useState<Record<string, StatusKey>>({});

  React.useEffect(() => {
    if (attendance.data) {
      const map: Record<string, StatusKey> = {};
      attendance.data.forEach((r) => { map[r.student_id] = r.status; });
      setLocalStatus(map);
    }
  }, [attendance.data]);

  const assigned = (roster.data ?? []).filter((a) => a.status === 'assigned');

  const setStatus = useCallback((studentId: string, status: StatusKey) => {
    setLocalStatus((prev) => ({ ...prev, [studentId]: status }));
  }, []);

  const handleSubmit = async () => {
    if (!activityId) return;
    const records = assigned
      .filter((a) => localStatus[a.student_id])
      .map((a) => ({
        student_id: a.student_id,
        status: localStatus[a.student_id],
        staff_id: user?.staffId,
      }));
    if (!records.length) {
      Alert.alert('No status set', 'Mark at least one student before saving.');
      return;
    }
    try {
      await markMutation.mutateAsync({ activityId, date, records });
      Alert.alert('Saved', 'Attendance recorded successfully.');
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Unknown error');
    }
  };

  const markAll = (status: StatusKey) => {
    const map: Record<string, StatusKey> = {};
    assigned.forEach((a) => { map[a.student_id] = status; });
    setLocalStatus(map);
  };

  const s = styles(colors);

  if (roster.isError) return <ErrorState title="Could not load roster" onRetry={roster.refetch} />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title={`${activityName ?? 'ECA'} Attendance`} showBack />
      <View style={s.dateBar}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
        <ThemedText style={s.dateText}>{format(new Date(date), 'EEEE, dd MMM yyyy')}</ThemedText>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => markAll('present')} hitSlop={6}>
          <ThemedText style={[s.bulkLink, { color: colors.brand.primary }]}>Mark all present</ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {roster.isLoading
          ? Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)
          : assigned.length === 0
            ? <EmptyState icon="people-outline" title="No students assigned" description="No students are currently assigned to this activity." />
            : assigned.map((a) => {
                const status = localStatus[a.student_id] ?? null;
                return (
                  <Card key={a.student_id} style={s.studentCard}>
                    <View style={s.studentRow}>
                      <Avatar name={a.students?.full_name ?? ''} photoUrl={a.students?.photo_url ?? null} size={40} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <ThemedText style={s.studentName}>{a.students?.full_name}</ThemedText>
                        <ThemedText style={s.studentSub}>#{a.students?.student_number}</ThemedText>
                      </View>
                    </View>
                    <View style={s.chipRow}>
                      {STATUS_OPTIONS.map((opt) => {
                        const sel = status === opt.key;
                        return (
                          <Pressable
                            key={opt.key}
                            onPress={() => setStatus(a.student_id, opt.key)}
                            style={[
                              s.statusChip,
                              { backgroundColor: sel ? opt.bg : colors.surfaceSecondary, borderColor: sel ? opt.fg : 'transparent' },
                            ]}
                          >
                            <ThemedText style={[s.statusChipText, { color: sel ? opt.fg : colors.textMuted }]}>
                              {opt.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                );
              })
        }
      </ScrollView>

      {assigned.length > 0 && (
        <View style={s.footer}>
          <Button
            label={markMutation.isPending ? 'Saving…' : 'Save Attendance'}
            onPress={handleSubmit}
            disabled={markMutation.isPending}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.background },
  dateBar:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateText:       { fontSize: 13, color: colors.textMuted },
  bulkLink:       { fontSize: 12, fontWeight: '600' },
  content:        { padding: Spacing.sm, gap: Spacing.sm, paddingBottom: 100 },
  studentCard:    {},
  studentRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  studentName:    { fontWeight: '600' },
  studentSub:     { fontSize: 12, color: colors.textMuted },
  chipRow:        { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusChip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  statusChipText: { fontSize: 12, fontWeight: '600' },
  footer:         { padding: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
