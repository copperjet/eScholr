/**
 * Public Admissions Form — /(public)/admissions?code=XXXX
 * Unauthenticated parents can submit an admission application.
 * School is resolved via the `code` query param.
 */
import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TextInput, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { ThemedText, Button } from '../../components/ui';
import { Spacing, Radius, Shadow } from '../../constants/Typography';

interface SchoolInfo {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
}

const GENDERS = ['male', 'female', 'other'] as const;
const RELATIONSHIPS = ['parent', 'guardian', 'other'] as const;

export default function PublicAdmissionsForm() {
  const { code } = useLocalSearchParams<{ code: string }>();

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [studentName, setStudentName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<string>('');
  const [nationality, setNationality] = useState('');
  const [gradeApplying, setGradeApplying] = useState('');
  const [previousSchool, setPreviousSchool] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [relationship, setRelationship] = useState<string>('parent');
  const [notes, setNotes] = useState('');

  // Resolve school from code
  useEffect(() => {
    if (!code) { setLoading(false); return; }
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from('schools')
        .select('id, name, logo_url, primary_color')
        .eq('code', code.toUpperCase())
        .eq('subscription_status', 'active')
        .maybeSingle();
      if (err || !data) {
        setError('School not found. Please check the code and try again.');
      } else {
        setSchool(data as SchoolInfo);
      }
      setLoading(false);
    })();
  }, [code]);

  const brandColor = school?.primary_color ?? '#0F5132';

  const validate = (): string | null => {
    if (!studentName.trim()) return 'Student name is required.';
    if (!parentName.trim()) return 'Parent/guardian name is required.';
    if (!parentPhone.trim() && !parentEmail.trim()) return 'Please provide a phone number or email so we can reach you.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert('Missing Information', validationError);
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertErr } = await (supabase as any)
        .from('admissions_applications')
        .insert({
          school_id: school!.id,
          student_name: studentName.trim(),
          date_of_birth: dob.trim() || null,
          gender: gender || null,
          nationality: nationality.trim() || null,
          grade_applying_for: gradeApplying.trim() || null,
          previous_school: previousSchool.trim() || null,
          parent_name: parentName.trim(),
          parent_email: parentEmail.trim().toLowerCase() || null,
          parent_phone: parentPhone.trim() || null,
          parent_relationship: relationship || 'parent',
          notes: notes.trim() || null,
        });
      if (insertErr) throw insertErr;
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Submission Failed', e.message || 'Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / Error states ──
  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F5132" />
          <ThemedText style={{ marginTop: Spacing.md }}>Looking up school...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!code || error || !school) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <Ionicons name="school-outline" size={64} color="#9CA3AF" />
          <ThemedText variant="h4" style={{ marginTop: Spacing.lg, textAlign: 'center' }}>
            {error || 'No school code provided'}
          </ThemedText>
          <ThemedText variant="body" color="muted" style={{ marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.xl }}>
            Please use the admissions link provided by the school. The URL should contain a school code.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success state ──
  if (submitted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <View style={[styles.successCircle, { backgroundColor: brandColor + '20' }]}>
            <Ionicons name="checkmark-circle" size={64} color={brandColor} />
          </View>
          <ThemedText variant="h4" style={{ marginTop: Spacing.xl, textAlign: 'center' }}>
            Application Submitted!
          </ThemedText>
          <ThemedText variant="body" color="muted" style={{ marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.xl }}>
            Thank you for applying to {school.name}. The admissions team will review your application and contact you soon.
          </ThemedText>
          <Button
            title="Submit Another Application"
            onPress={() => {
              setSubmitted(false);
              setStudentName(''); setDob(''); setGender(''); setNationality('');
              setGradeApplying(''); setPreviousSchool(''); setParentName('');
              setParentEmail(''); setParentPhone(''); setNotes('');
            }}
            variant="outline"
            style={{ marginTop: Spacing['2xl'] }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ──
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* School header */}
          <View style={[styles.schoolHeader, { backgroundColor: brandColor }]}>
            {school.logo_url ? (
              <Image source={{ uri: school.logo_url }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={[styles.logoPlaceholder, { backgroundColor: '#ffffff30' }]}>
                <Ionicons name="school" size={32} color="#fff" />
              </View>
            )}
            <ThemedText style={styles.schoolName}>{school.name}</ThemedText>
            <ThemedText style={styles.schoolSubtitle}>Admissions Application Form</ThemedText>
          </View>

          {/* Student section */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Student Information</ThemedText>

            <ThemedText style={styles.label}>Full Name *</ThemedText>
            <TextInput
              style={styles.input}
              value={studentName}
              onChangeText={setStudentName}
              placeholder="e.g. John Banda"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />

            <ThemedText style={styles.label}>Date of Birth</ThemedText>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={setDob}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />

            <ThemedText style={styles.label}>Gender</ThemedText>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <Button
                  key={g}
                  title={g.charAt(0).toUpperCase() + g.slice(1)}
                  variant={gender === g ? 'primary' : 'outline'}
                  size="sm"
                  onPress={() => setGender(g)}
                  style={{ marginRight: Spacing.xs }}
                />
              ))}
            </View>

            <ThemedText style={styles.label}>Nationality</ThemedText>
            <TextInput
              style={styles.input}
              value={nationality}
              onChangeText={setNationality}
              placeholder="e.g. Zambian"
              placeholderTextColor="#9CA3AF"
            />

            <ThemedText style={styles.label}>Grade Applying For</ThemedText>
            <TextInput
              style={styles.input}
              value={gradeApplying}
              onChangeText={setGradeApplying}
              placeholder="e.g. Grade 8, Reception, Year 10"
              placeholderTextColor="#9CA3AF"
            />

            <ThemedText style={styles.label}>Previous School</ThemedText>
            <TextInput
              style={styles.input}
              value={previousSchool}
              onChangeText={setPreviousSchool}
              placeholder="Current or previous school name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Parent section */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Parent / Guardian Information</ThemedText>

            <ThemedText style={styles.label}>Full Name *</ThemedText>
            <TextInput
              style={styles.input}
              value={parentName}
              onChangeText={setParentName}
              placeholder="e.g. Mary Banda"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />

            <ThemedText style={styles.label}>Relationship</ThemedText>
            <View style={styles.chipRow}>
              {RELATIONSHIPS.map((r) => (
                <Button
                  key={r}
                  title={r.charAt(0).toUpperCase() + r.slice(1)}
                  variant={relationship === r ? 'primary' : 'outline'}
                  size="sm"
                  onPress={() => setRelationship(r)}
                  style={{ marginRight: Spacing.xs }}
                />
              ))}
            </View>

            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput
              style={styles.input}
              value={parentEmail}
              onChangeText={setParentEmail}
              placeholder="email@example.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <ThemedText style={styles.label}>Phone *</ThemedText>
            <TextInput
              style={styles.input}
              value={parentPhone}
              onChangeText={setParentPhone}
              placeholder="+260 97X XXX XXX"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          {/* Additional info */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Additional Information</ThemedText>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional information, special requirements, or questions..."
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>

          {/* Submit */}
          <View style={styles.submitSection}>
            <Button
              title={submitting ? 'Submitting...' : 'Submit Application'}
              onPress={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: brandColor }}
            />
            <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: Spacing.md }}>
              By submitting this form, you consent to {school.name} processing the information provided for admissions purposes.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  scroll: { paddingBottom: 40 },
  schoolHeader: {
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
  },
  logo: { width: 72, height: 72, borderRadius: 36, marginBottom: Spacing.md },
  logoPlaceholder: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  schoolName: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  schoolSubtitle: { fontSize: 14, color: '#ffffffcc', marginTop: 4 },
  section: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xl,
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    ...Shadow.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: Spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: '#111827',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  submitSection: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing['2xl'],
    marginBottom: Spacing.xl,
  },
  successCircle: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center',
  },
});
