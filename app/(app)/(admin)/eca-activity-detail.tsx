import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Card, EmptyState, ErrorState,
  ListItemSkeleton, BottomSheet, FormField, Avatar, Button,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import {
  useECAActivityDetail, useECAAssignmentsByActivity,
  useWithdrawAssignment, useRunAllocation, useManualReassign,
} from '../../../hooks/useECA';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function useEligibleStudents(activityId: string, schoolId: string) {
  return useQuery({
    queryKey: ['eca-eligible-students', activityId, schoolId],
    enabled: !!activityId && !!schoolId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: streams } = await (supabase as any)
        .from('eca_activity_eligible_streams')
        .select('stream_id')
        .eq('activity_id', activityId);
      const streamIds = (streams ?? []).map((r: any) => r.stream_id) as string[];
      if (!streamIds.length) return [];
      const { data, error } = await (supabase as any)
        .from('students')
        .select('id, full_name, student_number')
        .in('stream_id', streamIds)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string; student_number: string }>;
    },
  });
}

export default function ECAActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const detail        = useECAActivityDetail(id ?? '');
  const assignments   = useECAAssignmentsByActivity(id ?? '');
  const eligible      = useEligibleStudents(id ?? '', sid);
  const withdraw      = useWithdrawAssignment();
  const runAlloc      = useRunAllocation();
  const manualAssign  = useManualReassign();

  const [manualSheet, setManualSheet] = useState(false);
  const [searchTerm, setSearchTerm]   = useState('');

  const act        = detail.data;
  const assigned   = (assignments.data ?? []).filter((a) => a.status === 'assigned');
  const waitlisted = (assignments.data ?? []).filter((a) => a.status === 'waitlisted');

  const handleWithdraw = (assignmentId: string, studentName: string) => {
    Alert.alert(
      'Withdraw Student',
      `Remove ${studentName} from this activity? If others are waitlisted they will be auto-promoted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => withdraw.mutate(assignmentId) },
      ]
    );
  };

  const handleManualAssign = async (studentId: string) => {
    if (!act) return;
    try {
      await manualAssign.mutateAsync({ studentId, categoryId: act.category_id, activityId: act.id });
      setManualSheet(false);
      setSearchTerm('');
    } catch (err: any) {
      Alert.alert('Assign failed', err.message ?? 'Unknown error');
    }
  };

  const filteredStudents = (eligible.data ?? []).filter((s) =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.student_number.includes(searchTerm)
  );

  const s = styles(colors);

  if (detail.isError) return <ErrorState title="Could not load activity" onRetry={detail.refetch} />;
  if (!act && detail.isLoading) return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title="Activity" showBack />
      <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
        {Array.from({ length: 6 }).map((_, i) => <ListItemSkeleton key={i} />)}
      </View>
    </SafeAreaView>
  );
  if (!act) return <ErrorState title="Activity not found" />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title={act.name} showBack />
      <ScrollView contentContainerStyle={s.content}>

        <Card style={s.infoCard}>
          <View style={s.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <ThemedText style={s.infoText}>{DAYS[act.day_of_week]} · {act.start_time ?? '—'} – {act.end_time ?? '—'}</ThemedText>
          </View>
          {act.location ? (
            <View style={s.infoRow}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <ThemedText style={s.infoText}>{act.location}</ThemedText>
            </View>
          ) : null}
          <View style={s.infoRow}>
            <Ionicons name="people-outline" size={16} color={colors.textMuted} />
            <ThemedText style={s.infoText}>{assigned.length} / {act.capacity} assigned</ThemedText>
          </View>
          {waitlisted.length > 0 && (
            <View style={s.infoRow}>
              <Ionicons name="time-outline" size={16} color="#F59E0B" />
              <ThemedText style={[s.infoText, { color: '#F59E0B' }]}>{waitlisted.length} on waitlist</ThemedText>
            </View>
          )}
          {act.eca_activity_patrons?.length > 0 && (
            <View style={s.infoRow}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <ThemedText style={s.infoText}>
                Patrons: {act.eca_activity_patrons.map((p) => `${p.staff?.full_name ?? ''}${p.is_primary ? ' ★' : ''}`).join(', ')}
              </ThemedText>
            </View>
          )}
        </Card>

        <View style={s.actionRow}>
          <View style={{ flex: 1 }}>
            <Button
              label={runAlloc.isPending ? 'Running…' : 'Run Allocation'}
              onPress={() => runAlloc.mutate(act.category_id)}
              disabled={runAlloc.isPending}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Manual Assign"
              onPress={() => setManualSheet(true)}
              variant="secondary"
            />
          </View>
        </View>

        <ThemedText style={s.sectionTitle}>Assigned ({assigned.length})</ThemedText>
        {assignments.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} />)
          : assigned.length === 0
            ? <EmptyState icon="people-outline" title="No students assigned" description="Run allocation or manually assign students." />
            : assigned.map((a) => (
                <View key={a.id} style={s.studentRow}>
                  <Avatar name={a.students?.full_name ?? ''} photoUrl={a.students?.photo_url ?? null} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <ThemedText style={s.studentName}>{a.students?.full_name}</ThemedText>
                    <ThemedText style={s.studentSub}>
                      #{a.students?.student_number}
                      {a.assigned_from_choice_rank ? ` · Choice #${a.assigned_from_choice_rank}` : ' · Manual'}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => handleWithdraw(a.id, a.students?.full_name ?? '')}
                    style={[s.smallBtn, { backgroundColor: '#FEE2E2' }]}
                  >
                    <ThemedText style={[s.smallBtnText, { color: '#991B1B' }]}>Withdraw</ThemedText>
                  </Pressable>
                </View>
              ))
        }

        {waitlisted.length > 0 && (
          <>
            <ThemedText style={[s.sectionTitle, { marginTop: Spacing.lg }]}>Waitlisted ({waitlisted.length})</ThemedText>
            {waitlisted.map((a, i) => (
              <View key={a.id} style={s.studentRow}>
                <ThemedText style={s.waitlistPos}>{i + 1}</ThemedText>
                <Avatar name={a.students?.full_name ?? ''} photoUrl={a.students?.photo_url ?? null} size={36} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <ThemedText style={s.studentName}>{a.students?.full_name}</ThemedText>
                  <ThemedText style={s.studentSub}>#{a.students?.student_number}</ThemedText>
                </View>
                <Pressable
                  onPress={() => handleWithdraw(a.id, a.students?.full_name ?? '')}
                  style={[s.smallBtn, { backgroundColor: '#FEF3C7' }]}
                >
                  <ThemedText style={[s.smallBtnText, { color: '#92400E' }]}>Remove</ThemedText>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={manualSheet} onClose={() => setManualSheet(false)} title="Manual Assign">
        <View style={s.searchWrap}>
          <FormField
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search student…"
            iconLeft="search-outline"
          />
        </View>
        <ScrollView style={{ maxHeight: 400 }}>
          {filteredStudents.map((stu) => (
            <Pressable key={stu.id} style={s.studentRow} onPress={() => handleManualAssign(stu.id)}>
              <Avatar name={stu.full_name} photoUrl={null} size={32} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ThemedText style={s.studentName}>{stu.full_name}</ThemedText>
                <ThemedText style={s.studentSub}>#{stu.student_number}</ThemedText>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={colors.brand.primary} />
            </Pressable>
          ))}
          {filteredStudents.length === 0 && (
            <EmptyState icon="search-outline" title="No matching students" />
          )}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.background },
  content:      { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },
  infoCard:     { gap: 6 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText:     { fontSize: 14, color: colors.textMuted },
  actionRow:    { flexDirection: 'row', gap: Spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  studentRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  studentName:  { fontWeight: '600' },
  studentSub:   { fontSize: 12, color: colors.textMuted },
  waitlistPos:  { width: 24, textAlign: 'center', fontWeight: '700', color: colors.textMuted },
  smallBtn:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { fontSize: 12, fontWeight: '600' },
  searchWrap:   { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
});
