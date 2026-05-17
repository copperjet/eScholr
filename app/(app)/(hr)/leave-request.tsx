import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Button, Card, FormField, DatePickerField } from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { useCreateLeaveRequest } from '../../../hooks/useLeave';

const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'compassionate', label: 'Compassionate Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other' },
];

export default function HRLeaveRequest() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;

  const [leaveType, setLeaveType] = useState('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const createLeave = useCreateLeaveRequest(schoolId);

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      Alert.alert('Error', 'Please enter start and end dates');
      return;
    }
    if (!staffId) {
      Alert.alert('Error', 'Staff ID not found');
      return;
    }

    try {
      await createLeave.mutateAsync({
        staffId,
        leaveType: leaveType as any,
        startDate,
        endDate,
        reason: reason || undefined,
      });
      Alert.alert('Success', 'Leave request submitted', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText variant="h4">Request Leave</ThemedText>
        </View>

        <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}>
          <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>LEAVE TYPE</ThemedText>
          {LEAVE_TYPES.map((type) => (
            <Button
              key={type.value}
              label={type.label}
              variant={leaveType === type.value ? 'primary' : 'ghost'}
              onPress={() => setLeaveType(type.value)}
              style={{ marginBottom: Spacing.xs }}
            />
          ))}

          <DatePickerField
            label="Start Date"
            value={startDate}
            onChange={setStartDate}
            placeholder="Select start date"
            minimumDate={new Date().toISOString().slice(0, 10)}
          />

          <DatePickerField
            label="End Date"
            value={endDate}
            onChange={setEndDate}
            placeholder="Select end date"
            minimumDate={startDate || new Date().toISOString().slice(0, 10)}
          />

          <FormField
            label="Reason (Optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Brief reason..."
            textarea
          />

          <Button
            label={createLeave.isPending ? 'Submitting...' : 'Submit Request'}
            onPress={handleSubmit}
            disabled={createLeave.isPending}
            style={{ marginTop: Spacing.lg }}
          />
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
