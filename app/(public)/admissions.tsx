/**
 * Public Admissions Wizard — /(public)/admissions?code=XXXX
 * 5-step wizard: Student → Previous School → Parent → Documents → Review & Submit
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, TextInput, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator, Alert, Image, TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { ThemedText, Button } from '../../components/ui';
import { Spacing, Radius, Shadow } from '../../constants/Typography';

// ─── types ────────────────────────────────────────────────────────────────────

interface SchoolInfo {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  admissions_required_docs: string[];
  public_admissions_documents_max_mb: number;
}

interface UploadedDoc {
  path: string;
  name: string;
  size: number;
  mime: string;
}

interface FormState {
  // Step 1 — Student
  studentName: string;
  dob: string;
  gender: string;
  nationality: string;
  gradeApplying: string;
  // Step 2 — Previous School
  previousSchool: string;
  lastGrade: string;
  reasonLeaving: string;
  // Step 3 — Parent
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship: string;
  // Step 4 — Documents
  documents: Record<string, UploadedDoc | null>;
}

const STEP_TITLES = ['Student', 'Prev. School', 'Parent', 'Documents', 'Review'];
const GENDERS = ['male', 'female', 'other'] as const;
const RELATIONSHIPS = ['parent', 'guardian', 'other'] as const;

const DOC_LABELS: Record<string, string> = {
  birth_cert: 'Birth Certificate',
  prev_school_report: 'School Report',
  immunization: 'Immunization Record',
};

// ─── session id (stable across wizard steps) ─────────────────────────────────

const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── component ───────────────────────────────────────────────────────────────

export default function PublicAdmissionsWizard() {
  const { code } = useLocalSearchParams<{ code: string }>();

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [referenceNo, setReferenceNo] = useState('');
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<FormState>({
    studentName: '', dob: '', gender: '', nationality: '', gradeApplying: '',
    previousSchool: '', lastGrade: '', reasonLeaving: '',
    parentName: '', parentEmail: '', parentPhone: '', relationship: 'parent',
    documents: {},
  });

  // Resolve school from code
  useEffect(() => {
    if (!code) { setLoading(false); return; }
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from('schools')
        .select('id, name, logo_url, primary_color, admissions_required_docs, public_admissions_documents_max_mb')
        .eq('code', code.toUpperCase())
        .eq('subscription_status', 'active')
        .maybeSingle();
      if (err || !data) {
        setError('School not found. Check the link and try again.');
      } else {
        setSchool(data);
        // Init document slots from required docs
        const slots: Record<string, UploadedDoc | null> = {};
        (data.admissions_required_docs ?? ['birth_cert']).forEach((k: string) => { slots[k] = null; });
        setForm(f => ({ ...f, documents: slots }));
      }
      setLoading(false);
    })();
  }, [code]);

  const brandColor = school?.primary_color ?? '#0F5132';
  const maxMb = school?.public_admissions_documents_max_mb ?? 10;

  // ── validation per step ──────────────────────────────────────────────────────

  const stepValid = (): boolean => {
    switch (step) {
      case 0: return form.studentName.trim().length >= 2;
      case 1: return true; // Optional step
      case 2: return form.parentName.trim().length >= 2 && (!!form.parentPhone.trim() || !!form.parentEmail.trim());
      case 3: {
        // All required docs must be uploaded
        const required = school?.admissions_required_docs ?? ['birth_cert'];
        return required.every(k => !!form.documents[k]);
      }
      default: return true;
    }
  };

  // ── document upload ──────────────────────────────────────────────────────────

  const handleDocPick = async (docKey: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      const maxBytes = maxMb * 1024 * 1024;
      if (asset.size && asset.size > maxBytes) {
        Alert.alert('File too large', `Maximum file size is ${maxMb} MB.`);
        return;
      }

      setUploading(u => ({ ...u, [docKey]: true }));

      // Get signed upload URL
      const { data: urlData, error: urlErr } = await (supabase as any).functions.invoke('admissions-upload-url', {
        body: {
          sessionId: SESSION_ID,
          docKey,
          fileName: asset.name,
          contentType: asset.mimeType ?? 'application/octet-stream',
          fileSize: asset.size ?? 0,
        },
      });

      if (urlErr) throw urlErr;

      // Fetch file as blob and upload
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();

      const uploadRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': asset.mimeType ?? 'application/octet-stream' },
        body: blob,
      });

      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

      setForm(f => ({
        ...f,
        documents: {
          ...f.documents,
          [docKey]: {
            path: urlData.uploadPath,
            name: asset.name,
            size: asset.size ?? 0,
            mime: asset.mimeType ?? 'application/octet-stream',
          },
        },
      }));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(u => ({ ...u, [docKey]: false }));
    }
  };

  // ── submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error: insertErr } = await (supabase as any)
        .from('admissions_applications')
        .insert({
          school_id: school!.id,
          full_name: form.studentName.trim(),
          date_of_birth: form.dob.trim() || null,
          gender: form.gender || null,
          nationality: form.nationality.trim() || null,
          grade_applying_for: form.gradeApplying.trim() || null,
          previous_school: form.previousSchool.trim() || null,
          parent_name: form.parentName.trim(),
          parent_email: form.parentEmail.trim().toLowerCase() || null,
          parent_phone: form.parentPhone.trim() || null,
          parent_relationship: form.relationship || 'parent',
          documents: form.documents,
          status: 'pending',
        })
        .select('reference_no')
        .single();

      if (insertErr) throw insertErr;
      setReferenceNo(data?.reference_no ?? '');
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Submission Failed', e.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F5132" />
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
            Use the admissions link provided by the school.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.center}>
          <View style={[styles.successCircle, { backgroundColor: brandColor + '20' }]}>
            <Ionicons name="checkmark-circle" size={64} color={brandColor} />
          </View>
          <ThemedText variant="h4" style={{ marginTop: Spacing.xl, textAlign: 'center' }}>
            Application Submitted!
          </ThemedText>
          {referenceNo ? (
            <View style={[styles.refBox, { backgroundColor: brandColor + '12', borderColor: brandColor + '40' }]}>
              <ThemedText variant="caption" color="muted">Reference Number</ThemedText>
              <ThemedText variant="h3" style={{ color: brandColor, letterSpacing: 1 }}>{referenceNo}</ThemedText>
              <ThemedText variant="caption" color="muted" style={{ textAlign: 'center' }}>
                Save this number to track your application
              </ThemedText>
            </View>
          ) : null}
          <ThemedText variant="body" color="muted" style={{ marginTop: Spacing.lg, textAlign: 'center', paddingHorizontal: Spacing.xl }}>
            Thank you for applying to {school.name}. The admissions team will review your application and contact you soon.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#f8fafb' }]}>
      <StatusBar barStyle="dark-content" />

      {/* School header */}
      <View style={[styles.schoolHeader, { backgroundColor: brandColor }]}>
        {school.logo_url ? (
          <Image source={{ uri: school.logo_url }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={[styles.logoPlaceholder, { backgroundColor: '#ffffff30' }]}>
            <Ionicons name="school" size={28} color="#fff" />
          </View>
        )}
        <ThemedText style={styles.schoolName}>{school.name}</ThemedText>

        {/* Progress dots */}
        <View style={styles.progressRow}>
          {STEP_TITLES.map((title, i) => (
            <View key={i} style={styles.stepDot}>
              <View style={[
                styles.dot,
                i < step && { backgroundColor: '#ffffff', borderColor: '#ffffff' },
                i === step && { backgroundColor: '#ffffff', borderColor: '#ffffff', transform: [{ scale: 1.3 }] },
                i > step && { backgroundColor: 'transparent', borderColor: '#ffffff80' },
              ]} />
              {i < STEP_TITLES.length - 1 && (
                <View style={[styles.dotLine, { backgroundColor: i < step ? '#ffffff' : '#ffffff40' }]} />
              )}
            </View>
          ))}
        </View>

        <ThemedText style={styles.stepLabel}>
          Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
        </ThemedText>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Step 0: Student info ── */}
          {step === 0 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Student Information</ThemedText>

              <ThemedText style={styles.label}>Full Name *</ThemedText>
              <TextInput style={styles.input} value={form.studentName} onChangeText={v => setForm(f => ({ ...f, studentName: v }))} placeholder="e.g. John Banda" placeholderTextColor="#9CA3AF" autoCapitalize="words" autoFocus />

              <ThemedText style={styles.label}>Date of Birth</ThemedText>
              <TextInput style={styles.input} value={form.dob} onChangeText={v => setForm(f => ({ ...f, dob: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" keyboardType="numeric" />

              <ThemedText style={styles.label}>Gender</ThemedText>
              <View style={styles.chipRow}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setForm(f => ({ ...f, gender: f.gender === g ? '' : g }))}
                    style={[styles.chip, { backgroundColor: form.gender === g ? brandColor : '#F9FAFB', borderColor: form.gender === g ? brandColor : '#E5E7EB' }]}
                  >
                    <ThemedText style={{ color: form.gender === g ? '#fff' : '#374151', fontSize: 13, fontWeight: '600' }}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <ThemedText style={styles.label}>Nationality</ThemedText>
              <TextInput style={styles.input} value={form.nationality} onChangeText={v => setForm(f => ({ ...f, nationality: v }))} placeholder="e.g. Zambian" placeholderTextColor="#9CA3AF" />

              <ThemedText style={styles.label}>Grade Applying For</ThemedText>
              <TextInput style={styles.input} value={form.gradeApplying} onChangeText={v => setForm(f => ({ ...f, gradeApplying: v }))} placeholder="e.g. Grade 8, Reception, Year 10" placeholderTextColor="#9CA3AF" />
            </View>
          )}

          {/* ── Step 1: Previous school ── */}
          {step === 1 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Previous School (Optional)</ThemedText>

              <ThemedText style={styles.label}>School Name</ThemedText>
              <TextInput style={styles.input} value={form.previousSchool} onChangeText={v => setForm(f => ({ ...f, previousSchool: v }))} placeholder="Current or previous school name" placeholderTextColor="#9CA3AF" />

              <ThemedText style={styles.label}>Last Grade / Year</ThemedText>
              <TextInput style={styles.input} value={form.lastGrade} onChangeText={v => setForm(f => ({ ...f, lastGrade: v }))} placeholder="e.g. Grade 7" placeholderTextColor="#9CA3AF" />

              <ThemedText style={styles.label}>Reason for Leaving</ThemedText>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={form.reasonLeaving} onChangeText={v => setForm(f => ({ ...f, reasonLeaving: v }))} placeholder="Optional" placeholderTextColor="#9CA3AF" multiline />
            </View>
          )}

          {/* ── Step 2: Parent / Guardian ── */}
          {step === 2 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Parent / Guardian</ThemedText>

              <ThemedText style={styles.label}>Full Name *</ThemedText>
              <TextInput style={styles.input} value={form.parentName} onChangeText={v => setForm(f => ({ ...f, parentName: v }))} placeholder="e.g. Mary Banda" placeholderTextColor="#9CA3AF" autoCapitalize="words" />

              <ThemedText style={styles.label}>Relationship</ThemedText>
              <View style={styles.chipRow}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setForm(f => ({ ...f, relationship: r }))}
                    style={[styles.chip, { backgroundColor: form.relationship === r ? brandColor : '#F9FAFB', borderColor: form.relationship === r ? brandColor : '#E5E7EB' }]}
                  >
                    <ThemedText style={{ color: form.relationship === r ? '#fff' : '#374151', fontSize: 13, fontWeight: '600' }}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <ThemedText style={styles.label}>Phone *</ThemedText>
              <TextInput style={styles.input} value={form.parentPhone} onChangeText={v => setForm(f => ({ ...f, parentPhone: v }))} placeholder="+260 97X XXX XXX" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />

              <ThemedText style={styles.label}>Email</ThemedText>
              <TextInput style={styles.input} value={form.parentEmail} onChangeText={v => setForm(f => ({ ...f, parentEmail: v }))} placeholder="email@example.com" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" />
            </View>
          )}

          {/* ── Step 3: Documents ── */}
          {step === 3 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Documents</ThemedText>
              <ThemedText style={styles.hint}>
                Max {maxMb} MB per file. PDF, JPG, or PNG only.
              </ThemedText>

              {Object.keys(form.documents).map(docKey => {
                const doc = form.documents[docKey];
                const isUploading = uploading[docKey];
                const required = school.admissions_required_docs?.includes(docKey);

                return (
                  <View key={docKey} style={styles.docSlot}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.label}>
                        {DOC_LABELS[docKey] ?? docKey}{required ? ' *' : ''}
                      </ThemedText>
                      {doc ? (
                        <View style={styles.docUploaded}>
                          <Ionicons name="document-text" size={16} color={brandColor} />
                          <ThemedText variant="caption" style={{ color: brandColor, marginLeft: 6, flex: 1 }} numberOfLines={1}>
                            {doc.name}
                          </ThemedText>
                          <TouchableOpacity onPress={() => setForm(f => ({ ...f, documents: { ...f.documents, [docKey]: null } }))}>
                            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleDocPick(docKey)}
                          disabled={isUploading}
                          style={[styles.docPicker, { borderColor: brandColor + '60' }]}
                        >
                          {isUploading ? (
                            <ActivityIndicator size="small" color={brandColor} />
                          ) : (
                            <>
                              <Ionicons name="cloud-upload-outline" size={20} color={brandColor} />
                              <ThemedText style={{ color: brandColor, marginLeft: 8, fontSize: 14 }}>
                                Tap to upload
                              </ThemedText>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Step 4: Review & Submit ── */}
          {step === 4 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Review & Submit</ThemedText>

              <ReviewRow label="Student Name" value={form.studentName} />
              {form.dob && <ReviewRow label="Date of Birth" value={form.dob} />}
              {form.gender && <ReviewRow label="Gender" value={form.gender} />}
              {form.nationality && <ReviewRow label="Nationality" value={form.nationality} />}
              {form.gradeApplying && <ReviewRow label="Grade" value={form.gradeApplying} />}
              {form.previousSchool && <ReviewRow label="Prev. School" value={form.previousSchool} />}

              <View style={styles.reviewDivider} />
              <ReviewRow label="Parent Name" value={form.parentName} />
              <ReviewRow label="Relationship" value={form.relationship} />
              {form.parentPhone && <ReviewRow label="Phone" value={form.parentPhone} />}
              {form.parentEmail && <ReviewRow label="Email" value={form.parentEmail} />}

              {Object.keys(form.documents).length > 0 && (
                <>
                  <View style={styles.reviewDivider} />
                  {Object.entries(form.documents).map(([key, doc]) => (
                    <ReviewRow key={key} label={DOC_LABELS[key] ?? key} value={doc ? doc.name : 'Not uploaded'} />
                  ))}
                </>
              )}

              <Button
                label={submitting ? 'Submitting…' : 'Submit Application'}
                variant="primary"
                loading={submitting}
                disabled={submitting}
                fullWidth
                onPress={handleSubmit}
                style={{ backgroundColor: brandColor, marginTop: Spacing.xl }}
              />
              <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: Spacing.md }}>
                By submitting, you consent to {school.name} processing this information for admissions purposes.
              </ThemedText>
            </View>
          )}

          {/* ── Navigation buttons ── */}
          {step < 4 && (
            <View style={styles.navRow}>
              {step > 0 && (
                <Button
                  label="Back"
                  variant="outline"
                  onPress={() => setStep(s => s - 1)}
                  style={{ flex: 1 }}
                />
              )}
              <Button
                label="Next"
                variant="primary"
                onPress={() => setStep(s => s + 1)}
                disabled={!stepValid()}
                style={[{ flex: 1 }, { backgroundColor: brandColor }]}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <ThemedText style={styles.reviewLabel}>{label}</ThemedText>
      <ThemedText variant="body" style={{ flex: 1, textAlign: 'right' }}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1 },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  scroll:         { paddingBottom: 48 },
  schoolHeader:   { paddingVertical: Spacing.xl, paddingHorizontal: Spacing.base, alignItems: 'center' },
  logo:           { width: 56, height: 56, borderRadius: 28, marginBottom: Spacing.sm },
  logoPlaceholder: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  schoolName:     { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  progressRow:    { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg },
  stepDot:        { flexDirection: 'row', alignItems: 'center' },
  dot:            { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  dotLine:        { width: 24, height: 2, marginHorizontal: 2 },
  stepLabel:      { fontSize: 12, color: '#ffffffcc', marginTop: Spacing.sm },
  section:        {
    marginHorizontal: Spacing.base, marginTop: Spacing.xl,
    backgroundColor: '#fff', borderRadius: Radius.lg, padding: Spacing.base, ...Shadow.sm,
  },
  sectionTitle:   { fontSize: 16, fontWeight: '700', marginBottom: Spacing.md },
  label:          { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: Spacing.md, marginBottom: 6 },
  hint:           { fontSize: 12, color: '#9CA3AF', marginBottom: Spacing.sm },
  input:          {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10, fontSize: 15, color: '#111827',
  },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 4 },
  chip:           {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  docSlot:        { marginTop: Spacing.md },
  docPicker:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md,
    paddingVertical: Spacing.md, backgroundColor: '#FAFAFA',
  },
  docUploaded:    {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0FDF4', borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  navRow:         {
    flexDirection: 'row', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginTop: Spacing.xl, marginBottom: Spacing.xl,
  },
  reviewRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing.xs },
  reviewLabel:    { fontSize: 13, fontWeight: '600', color: '#6B7280', width: 110 },
  reviewDivider:  { height: 1, backgroundColor: '#E5E7EB', marginVertical: Spacing.sm },
  successCircle:  { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  refBox:         {
    marginTop: Spacing.xl, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1,
    alignItems: 'center', gap: Spacing.xs, minWidth: 220,
  },
});
