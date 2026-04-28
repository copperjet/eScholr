/**
 * Add Student — admin creates a new student record.
 * Route: /(app)/(admin)/student-add
 */
import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Avatar, ScreenHeader } from '../../../components/ui';
import { useCreateStudent, useUploadStudentPhoto } from '../../../hooks/useStudents';
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

function useActiveSemester(schoolId: string) {
  return useQuery({
    queryKey: ['active-semester', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('semesters')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });
}

function useNextStudentNumber(schoolId: string) {
  return useQuery({
    queryKey: ['next-student-number', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      // Get max numeric part of student_number (assuming format like 0001, 001, etc)
      const { data } = await db
        .from('students')
        .select('student_number')
        .eq('school_id', schoolId)
        .order('student_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return '0001';
      // Extract numeric part and increment
      const match = data.student_number.match(/(\d+)/);
      const maxNum = match ? parseInt(match[1], 10) : 0;
      return String(maxNum + 1).padStart(4, '0');
    },
  });
}

export default function StudentAddScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: streams = [] } = useStreams(schoolId);
  const { data: semester } = useActiveSemester(schoolId);
  const { data: nextNumber } = useNextStudentNumber(schoolId);

  const createMutation = useCreateStudent(schoolId);
  const uploadMutation = useUploadStudentPhoto(schoolId);

  const [fullName, setFullName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');

  // Auto-assign student number on mount
  useEffect(() => {
    if (nextNumber && !studentNumber) {
      setStudentNumber(nextNumber);
    }
  }, [nextNumber, studentNumber]);
  const [streamId, setStreamId] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');

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
    if (!canSave) return;
    haptics.medium();
    try {
      const student = await createMutation.mutateAsync({
        fullName,
        studentNumber,
        streamId,
        dateOfBirth: dob || undefined,
        gender: (gender as Gender) || undefined,
        emergencyContactName: emergencyName || undefined,
        emergencyContactPhone: emergencyPhone || undefined,
      });

      if (photoBase64 && student?.id) {
        await uploadMutation.mutateAsync({ studentId: student.id, base64: photoBase64, mimeType: photoMime });
      }

      haptics.success();
      Alert.alert('Student Added', `${fullName} has been added successfully.`, [
        { text: 'View Profile', onPress: () => router.replace({ pathname: '/(app)/student/[id]' as any, params: { id: student.id } }) },
        { text: 'Add Another', onPress: () => {
          setFullName(''); setStudentNumber(''); setStreamId('');
          setDob(''); setGender(''); setEmergencyName(''); setEmergencyPhone(''); setPhotoBase64(null);
        }},
      ]);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e.message ?? 'Could not save student. Try again.');
    }
  };

  const isSaving = createMutation.isPending || uploadMutation.isPending;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Add Student"
        showBack
        right={
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave || isSaving}
            style={[styles.headerSaveBtn, { backgroundColor: canSave && !isSaving ? colors.brand.primary : colors.border }]}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Photo picker */}
          <TouchableOpacity onPress={pickPhoto} style={styles.photoPicker}>
            {photoBase64 ? (
              <Avatar name={fullName || '?'} photoUrl={`data:${photoMime};base64,${photoBase64}`} size={80} />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
                <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>Add Photo</ThemedText>
              </View>
            )}
          </TouchableOpacity>

          <Section label="BASIC INFO">
            <Field label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="Student's full name" colors={colors} />
            <Field label="Student Number *" value={studentNumber} onChangeText={setStudentNumber} placeholder="e.g. 2026001" colors={colors} />
            <Field label="Date of Birth" value={dob} onChangeText={setDob} placeholder="yyyy-mm-dd" colors={colors} />
            <View>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>GENDER</ThemedText>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {(['male', 'female', 'other'] as Gender[]).map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGender(g)}
                    style={[styles.genderChip, { backgroundColor: gender === g ? colors.brand.primary + '15' : colors.surfaceSecondary, borderColor: gender === g ? colors.brand.primary : colors.border }]}
                  >
                    <ThemedText variant="caption" style={{ color: gender === g ? colors.brand.primary : colors.textMuted, fontWeight: gender === g ? '700' : '400', textTransform: 'capitalize' }}>
                      {g}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Section>

          <Section label="CLASS">
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

          <Section label="EMERGENCY CONTACT">
            <Field label="Contact Name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Parent / guardian name" colors={colors} />
            <Field label="Contact Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="+254 7xx xxx xxx" keyboardType="phone-pad" colors={colors} />
          </Section>

          {/* Spacer for bottom button */}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Sticky bottom Save */}
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave || isSaving}
            style={[styles.bottomSaveBtn, { backgroundColor: canSave && !isSaving ? colors.brand.primary : colors.border }]}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {isSaving ? 'Saving…' : 'Save Student'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[sectionStyles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ThemedText variant="label" color="muted" style={sectionStyles.label}>{label}</ThemedText>
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

const sectionStyles = StyleSheet.create({
  box: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.base, marginBottom: Spacing.md },
  label: { fontSize: 10, letterSpacing: 0.5, marginBottom: Spacing.md },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerSaveBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, padding: Spacing.base },
  bottomSaveBtn: { height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.base, paddingBottom: 100 },
  photoPicker: { alignItems: 'center', marginBottom: Spacing.base },
  photoPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed',
  },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  genderChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  streamOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
});
