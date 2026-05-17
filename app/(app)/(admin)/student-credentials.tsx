/**
 * Student Credentials — Generate login accounts for students.
 * Route: /(app)/(admin)/student-credentials
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Button, Card, FormField, ScreenHeader,
  Badge, EmptyState, ListItem,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { useCreateStudentAuth, useGenerateStudentEmail } from '../../../hooks/useStudentAuth';

function useStudentDetail(studentId: string, schoolId: string) {
  return useQuery({
    queryKey: ['student-detail', studentId],
    enabled: !!studentId && !!schoolId,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('students')
        .select('id, full_name, student_number, email, auth_user_id, streams(grades(name))')
        .eq('id', studentId)
        .eq('school_id', schoolId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

function useSchoolConfig(schoolId: string) {
  return useQuery({
    queryKey: ['school-config-email-domain', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('school_configs')
        .select('config_value')
        .eq('school_id', schoolId)
        .eq('config_key', 'student_email_domain')
        .maybeSingle();
      if (error) return null;
      return data ? { student_email_domain: data.config_value } : null;
    },
  });
}

export default function StudentCredentialsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: student, isLoading } = useStudentDetail(id ?? '', schoolId);
  const { data: config } = useSchoolConfig(schoolId);
  const createAuth = useCreateStudentAuth(schoolId);
  const generateEmail = useGenerateStudentEmail();

  const [email, setEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showTempPw, setShowTempPw] = useState(false);

  const hasAuth = !!student?.auth_user_id;
  const schoolDomain = config?.student_email_domain || 'students.school.edu';

  const suggestedEmail = student
    ? generateEmail(student.full_name, student.student_number, schoolDomain)
    : '';

  const handleGenerate = async () => {
    if (!student) return;
    const finalEmail = email.trim() || suggestedEmail;

    if (!finalEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setGenerating(true);
    const result = await createAuth.mutateAsync({
      studentId: student.id,
      email: finalEmail,
      fullName: student.full_name,
    });
    setGenerating(false);

    if (result.success) {
      setTempPassword(result.temp_password ?? null);
    } else {
      Alert.alert('Error', result.error || 'Failed to create account');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Student Credentials" showBack />
        <View style={{ padding: Spacing.screen, gap: 12 }}>
          <View style={{ height: 20, width: '50%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
          <View style={{ height: 16, width: '70%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Student Credentials" showBack />
        <EmptyState title="Student not found" description="The student record could not be loaded." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <ScreenHeader title="Student Credentials" showBack />

          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}>
            <ThemedText variant="h4" style={{ marginBottom: Spacing.md }}>
              {student.full_name}
            </ThemedText>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
              <ThemedText variant="label" color="muted" style={{ marginRight: Spacing.sm }}>
                STATUS:
              </ThemedText>
              {hasAuth ? (
                <Badge label="Active" preset="success" />
              ) : (
                <Badge label="No Login" preset="neutral" />
              )}
            </View>

            {hasAuth && !tempPassword ? (
              <>
                <ThemedText variant="label" color="muted">EMAIL</ThemedText>
                <ThemedText style={{ marginBottom: Spacing.lg }}>
                  {student.email || 'Email not recorded'}
                </ThemedText>

                <ThemedText variant="label" color="muted">AUTH USER ID</ThemedText>
                <ThemedText variant="caption" style={{ marginBottom: Spacing.lg }}>
                  {student.auth_user_id}
                </ThemedText>

                <Button
                  label="Reset Password"
                  variant="secondary"
                  onPress={() => Alert.alert('Info', 'Password reset email would be sent')}
                />
              </>
            ) : !tempPassword ? (
              <>
                <ThemedText variant="body" color="muted" style={{ marginBottom: Spacing.lg }}>
                  Create a login account for this student.
                </ThemedText>

                <FormField
                  label="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder={suggestedEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
                  Suggested: {suggestedEmail}
                </ThemedText>

                <Button
                  label={generating ? 'Creating...' : 'Create Login Account'}
                  onPress={handleGenerate}
                  disabled={generating}
                  style={{ marginTop: Spacing.lg }}
                />
              </>
            ) : null}
          </Card>

          {/* Temporary password card — shown immediately after account creation */}
          {tempPassword && (
            <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                <Ionicons name="key-outline" size={15} color={colors.brand.primary} />
                <ThemedText variant="label" color="muted" style={{ marginLeft: 6, flex: 1 }}>TEMPORARY PASSWORD</ThemedText>
                <TouchableOpacity onPress={() => setShowTempPw(v => !v)} hitSlop={8}>
                  <Ionicons name={showTempPw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                <ThemedText style={{ flex: 1, fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 2, color: colors.textPrimary }}>
                  {showTempPw ? tempPassword : '••••••••••••'}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      navigator.clipboard?.writeText(tempPassword);
                      Alert.alert('Copied', 'Temporary password copied to clipboard.');
                    } else {
                      Alert.alert('Temporary Password', tempPassword);
                    }
                  }}
                  hitSlop={8}
                  style={{ backgroundColor: colors.brand.primary, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 8 }}
                >
                  <ThemedText variant="label" style={{ color: '#fff', fontWeight: '700' }}>Copy</ThemedText>
                </TouchableOpacity>
              </View>
              <ThemedText variant="caption" color="muted">
                Share this with {student.full_name.split(' ')[0]}. They will be prompted to set a new password on first login.
              </ThemedText>
              <Button label="Done" onPress={() => router.back()} style={{ marginTop: Spacing.lg }} />
            </Card>
          )}

          {!hasAuth && !tempPassword && (
            <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.lg, backgroundColor: colors.surfaceSecondary }}>
              <ThemedText variant="label" color="muted">HOW IT WORKS</ThemedText>
              <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
                1. Enter the student&apos;s email{'\n'}
                2. We generate a temporary password{'\n'}
                3. Share the password with the student{'\n'}
                4. They log in and set a new password
              </ThemedText>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
