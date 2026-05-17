import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ScreenHeader, Button, FormField, DatePickerField, Card, SectionHeader,
  KeyboardAwareScrollView,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { supabase } from '../../../lib/supabase';
import { useCreateStaff } from '../../../hooks/useStaffRecords';
import { useFocusChain } from '../../../hooks/useFocusChain';
import { useMutationHaptics } from '../../../hooks/useMutationHaptics';

export default function HRStaffAdd() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const createMutation = useCreateStaff(schoolId);
  useMutationHaptics(createMutation);
  const chain = useFocusChain(7);

  const [fullName, setFullName]             = useState('');
  const [email, setEmail]                   = useState('');
  const [phone, setPhone]                   = useState('');
  const [department, setDepartment]         = useState('');
  const [position, setPosition]             = useState('');
  const [staffType, setStaffType]           = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [hireDate, setHireDate]             = useState('');
  const [contractStart, setContractStart]   = useState('');
  const [contractEnd, setContractEnd]       = useState('');
  const [inviting, setInviting]             = useState(false);

  const valid = fullName.trim().length > 0 && email.trim().length > 0;

  const handleCreate = async () => {
    if (!valid) {
      Alert.alert('Required', 'Full name and email are required.');
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        full_name:       fullName.trim(),
        email:           email.trim().toLowerCase(),
        phone:           phone || undefined,
        department:      department || undefined,
        position:        position || undefined,
        staff_type:      (staffType as any) || undefined,
        employment_type: (employmentType as any) || undefined,
        hire_date:       hireDate || undefined,
        contract_start:  contractStart || undefined,
        contract_end:    contractEnd || undefined,
      });

      // Optionally send login invite immediately
      Alert.alert(
        'Staff Created',
        `${fullName.trim()} has been added. Send login invite now?`,
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () =>
              router.replace({
                pathname: '/(app)/(hr)/staff-detail' as any,
                params: { staffId: created.id, staffName: fullName.trim() },
              }),
          },
          {
            text: 'Send Invite',
            onPress: () => sendInvite(created.id),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Could not create staff', err.message ?? 'Please try again.');
    }
  };

  const sendInvite = async (staffId: string) => {
    setInviting(true);
    try {
      const session = await supabase.auth.getSession();
      const token   = session.data.session?.access_token;
      const res = await (supabase as any).functions.invoke('invite-user', {
        body: {
          staff_id:  staffId,
          email:     email.trim().toLowerCase(),
          full_name: fullName.trim(),
          school_id: schoolId,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      const { temp_password } = res.data ?? {};
      Alert.alert(
        'Invite Sent',
        temp_password
          ? `Temp password: ${temp_password}\n\nShare this with the staff member.`
          : 'Invitation sent.',
        [{ text: 'OK', onPress: () =>
          router.replace({
            pathname: '/(app)/(hr)/staff-detail' as any,
            params: { staffId, staffName: fullName.trim() },
          }),
        }]
      );
    } catch (err: any) {
      Alert.alert('Invite failed', err.message ?? 'Staff was created but invite could not be sent.');
      router.replace({
        pathname: '/(app)/(hr)/staff-detail' as any,
        params: { staffId, staffName: fullName.trim() },
      });
    } finally {
      setInviting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Add Staff Member" showBack />

      <KeyboardAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        <SectionHeader title="Required" />
        <Card style={styles.card}>
          <FormField
            ref={chain.ref(0)}
            label="Full Name *" value={fullName} onChangeText={setFullName} autoCapitalize="words"
            textContentType="name" autoComplete="name"
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={chain.focusNext(0)}
          />
          <FormField
            ref={chain.ref(1)}
            label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
            textContentType="emailAddress" autoComplete="email"
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={chain.focusNext(1)}
          />
        </Card>

        <SectionHeader title="Role & Employment" />
        <Card style={styles.card}>
          <FormField
            ref={chain.ref(2)}
            label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
            textContentType="telephoneNumber" autoComplete="tel"
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={chain.focusNext(2)}
          />
          <FormField
            ref={chain.ref(3)}
            label="Department" value={department} onChangeText={setDepartment}
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={chain.focusNext(3)}
          />
          <FormField
            ref={chain.ref(4)}
            label="Position" value={position} onChangeText={setPosition}
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={chain.focusNext(4)}
          />
          <FormField
            ref={chain.ref(5)}
            label="Staff Type"
            value={staffType}
            onChangeText={setStaffType}
            placeholder="teacher · support · substitute · administrator"
            autoCapitalize="none"
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={chain.focusNext(5)}
          />
          <FormField
            ref={chain.ref(6)}
            label="Employment Type"
            value={employmentType}
            onChangeText={setEmploymentType}
            placeholder="full_time · part_time · contract · substitute"
            autoCapitalize="none"
            returnKeyType="done"
          />
        </Card>

        <SectionHeader title="Dates" />
        <Card style={styles.card}>
          <DatePickerField label="Hire Date"      value={hireDate}      onChange={setHireDate} />
          <DatePickerField label="Contract Start" value={contractStart} onChange={setContractStart} />
          <DatePickerField label="Contract End"   value={contractEnd}   onChange={setContractEnd} />
        </Card>

        <View style={styles.btnRow}>
          <Button
            label="Create Staff Record"
            onPress={handleCreate}
            loading={createMutation.isPending || inviting}
            disabled={!valid || createMutation.isPending || inviting}
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  card:   { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, gap: Spacing.md },
  btnRow: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.lg, paddingBottom: Spacing.xl },
});
