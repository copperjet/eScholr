/**
 * Student Edit (FD) — /(app)/(frontdesk)/student-edit?id=
 * FD can create (id omitted) or edit an existing student (id provided).
 * No delete capability — admin-only at RLS layer.
 */
import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, ScreenHeader, FormField, Button, Skeleton,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

type Gender = 'male' | 'female' | 'other';
const GENDERS: Gender[] = ['male', 'female', 'other'];

function useStreams(schoolId: string) {
  return useQuery({
    queryKey: ['streams-filter', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('streams').select('id, name, grades(id, name)')
        .eq('school_id', schoolId).order('name');
      return (data ?? []) as any[];
    },
  });
}

function useStudentForEdit(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['students', 'detail', studentId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await (supabase as any)
        .from('students')
        .select('id, full_name, student_number, date_of_birth, gender, stream_id, status')
        .eq('id', studentId).eq('school_id', schoolId).single();
      if (error) throw error;
      return data as any;
    },
  });
}

export default function FDStudentEditScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const schoolId = user?.schoolId ?? '';
  const qc = useQueryClient();
  const isNew = !id;

  const { data: student, isLoading: studentLoading } = useStudentForEdit(id ?? null, schoolId);
  const { data: streams = [], isLoading: streamsLoading } = useStreams(schoolId);

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [streamId, setStreamId] = useState('');

  useEffect(() => {
    if (student) {
      setFullName(student.full_name ?? '');
      setDob(student.date_of_birth ?? '');
      setGender(student.gender ?? '');
      setStreamId(student.stream_id ?? '');
    }
  }, [student]);

  const canSave = fullName.trim().length >= 2 && streamId;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: fullName.trim(),
        date_of_birth: dob.trim() || null,
        gender: gender || null,
        stream_id: streamId,
      };
      if (isNew) {
        const { data, error } = await (supabase as any)
          .from('students')
          .insert({ ...payload, school_id: schoolId, status: 'active' })
          .select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await (supabase as any)
          .from('students')
          .update(payload)
          .eq('id', id).eq('school_id', schoolId)
          .select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      haptics.success();
      qc.invalidateQueries({ queryKey: ['students'] });
      if (isNew) {
        router.replace({ pathname: '/(app)/(frontdesk)/student-detail' as any, params: { id: data.id } });
      } else {
        router.back();
      }
    },
    onError: (e: any) => {
      haptics.error();
      Alert.alert('Error', e.message ?? 'Could not save student.');
    },
  });

  const isLoading = (!isNew && studentLoading) || streamsLoading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={isNew ? 'Add Student' : 'Edit Student'} showBack />

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="100%" height={48} radius={Radius.md} />
          <Skeleton width="100%" height={48} radius={Radius.md} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <FormField
              label="Full Name *"
              placeholder="e.g. John Banda"
              value={fullName}
              onChangeText={setFullName}
              iconLeft="person-outline"
              autoFocus={isNew}
            />

            <FormField
              label="Date of Birth"
              placeholder="YYYY-MM-DD"
              value={dob}
              onChangeText={setDob}
              iconLeft="calendar-outline"
              keyboardType="numeric"
            />

            <ThemedText style={styles.label}>Gender</ThemedText>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(prev => prev === g ? '' : g)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: gender === g ? colors.brand.primary : colors.surfaceSecondary,
                      borderColor: gender === g ? colors.brand.primary : colors.border,
                    },
                  ]}
                >
                  <ThemedText
                    variant="caption"
                    style={{ color: gender === g ? '#fff' : colors.textPrimary, fontWeight: '600' }}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <ThemedText style={styles.label}>Class / Stream *</ThemedText>
            <View style={styles.streamList}>
              {streams.map((s: any) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setStreamId(s.id)}
                  style={[
                    styles.streamOption,
                    {
                      backgroundColor: streamId === s.id ? colors.brand.primary + '12' : colors.surfaceSecondary,
                      borderColor: streamId === s.id ? colors.brand.primary : colors.border,
                    },
                  ]}
                >
                  <ThemedText
                    variant="body"
                    style={{ flex: 1, color: streamId === s.id ? colors.brand.primary : colors.textPrimary, fontWeight: streamId === s.id ? '700' : '400' }}
                  >
                    {s.grades?.name} · {s.name}
                  </ThemedText>
                  {streamId === s.id && <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            <Button
              label={saveMutation.isPending ? 'Saving…' : isNew ? 'Add Student' : 'Save Changes'}
              variant="primary"
              fullWidth
              loading={saveMutation.isPending}
              disabled={!canSave}
              onPress={() => saveMutation.mutate()}
              style={{ marginTop: Spacing.xl }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.base, paddingBottom: 48, gap: Spacing.md },
  label:        { fontSize: 13, fontWeight: '600', marginTop: Spacing.md, marginBottom: Spacing.xs },
  chipRow:      { flexDirection: 'row', gap: Spacing.sm },
  chip:         { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1 },
  streamList:   { gap: Spacing.xs },
  streamOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
});
