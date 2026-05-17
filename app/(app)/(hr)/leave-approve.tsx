import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Button, Card, Badge, FormField, ScreenHeader } from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { useLeaveRequestDetail, useApproveLeaveRequest, useRejectLeaveRequest } from '../../../hooks/useLeave';

export default function HRLeaveApprove() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;

  const { data: leave, isLoading } = useLeaveRequestDetail(id ?? null);
  const approveMutation = useApproveLeaveRequest(schoolId);
  const rejectMutation = useRejectLeaveRequest(schoolId);
  const [rejectionReason, setRejectionReason] = useState('');

  const acting = approveMutation.isPending || rejectMutation.isPending;

  const handleApprove = async () => {
    if (!staffId || !id) return;
    try {
      await approveMutation.mutateAsync({ requestId: id, approverStaffId: staffId });
      Alert.alert('Approved', 'Leave request approved', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleReject = async () => {
    if (!staffId || !id) return;
    try {
      await rejectMutation.mutateAsync({ requestId: id, rejectionReason: rejectionReason || 'No reason provided' });
      Alert.alert('Rejected', 'Leave request rejected', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={{ padding: Spacing.lg, gap: 12 }}>
          <View style={{ height: 20, width: '60%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
          <View style={{ height: 16, width: '80%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
          <View style={{ height: 16, width: '70%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
        </View>
      </SafeAreaView>
    );
  }

  const l: any = leave;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Leave Request" showBack />
      <ScrollView showsVerticalScrollIndicator={false}>

        <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}>
          <ThemedText variant="label" color="muted">STAFF</ThemedText>
          <ThemedText style={{ fontWeight: '600', marginBottom: Spacing.md }}>
            {l?.staff?.full_name ?? '—'}
          </ThemedText>

          <ThemedText variant="label" color="muted">LEAVE TYPE</ThemedText>
          <ThemedText style={{ fontWeight: '600', marginBottom: Spacing.md }}>
            {l?.leave_type ?? '—'}
          </ThemedText>

          <ThemedText variant="label" color="muted">DATES</ThemedText>
          <ThemedText style={{ fontWeight: '600', marginBottom: Spacing.md }}>
            {l?.start_date} to {l?.end_date}
          </ThemedText>

          <ThemedText variant="label" color="muted">DAYS</ThemedText>
          <ThemedText style={{ fontWeight: '600', marginBottom: Spacing.md }}>
            {l?.days_requested ?? '—'}
          </ThemedText>

          <ThemedText variant="label" color="muted">REASON</ThemedText>
          <ThemedText style={{ marginBottom: Spacing.md }}>
            {l?.reason ?? 'No reason provided'}
          </ThemedText>

          <ThemedText variant="label" color="muted">STATUS</ThemedText>
          <Badge
            label={l?.status ?? 'pending'}
            preset={l?.status === 'approved' ? 'success' : l?.status === 'rejected' ? 'error' : 'warning'}
            style={{ alignSelf: 'flex-start', marginBottom: Spacing.lg }}
          />

          {l?.status === 'pending' && (
            <>
              <Button
                label={acting ? 'Processing...' : 'Approve'}
                onPress={handleApprove}
                disabled={acting}
                style={{ marginBottom: Spacing.md }}
              />
              <FormField
                label="Rejection Reason (Optional)"
                value={rejectionReason}
                onChangeText={setRejectionReason}
                placeholder="Reason for rejection..."
                textarea
              />
              <Button
                label={acting ? 'Processing...' : 'Reject'}
                variant="ghost"
                onPress={handleReject}
                disabled={acting}
                style={{ marginTop: Spacing.md }}
              />
            </>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
});
