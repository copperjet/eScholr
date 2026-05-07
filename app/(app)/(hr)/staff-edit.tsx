import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, FormField, DatePickerField,
  Card, SectionHeader, ErrorState, Skeleton, Avatar,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { supabase } from '../../../lib/supabase';
import { useStaffDetail, useUpdateStaff, type StaffUpsert } from '../../../hooks/useStaffRecords';

const PHOTO_BUCKET = 'staff-documents'; // reuse same bucket, subfolder photos/

export default function HRStaffEdit() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: staff, isLoading, isError, refetch } = useStaffDetail(staffId ?? '', schoolId);
  const updateMutation = useUpdateStaff(schoolId);

  const [form, setForm]       = useState<StaffUpsert>({});
  const [dirty, setDirty]     = useState(false);
  const [photoUri, setPhotoUri]   = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    if (staff) {
      setForm({
        full_name:                  staff.full_name,
        email:                      staff.email,
        phone:                      staff.phone ?? '',
        department:                 staff.department ?? '',
        position:                   staff.position ?? '',
        status:                     staff.status,
        staff_type:                 staff.staff_type ?? undefined,
        employment_type:            staff.employment_type ?? undefined,
        hire_date:                  staff.hire_date ?? undefined,
        contract_start:             staff.contract_start ?? undefined,
        contract_end:               staff.contract_end ?? undefined,
        dob:                        staff.dob ?? undefined,
        gender:                     staff.gender ?? undefined,
        national_id:                staff.national_id ?? '',
        tax_id:                     staff.tax_id ?? '',
        address:                    staff.address ?? '',
        emergency_contact_name:     staff.emergency_contact_name ?? '',
        emergency_contact_phone:    staff.emergency_contact_phone ?? '',
        emergency_contact_relation: staff.emergency_contact_relation ?? '',
        pay_type:                   staff.pay_type ?? undefined,
        base_salary:                staff.base_salary ?? undefined,
        hourly_rate:                staff.hourly_rate ?? undefined,
        currency:                   staff.currency ?? 'USD',
        bank_name:                  staff.bank_name ?? '',
        bank_account_number:        staff.bank_account_number ?? '',
        bank_branch:                staff.bank_branch ?? '',
        photo_url:                  staff.photo_url ?? undefined,
      });
    }
  }, [staff]);

  const set = (key: keyof StaffUpsert, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to update staff photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setDirty(true);
    }
  };

  const uploadPhoto = async (): Promise<string | undefined> => {
    if (!photoUri || !staffId) return undefined;
    setPhotoUploading(true);
    try {
      const path = `${schoolId}/photos/${staffId}_${Date.now()}.jpg`;
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const { error: upErr } = await (supabase as any).storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = (supabase as any).storage.from(PHOTO_BUCKET).getPublicUrl(path);
      return urlData.publicUrl as string;
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSave = async () => {
    if (!staffId) return;
    try {
      let patch = { ...form };
      if (photoUri) {
        const url = await uploadPhoto();
        if (url) patch = { ...patch, photo_url: url };
      }
      await updateMutation.mutateAsync({ staffId, patch });
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Please try again.');
    }
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Edit Staff" showBack />
        <ErrorState title="Could not load staff" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const saving = updateMutation.isPending || photoUploading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Edit Staff" showBack />

      {isLoading ? (
        <View style={{ padding: Spacing.screen, gap: Spacing.base }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} radius={Radius.lg} />)}
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* ── Photo ─────────────────────────────────────────── */}
          <View style={styles.photoRow}>
            <Avatar
              name={form.full_name ?? ''}
              photoUrl={photoUri ?? (form.photo_url ?? null)}
              size={80}
            />
            <Pressable
              onPress={pickPhoto}
              style={[styles.photoBtn, { backgroundColor: colors.brand.primary + '18', borderColor: colors.brand.primary }]}
            >
              <Ionicons name="camera-outline" size={16} color={colors.brand.primary} />
              <ThemedText style={{ color: colors.brand.primary, fontSize: 13, fontWeight: '600', marginLeft: 4 }}>
                {photoUri ? 'Change Photo' : 'Upload Photo'}
              </ThemedText>
            </Pressable>
          </View>

          <SectionHeader title="Basic Info" />
          <Card style={styles.card}>
            <FormField label="Full Name"  value={form.full_name ?? ''}    onChangeText={(v) => set('full_name', v)} />
            <FormField label="Email"      value={form.email ?? ''}        onChangeText={(v) => set('email', v)}     keyboardType="email-address" autoCapitalize="none" />
            <FormField label="Phone"      value={form.phone ?? ''}        onChangeText={(v) => set('phone', v)}     keyboardType="phone-pad" />
            <FormField label="Department" value={form.department ?? ''}   onChangeText={(v) => set('department', v)} />
            <FormField label="Position"   value={form.position ?? ''}     onChangeText={(v) => set('position', v)} />
            <FormField
              label="Status"
              value={form.status ?? 'active'}
              onChangeText={(v) => set('status', v)}
              placeholder="active · inactive"
              autoCapitalize="none"
            />
            <FormField
              label="Staff Type"
              value={form.staff_type ?? ''}
              onChangeText={(v) => set('staff_type', v || undefined)}
              placeholder="teacher · support · substitute · administrator"
              autoCapitalize="none"
            />
            <FormField
              label="Employment Type"
              value={form.employment_type ?? ''}
              onChangeText={(v) => set('employment_type', v || undefined)}
              placeholder="full_time · part_time · contract · substitute"
              autoCapitalize="none"
            />
          </Card>

          <SectionHeader title="Dates" />
          <Card style={styles.card}>
            <DatePickerField label="Hire Date"      value={form.hire_date ?? ''}       onChange={(v) => set('hire_date', v)} />
            <DatePickerField label="Contract Start" value={form.contract_start ?? ''}  onChange={(v) => set('contract_start', v)} />
            <DatePickerField label="Contract End"   value={form.contract_end ?? ''}    onChange={(v) => set('contract_end', v)} />
            <DatePickerField label="Date of Birth"  value={form.dob ?? ''}             onChange={(v) => set('dob', v)} />
          </Card>

          <SectionHeader title="Personal" />
          <Card style={styles.card}>
            <FormField
              label="Gender"
              value={form.gender ?? ''}
              onChangeText={(v) => set('gender', v || undefined)}
              placeholder="male · female · other · prefer_not_to_say"
              autoCapitalize="none"
            />
            <FormField label="National ID"       value={form.national_id ?? ''}            onChangeText={(v) => set('national_id', v)} />
            <FormField label="Tax ID"            value={form.tax_id ?? ''}                 onChangeText={(v) => set('tax_id', v)} />
            <FormField label="Address"           value={form.address ?? ''}                onChangeText={(v) => set('address', v)} textarea />
            <FormField label="Emergency Contact" value={form.emergency_contact_name ?? ''}    onChangeText={(v) => set('emergency_contact_name', v)} />
            <FormField label="Emergency Phone"   value={form.emergency_contact_phone ?? ''}   onChangeText={(v) => set('emergency_contact_phone', v)} keyboardType="phone-pad" />
            <FormField label="Relationship"      value={form.emergency_contact_relation ?? ''} onChangeText={(v) => set('emergency_contact_relation', v)} />
          </Card>

          <SectionHeader title="Pay & Banking" />
          <Card style={styles.card}>
            <FormField
              label="Pay Type"
              value={form.pay_type ?? ''}
              onChangeText={(v) => set('pay_type', v || undefined)}
              placeholder="salary · hourly"
              autoCapitalize="none"
            />
            <FormField label="Currency"       value={form.currency ?? 'USD'}              onChangeText={(v) => set('currency', v)} />
            <FormField label="Base Salary"    value={form.base_salary?.toString() ?? ''}  onChangeText={(v) => set('base_salary', v ? parseFloat(v) : undefined)} keyboardType="decimal-pad" />
            <FormField label="Hourly Rate"    value={form.hourly_rate?.toString() ?? ''}  onChangeText={(v) => set('hourly_rate', v ? parseFloat(v) : undefined)} keyboardType="decimal-pad" />
            <FormField label="Bank Name"      value={form.bank_name ?? ''}                onChangeText={(v) => set('bank_name', v)} />
            <FormField label="Account Number" value={form.bank_account_number ?? ''}      onChangeText={(v) => set('bank_account_number', v)} />
            <FormField label="Branch"         value={form.bank_branch ?? ''}              onChangeText={(v) => set('bank_branch', v)} />
          </Card>

          <View style={styles.btnRow}>
            <Button
              label="Save Changes"
              onPress={handleSave}
              loading={saving}
              disabled={!dirty || saving}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1 },
  card:     { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, gap: Spacing.md },
  btnRow:   { paddingHorizontal: Spacing.screen, paddingTop: Spacing.lg, paddingBottom: Spacing.xl },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, paddingHorizontal: Spacing.screen, paddingVertical: Spacing.base },
  photoBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
});
