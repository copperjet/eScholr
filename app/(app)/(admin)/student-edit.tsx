/**
 * Edit Student — admin edits existing student record.
 * Route: /(app)/(admin)/student-edit?student_id=
 */
import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Avatar, Skeleton } from '../../../components/ui';
import { useStudentDetail, useUpdateStudent, useUploadStudentPhoto } from '../../../hooks/useStudents';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type Gender = 'male' | 'female' | 'other';

function useStreams(schoolId: string) {
  return useQuery({
    queryKey: ['streams-filter', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('streams')
        .select('id, name, grades(id, name)')
        .eq('school_id', schoolId)
        .order('name');
      return (data ?? []) as any[];
    },
  });
}

export default function StudentEditScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { student_id } = useLocalSearchParams<{ student_id: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: student, isLoading } = useStudentDetail(student_id ?? null, schoolId);
  const { data: streams = [] } = useStreams(schoolId);

  const updateMutation = useUpdateStudent(schoolId);
  const uploadMutation = useUploadStudentPhoto(schoolId);

  const [fullName, setFullName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [streamId, setStreamId] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');

  useEffect(() => {
    if (student) {
      setFullName(student.full_name);
      setStudentNumber(student.student_number);
      setStreamId(student.stream_id);
      setDob(student.date_of_birth ?? '');
      setGender((student.gender as Gender) ?? '');
      setEmergencyName(student.emergency_contact_name ?? '');
      setEmergencyPhone(student.emergency_contact_phone ?? '');
      setIsActive(student.is_active);
    }
  }, [student]);

  const canSave = fullName.trim().length >= 2 && studentNumber.trim().length >= 1 && streamId;

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
      exif: false,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPhotoBase64(result.assets[0].base64);
      setPhotoMime(result.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  const handleSave = async () => {
    if (!canSave || !student_id) return;
    haptics.medium();
    try {
      await updateMutation.mutateAsync({
        studentId: student_id,
        fullName,
        studentNumber,
        streamId,
        dateOfBirth: dob || null,
        gender: (gender as Gender) || null,
        emergencyContactName: emergencyName || null,
        emergencyContactPhone: emergencyPhone || null,
        isActive,
      });

      if (photoBase64) {
        await uploadMutation.mutateAsync({ studentId: student_id, base64: photoBase64, mimeType: photoMime });
      }

      haptics.success();
      router.back();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e.message ?? 'Could not save changes.');
    }
  };

  const handleDeactivate = () => {
    Alert.alert(
      isActive ? 'Deactivate Student' : 'Reactivate Student',
      isActive
        ? `Deactivating ${fullName} will remove them from all active registers and lists. You can reactivate them later.`
        : `Reactivate ${fullName}? They will appear in active student lists again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isActive ? 'Deactivate' : 'Reactivate', style: isActive ? 'destructive' : 'default', onPress: () => setIsActive(!isActive) },
      ],
    );
  };

  const isSaving = updateMutation.isPending || uploadMutation.isPending;

  const photoUrl = photoBase64
    ? `data:${photoMime};base64,${photoBase64}`
    : student?.photo_url ?? null;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={{ padding: Spacing.base, gap: Spacing.md, marginTop: 60 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={52} radius={Radius.md} />)}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Edit Student</ThemedText>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave || isSaving}
          style={[styles.saveBtn, { backgroundColor: canSave && !isSaving ? colors.brand.primary : colors.border }]}
        >
          <ThemedText variant="bodySm" style={{ color: '#fff', fontWeight: '700' }}>
            {isSaving ? 'Saving…' : 'Save'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Photo */}
          <TouchableOpacity onPress={pickPhoto} style={styles.photoPicker}>
            <Avatar name={fullName || '?'} photoUrl={photoUrl} size={80} />
            <View style={[styles.cameraOverlay, { backgroundColor: colors.brand.primary }]}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <Section label="BASIC INFO" colors={colors}>
            <Field label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="Student's full name" colors={colors} />
            <Field label="Student Number *" value={studentNumber} onChangeText={setStudentNumber} placeholder="e.g. 2026001" colors={colors} />
            <Field label="Date of Birth" value={dob} onChangeText={setDob} placeholder="yyyy-mm-dd" colors={colors} />
            <View>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>GENDER</ThemedText>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {(['male', 'female', 'other'] as Gender[]).map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGender(g === gender ? '' : g)}
                    style={[styles.genderChip, { backgroundColor: gender === g ? colors.brand.primary + '15' : colors.surfaceSecondary, borderColor: gender === g ? colors.brand.primary : colors.border }]}
                  >
                    <ThemedText variant="caption" style={{ color: gender === g ? colors.brand.primary : colors.textMuted, fontWeight: gender === g ? '700' : '400', textTransform: 'capitalize' }}>{g}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Section>

          <Section label="CLASS" colors={colors}>
            <View>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>STREAM *</ThemedText>
              <View style={{ gap: Spacing.xs }}>
                {streams.map((s: any) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setStreamId(s.id)}
                    style={[styles.streamOption, { backgroundColor: streamId === s.id ? colors.brand.primary + '12' : colors.surfaceSecondary, borderColor: streamId === s.id ? colors.brand.primary : colors.border }]}
                  >
                    <ThemedText variant="bodySm" style={{ flex: 1, color: streamId === s.id ? colors.brand.primary : colors.textPrimary, fontWeight: streamId === s.id ? '700' : '400' }}>
                      {s.grades?.name} · {s.name}
                    </ThemedText>
                    {streamId === s.id && <Ionicons name="checkmark-circle" size={16} color={colors.brand.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Section>

          <Section label="EMERGENCY CONTACT" colors={colors}>
            <Field label="Contact Name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Parent / guardian name" colors={colors} />
            <Field label="Contact Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="+254 7xx xxx xxx" keyboardType="phone-pad" colors={colors} />
          </Section>

          {/* Active status */}
          <View style={[styles.statusRow, { backgroundColor: colors.surface, borderColor: isActive ? colors.border : Colors.semantic.error + '40' }]}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>
                {isActive ? 'Active Student' : 'Inactive Student'}
              </ThemedText>
              <ThemedText variant="caption" color="muted">
                {isActive ? 'Appears in all registers and lists.' : 'Hidden from registers and lists.'}
              </ThemedText>
            </View>
            <TouchableOpacity onPress={handleDeactivate}>
              <View style={[styles.statusToggle, { backgroundColor: isActive ? Colors.semantic.success + '15' : Colors.semantic.error + '15', borderColor: isActive ? Colors.semantic.success + '40' : Colors.semantic.error + '40' }]}>
                <ThemedText variant="caption" style={{ color: isActive ? Colors.semantic.success : Colors.semantic.error, fontWeight: '700', fontSize: 11 }}>
                  {isActive ? 'ACTIVE' : 'INACTIVE'}
                </ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ label, children, colors }: any) {
  return (
    <View style={[secStyles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ThemedText variant="label" color="muted" style={secStyles.label}>{label}</ThemedText>
      <View style={{ gap: Spacing.md }}>{children}</View>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, colors }: any) {
  return (
    <View>
      <ThemedText variant="label" color="muted" style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
      />
    </View>
  );
}

const secStyles = StyleSheet.create({
  box: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.base, marginBottom: Spacing.md },
  label: { fontSize: 10, letterSpacing: 0.5, marginBottom: Spacing.md },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  saveBtn: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  scroll: { padding: Spacing.base, paddingBottom: 40 },
  photoPicker: { alignItems: 'center', marginBottom: Spacing.base, position: 'relative', alignSelf: 'center' },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  genderChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  streamOption: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.md },
  statusToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
});
