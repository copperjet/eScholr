/**
 * Application Detail — /(app)/(frontdesk)/application-detail?id=
 * Full application review: info, documents, status, assign reviewer, Convert to Student.
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  Alert, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Badge, BottomSheet, Skeleton, ErrorState, ScreenHeader,
  Button, Card,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import { useQueryClient, useMutation } from '@tanstack/react-query';

const STATUS_META: Record<string, { label: string; preset: any; color: string }> = {
  pending:   { label: 'Pending',   preset: 'neutral', color: '#9CA3AF' },
  submitted: { label: 'Submitted', preset: 'info',    color: Colors.semantic.info },
  reviewing: { label: 'Reviewing', preset: 'warning', color: Colors.semantic.warning },
  accepted:  { label: 'Accepted',  preset: 'success', color: Colors.semantic.success },
  waitlist:  { label: 'Waitlisted', preset: 'warning', color: '#F59E0B' },
  rejected:  { label: 'Rejected',  preset: 'danger',  color: Colors.semantic.error },
  enrolled:  { label: 'Enrolled',  preset: 'success', color: Colors.semantic.success },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:   ['reviewing', 'accepted', 'rejected'],
  submitted: ['reviewing', 'accepted', 'rejected'],
  reviewing: ['accepted', 'waitlist', 'rejected'],
  accepted:  ['enrolled', 'rejected'],
  waitlist:  ['accepted', 'rejected'],
};

function useApplicationDetail(id: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['admissions', 'detail', id],
    enabled: !!id && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from('admissions_applications')
        .select('*')
        .eq('id', id)
        .eq('school_id', schoolId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

export default function ApplicationDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';
  const qc = useQueryClient();

  const { data: app, isLoading, isError, refetch } = useApplicationDetail(id ?? null, schoolId);

  const [statusSheet, setStatusSheet] = useState(false);
  const [convertSheet, setConvertSheet] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);

  // Update status mutation
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await (supabase as any)
        .from('admissions_applications')
        .update({ status, reviewed_by: user?.staffId, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      setStatusSheet(false);
      qc.invalidateQueries({ queryKey: ['admissions'] });
    },
    onError: (e: any) => { haptics.error(); Alert.alert('Error', e.message); },
  });

  // Convert to student mutation
  const convertMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).functions.invoke('convert-application-to-student', {
        body: {
          applicationId: id,
          sendInvite,
          inviteEmail: app?.parent_email,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      haptics.success();
      setConvertSheet(false);
      qc.invalidateQueries({ queryKey: ['admissions'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      Alert.alert(
        'Enrolled!',
        `${app?.full_name || app?.student_name} has been enrolled.\nStudent #: ${data?.student?.student_number ?? 'assigned'}`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    },
    onError: (e: any) => { haptics.error(); Alert.alert('Conversion failed', e.message); },
  });

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Application" showBack />
        <ErrorState title="Could not load application" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const statusMeta = app ? (STATUS_META[app.status] ?? STATUS_META.pending) : null;
  const nextStatuses = app ? (STATUS_TRANSITIONS[app.status] ?? []) : [];
  const canConvert = app?.status === 'accepted' && !app?.converted_student_id;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Application" showBack />

      {isLoading || !app ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
          <Skeleton width="100%" height={80} radius={Radius.lg} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header card */}
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="h3">{app.full_name ?? app.student_name}</ThemedText>
                {app.reference_no && (
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
                    Ref: {app.reference_no}
                  </ThemedText>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setStatusSheet(true)}
                style={[styles.statusChip, { backgroundColor: statusMeta!.color + '18', borderColor: statusMeta!.color + '40' }]}
              >
                <ThemedText variant="caption" style={{ color: statusMeta!.color, fontWeight: '700' }}>
                  {statusMeta!.label}
                </ThemedText>
                <Ionicons name="chevron-down" size={11} color={statusMeta!.color} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>

            <View style={styles.infoList}>
              {app.grade_applying_for && <InfoRow icon="school-outline" label="Grade" value={app.grade_applying_for} colors={colors} />}
              {app.date_of_birth && <InfoRow icon="calendar-outline" label="DOB" value={app.date_of_birth} colors={colors} />}
              {app.gender && <InfoRow icon="male-female-outline" label="Gender" value={app.gender} colors={colors} />}
              {app.nationality && <InfoRow icon="flag-outline" label="Nationality" value={app.nationality} colors={colors} />}
              {app.previous_school && <InfoRow icon="business-outline" label="Prev School" value={app.previous_school} colors={colors} />}
              <InfoRow
                icon="time-outline"
                label="Submitted"
                value={app.submitted_at ? format(parseISO(app.submitted_at), 'dd MMM yyyy') : format(parseISO(app.created_at), 'dd MMM yyyy')}
                colors={colors}
              />
            </View>
          </Card>

          {/* Parent / Guardian */}
          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>PARENT / GUARDIAN</ThemedText>
            <InfoRow icon="person-outline" label="Name" value={`${app.parent_name} (${app.parent_relationship ?? 'parent'})`} colors={colors} />
            {app.parent_phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${app.parent_phone}`)}>
                <InfoRow icon="call-outline" label="Phone" value={app.parent_phone} colors={colors} tappable />
              </TouchableOpacity>
            )}
            {app.parent_email && (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${app.parent_email}`)}>
                <InfoRow icon="mail-outline" label="Email" value={app.parent_email} colors={colors} tappable />
              </TouchableOpacity>
            )}
          </Card>

          {/* Notes */}
          {app.notes && (
            <Card style={styles.card}>
              <ThemedText variant="label" color="muted" style={styles.sectionLabel}>NOTES</ThemedText>
              <ThemedText variant="body" color="secondary">{app.notes}</ThemedText>
            </Card>
          )}

          {/* Convert to student CTA */}
          {canConvert && (
            <TouchableOpacity
              onPress={() => setConvertSheet(true)}
              style={[styles.convertBtn, { backgroundColor: Colors.semantic.success }]}
            >
              <Ionicons name="person-add-outline" size={20} color="#fff" />
              <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 10 }}>
                Convert to Student
              </ThemedText>
            </TouchableOpacity>
          )}

          {app.converted_student_id && (
            <Card style={[styles.card, { borderColor: Colors.semantic.success + '60', borderWidth: 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.semantic.success} />
                <ThemedText variant="body" style={{ color: Colors.semantic.success, fontWeight: '600' }}>
                  Enrolled — Student record created
                </ThemedText>
              </View>
            </Card>
          )}
        </ScrollView>
      )}

      {/* Status change sheet */}
      <BottomSheet visible={statusSheet} onClose={() => setStatusSheet(false)} title="Update Status" snapHeight={320}>
        <View style={{ gap: Spacing.sm }}>
          {nextStatuses.length === 0 ? (
            <ThemedText variant="body" color="muted" style={{ textAlign: 'center' }}>
              No further status transitions available.
            </ThemedText>
          ) : (
            nextStatuses.map((s) => {
              const meta = STATUS_META[s] ?? STATUS_META.pending;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => updateStatus.mutate(s)}
                  disabled={updateStatus.isPending}
                  style={[styles.statusOption, { backgroundColor: meta.color + '12', borderColor: meta.color + '40' }]}
                >
                  <ThemedText variant="body" style={{ flex: 1, color: meta.color, fontWeight: '600' }}>{meta.label}</ThemedText>
                  <Ionicons name="chevron-forward" size={16} color={meta.color} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </BottomSheet>

      {/* Convert confirmation sheet */}
      <BottomSheet visible={convertSheet} onClose={() => setConvertSheet(false)} title="Convert to Student" snapHeight={360}>
        {app && (
          <View style={{ gap: Spacing.md }}>
            <ThemedText variant="body" color="secondary">
              This will create a student record for{' '}
              <ThemedText variant="body" style={{ fontWeight: '700' }}>
                {app.full_name ?? app.student_name}
              </ThemedText>{' '}
              and mark this application as enrolled.
            </ThemedText>

            <View style={[styles.summaryBox, { backgroundColor: colors.surfaceSecondary }]}>
              <InfoRow icon="school-outline" label="Grade" value={app.grade_applying_for ?? 'Not specified'} colors={colors} />
              <InfoRow icon="person-outline" label="Parent" value={app.parent_name} colors={colors} />
              {app.parent_phone && <InfoRow icon="call-outline" label="Phone" value={app.parent_phone} colors={colors} />}
            </View>

            {app.parent_email && (
              <TouchableOpacity
                onPress={() => setSendInvite(v => !v)}
                style={styles.checkRow}
              >
                <View style={[styles.checkbox, { borderColor: colors.brand.primary, backgroundColor: sendInvite ? colors.brand.primary : 'transparent' }]}>
                  {sendInvite && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: Spacing.sm }}>
                  Send login invite to parent ({app.parent_email})
                </ThemedText>
              </TouchableOpacity>
            )}

            <Button
              label={convertMutation.isPending ? 'Creating student…' : 'Confirm Enrollment'}
              variant="primary"
              fullWidth
              loading={convertMutation.isPending}
              onPress={() => convertMutation.mutate()}
            />
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, colors, tappable }: {
  icon: string; label: string; value: string; colors: any; tappable?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={15} color={colors.textMuted} />
      <ThemedText variant="caption" color="muted" style={{ marginLeft: 8, width: 80 }}>{label}</ThemedText>
      <ThemedText
        variant="bodySm"
        style={[{ flex: 1 }, tappable && { color: colors.brand.primary, textDecorationLine: 'underline' }]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  scroll:     { padding: Spacing.base, gap: Spacing.base, paddingBottom: 48 },
  card:       { padding: Spacing.base },
  headerRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  statusChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1,
  },
  infoList:   { marginTop: Spacing.md, gap: Spacing.xs },
  infoRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  sectionLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: Spacing.sm },
  convertBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
  },
  statusOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  summaryBox: { padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.xs },
  checkRow:   { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing.xs },
  checkbox:   {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
});
