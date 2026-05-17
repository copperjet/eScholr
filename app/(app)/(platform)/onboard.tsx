import React, { useState, useRef, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Pressable,
  TextInput, Animated, Alert, KeyboardAvoidingView, Platform,
  TouchableOpacity, Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { supabase } from '../../../lib/supabase';
import { haptics } from '../../../lib/haptics';
import { uploadSchoolLogoFile } from '../../../hooks/usePlatform';
import {
  ThemedText, Button, ProgressBar,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';

// ── Types ────────────────────────────────────────────────────────────────────

type SubscriptionPlan   = 'starter' | 'growth' | 'scale' | 'enterprise';
type SubscriptionStatus = 'active' | 'trial' | 'suspended' | 'cancelled';

interface SchoolForm {
  name: string;
  code: string;
  country: string;
  timezone: string;
  currency: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  logo_pending_base64: string | null;
  logo_pending_mime: string | null;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  admin_email: string;
  admin_name: string;
  admin_password: string;
}

const BLANK: SchoolForm = {
  name: '', code: '', country: 'Zambia', timezone: 'Africa/Lusaka', currency: 'ZMW',
  primary_color: '#1B2A4A', secondary_color: '#E8A020', logo_url: '',
  logo_pending_base64: null, logo_pending_mime: null,
  subscription_plan: 'growth', subscription_status: 'trial',
  admin_email: '', admin_name: '', admin_password: '',
};

const CREATE_STEPS = ['School Info', 'Branding', 'Subscription', 'Super Admin Account', 'Review'];
const EDIT_STEPS   = ['School Info', 'Branding', 'Subscription', 'Review'];

// ── Sub-components ────────────────────────────────────────────────────────────

function StepDots({ current, steps }: { current: number; steps: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dotsRow}>
      {steps.map((_, i) => (
        <View key={i} style={styles.dotWrap}>
          <View style={[
            styles.dot,
            {
              backgroundColor: i <= current ? colors.brand.primary : colors.border,
              width: i === current ? 28 : 8,
            },
          ]}>
            {i < current && <Ionicons name="checkmark" size={10} color="#fff" />}
          </View>
        </View>
      ))}
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const { colors } = useTheme();
  return (
    <ThemedText style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6, letterSpacing: 0.3 }}>
      {label.toUpperCase()}{required && <ThemedText style={{ color: '#DC2626' }}> *</ThemedText>}
    </ThemedText>
  );
}

function InlineInput({
  value, onChangeText, placeholder, autoCapitalize, keyboardType, secureTextEntry, maxLength,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  keyboardType?: any;
  secureTextEntry?: boolean;
  maxLength?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.inlineInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        style={{ flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 0 }}
      />
    </View>
  );
}

function SelectRow({
  label, options, value, onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (v: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <FieldLabel label={label} />
      <View style={styles.selectRow}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => { haptics.light(); onSelect(opt.value); }}
            style={[
              styles.selectChip,
              {
                backgroundColor: value === opt.value ? colors.brand.primary : colors.surfaceSecondary,
                borderColor: value === opt.value ? colors.brand.primary : colors.border,
              },
            ]}
          >
            <ThemedText style={{
              fontSize: 13, fontWeight: '600',
              color: value === opt.value ? '#fff' : colors.textPrimary,
            }}>
              {opt.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { colors } = useTheme();
  const PRESETS = [
    '#1B2A4A', '#0F5132', '#1D4ED8', '#7C3AED', '#BE185D',
    '#EA580C', '#E8A020', '#0F766E', '#374151', '#1F2937',
  ];
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel label={label} />
      <View style={styles.swatchRow}>
        {PRESETS.map((c) => (
          <Pressable
            key={c}
            onPress={() => { haptics.light(); onChange(c); }}
            style={[
              styles.swatch,
              { backgroundColor: c, borderWidth: value === c ? 3 : 1, borderColor: value === c ? colors.textPrimary : 'transparent' },
            ]}
          />
        ))}
      </View>
      <View style={[styles.inlineInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <View style={[styles.colorPreview, { backgroundColor: value }]} />
        <TextInput
          value={value}
          onChangeText={(t) => { if (t.startsWith('#') && t.length <= 7) onChange(t); }}
          placeholder="#1B2A4A"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={7}
          style={{ flex: 1, fontSize: 15, color: colors.textPrimary, fontFamily: 'monospace' }}
        />
      </View>
    </View>
  );
}

// ── Step screens ──────────────────────────────────────────────────────────────

function Step1({ form, set }: { form: SchoolForm; set: (f: Partial<SchoolForm>) => void }) {
  const TIMEZONES = [
    { value: 'Africa/Lusaka',       label: 'Africa/Lusaka' },
    { value: 'Africa/Nairobi',      label: 'Africa/Nairobi' },
    { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg' },
    { value: 'Africa/Lagos',        label: 'Africa/Lagos' },
    { value: 'Europe/London',       label: 'Europe/London' },
    { value: 'America/New_York',    label: 'America/New_York' },
  ];
  const CURRENCIES = [
    { value: 'ZMW', label: 'ZMW' },
    { value: 'USD', label: 'USD' },
    { value: 'KES', label: 'KES' },
    { value: 'ZAR', label: 'ZAR' },
    { value: 'NGN', label: 'NGN' },
    { value: 'GBP', label: 'GBP' },
  ];

  return (
    <View style={styles.stepBody}>
      <View>
        <FieldLabel label="School name" required />
        <InlineInput value={form.name} onChangeText={(t) => set({ name: t })} placeholder="e.g. Cambridge International School" />
      </View>
      <View>
        <FieldLabel label="School code" required />
        <InlineInput
          value={form.code}
          onChangeText={(t) => set({ code: t.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
          placeholder="e.g. CIS_LUSAKA"
          autoCapitalize="characters"
          maxLength={20}
        />
        <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
          Uppercase, numbers, underscores only. This is what staff enter to find the school.
        </ThemedText>
      </View>
      <View>
        <FieldLabel label="Country" required />
        <InlineInput value={form.country} onChangeText={(t) => set({ country: t })} placeholder="Zambia" />
      </View>
      <SelectRow label="Timezone" options={TIMEZONES} value={form.timezone} onSelect={(v) => set({ timezone: v })} />
      <SelectRow label="Currency" options={CURRENCIES} value={form.currency} onSelect={(v) => set({ currency: v })} />
    </View>
  );
}

function Step2({ form, set }: { form: SchoolForm; set: (f: Partial<SchoolForm>) => void }) {
  const { colors } = useTheme();

  const pickLogo = async () => {
    haptics.light();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      const asset = result.assets[0];
      set({
        logo_pending_base64: asset.base64 ?? null,
        logo_pending_mime: asset.mimeType ?? 'image/jpeg',
        logo_url: '',
      });
    }
  };

  const previewSource = form.logo_pending_base64
    ? `data:${form.logo_pending_mime ?? 'image/jpeg'};base64,${form.logo_pending_base64}`
    : (form.logo_url || null);

  return (
    <View style={styles.stepBody}>
      <ColorSwatch value={form.primary_color} onChange={(v) => set({ primary_color: v })} label="Primary colour" />
      <ColorSwatch value={form.secondary_color} onChange={(v) => set({ secondary_color: v })} label="Secondary / accent colour" />

      <View>
        <FieldLabel label="School logo (optional)" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <Pressable onPress={pickLogo} style={[styles.logoBox, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
            {previewSource ? (
              <Image source={{ uri: previewSource }} style={{ width: 76, height: 76, borderRadius: 12 }} resizeMode="contain" />
            ) : (
              <Ionicons name="image-outline" size={28} color={colors.textMuted} />
            )}
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Pressable onPress={pickLogo} style={[styles.linkBtn, { borderColor: colors.brand.primary }]}>
              <Ionicons name="cloud-upload-outline" size={14} color={colors.brand.primary} />
              <ThemedText style={{ color: colors.brand.primary, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>
                {form.logo_pending_base64 ? 'Change image' : 'Upload from device'}
              </ThemedText>
            </Pressable>
            {form.logo_pending_base64 && (
              <Pressable onPress={() => set({ logo_pending_base64: null, logo_pending_mime: null })}>
                <ThemedText style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>Remove</ThemedText>
              </Pressable>
            )}
          </View>
        </View>
        <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>Or paste a public URL:</ThemedText>
        <InlineInput
          value={form.logo_url}
          onChangeText={(t) => set({ logo_url: t, logo_pending_base64: t ? null : form.logo_pending_base64 })}
          placeholder="https://cdn.school.com/logo.png"
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={[styles.previewCard, { backgroundColor: form.primary_color }]}>
        <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{form.name || 'School Name'}</ThemedText>
        <View style={[styles.previewBadge, { backgroundColor: form.secondary_color }]}>
          <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{form.code || 'CODE'}</ThemedText>
        </View>
      </View>
    </View>
  );
}

function Step3({ form, set }: { form: SchoolForm; set: (f: Partial<SchoolForm>) => void }) {
  const PLANS: { value: SubscriptionPlan; label: string; desc: string }[] = [
    { value: 'starter',    label: 'Starter',    desc: 'Up to 200 students' },
    { value: 'growth',     label: 'Growth',     desc: 'Up to 500 students' },
    { value: 'scale',      label: 'Scale',      desc: 'Up to 2 000 students' },
    { value: 'enterprise', label: 'Enterprise', desc: 'Unlimited' },
  ];
  const STATUSES: { value: SubscriptionStatus; label: string; color: string }[] = [
    { value: 'trial',     label: 'Trial',     color: '#F59E0B' },
    { value: 'active',    label: 'Active',    color: '#10B981' },
    { value: 'suspended', label: 'Suspended', color: '#EF4444' },
    { value: 'cancelled', label: 'Cancelled', color: '#6B7280' },
  ];
  const { colors } = useTheme();

  return (
    <View style={styles.stepBody}>
      <View>
        <FieldLabel label="Subscription plan" required />
        <View style={{ gap: 8 }}>
          {PLANS.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => { haptics.light(); set({ subscription_plan: p.value }); }}
              style={[
                styles.planCard,
                {
                  backgroundColor: form.subscription_plan === p.value ? colors.brand.primary + '15' : colors.surfaceSecondary,
                  borderColor: form.subscription_plan === p.value ? colors.brand.primary : colors.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>{p.label}</ThemedText>
                <ThemedText variant="caption" color="muted">{p.desc}</ThemedText>
              </View>
              {form.subscription_plan === p.value && (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand.primary} />
              )}
            </Pressable>
          ))}
        </View>
      </View>
      <View>
        <FieldLabel label="Status" required />
        <View style={styles.selectRow}>
          {STATUSES.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => { haptics.light(); set({ subscription_status: s.value }); }}
              style={[
                styles.selectChip,
                {
                  backgroundColor: form.subscription_status === s.value ? s.color : colors.surfaceSecondary,
                  borderColor: form.subscription_status === s.value ? s.color : colors.border,
                },
              ]}
            >
              <ThemedText style={{
                fontSize: 13, fontWeight: '600',
                color: form.subscription_status === s.value ? '#fff' : colors.textPrimary,
              }}>
                {s.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function Step4({ form, set }: { form: SchoolForm; set: (f: Partial<SchoolForm>) => void }) {
  return (
    <View style={styles.stepBody}>
      <ThemedText variant="body" color="muted">
        Create the School Super Admin account. This is the primary owner of the school — they can create all other staff accounts and manage the entire school. They will use this email and password to sign in.
      </ThemedText>
      <View>
        <FieldLabel label="Full name" required />
        <InlineInput value={form.admin_name} onChangeText={(t) => set({ admin_name: t })} placeholder="Jane Mwansa" />
      </View>
      <View>
        <FieldLabel label="Email address" required />
        <InlineInput
          value={form.admin_email}
          onChangeText={(t) => set({ admin_email: t.toLowerCase() })}
          placeholder="admin@school.edu"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      <View>
        <FieldLabel label="Temporary password" required />
        <InlineInput
          value={form.admin_password}
          onChangeText={(t) => set({ admin_password: t })}
          placeholder="Min. 8 characters"
          secureTextEntry
        />
        <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
          Admin should change this on first login.
        </ThemedText>
      </View>
    </View>
  );
}

function ReviewStep({ form, isEdit }: { form: SchoolForm; isEdit: boolean }) {
  const { colors } = useTheme();
  const baseRows: { label: string; value: string }[] = [
    { label: 'School name',   value: form.name },
    { label: 'Code',          value: form.code },
    { label: 'Country',       value: form.country },
    { label: 'Timezone',      value: form.timezone },
    { label: 'Currency',      value: form.currency },
    { label: 'Plan',          value: form.subscription_plan },
    { label: 'Status',        value: form.subscription_status },
  ];
  const adminRows: { label: string; value: string }[] = [
    { label: 'Admin name',    value: form.admin_name },
    { label: 'Admin email',   value: form.admin_email },
  ];
  const rows = isEdit ? baseRows : [...baseRows, ...adminRows];

  return (
    <View style={styles.stepBody}>
      <View style={[styles.previewCard, { backgroundColor: form.primary_color }]}>
        <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>{form.name}</ThemedText>
        <View style={[styles.previewBadge, { backgroundColor: form.secondary_color }]}>
          <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{form.code}</ThemedText>
        </View>
      </View>

      <View style={[styles.reviewTable, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        {rows.map((r, i) => (
          <View key={r.label} style={[
            styles.reviewRow,
            { borderBottomColor: colors.border, borderBottomWidth: i < rows.length - 1 ? 1 : 0 },
          ]}>
            <ThemedText variant="caption" color="muted" style={{ flex: 1 }}>{r.label}</ThemedText>
            <ThemedText style={{ fontWeight: '600', fontSize: 14, flex: 2, textAlign: 'right' }}>{r.value || '—'}</ThemedText>
          </View>
        ))}
      </View>

      <View style={[styles.swatchPair, { gap: 12 }]}>
        <View style={[styles.colorPill, { backgroundColor: form.primary_color }]}>
          <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Primary {form.primary_color}</ThemedText>
        </View>
        <View style={[styles.colorPill, { backgroundColor: form.secondary_color }]}>
          <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Accent {form.secondary_color}</ThemedText>
        </View>
      </View>
    </View>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateStep(step: number, form: SchoolForm, isEdit: boolean): string | null {
  if (step === 0) {
    if (!form.name.trim()) return 'School name is required.';
    if (!form.code.trim()) return 'School code is required.';
    if (form.code.length < 3) return 'Code must be at least 3 characters.';
    if (!form.country.trim()) return 'Country is required.';
  }
  if (step === 1) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(form.primary_color)) return 'Invalid primary colour hex.';
    if (!/^#[0-9A-Fa-f]{6}$/.test(form.secondary_color)) return 'Invalid accent colour hex.';
  }
  if (!isEdit && step === 3) {
    if (!form.admin_name.trim()) return 'Admin name is required.';
    if (!form.admin_email.trim() || !form.admin_email.includes('@')) return 'Valid admin email required.';
    if (form.admin_password.length < 8) return 'Password must be at least 8 characters.';
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SchoolOnboarding() {
  const { colors } = useTheme();
  const { editSchoolId } = useLocalSearchParams<{ editSchoolId?: string }>();
  const isEdit = !!editSchoolId;

  const STEPS = isEdit ? EDIT_STEPS : CREATE_STEPS;
  const TOTAL = STEPS.length;

  const [step, setStep]       = useState(0);
  const [form, setFormRaw]    = useState<SchoolForm>(BLANK);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const slideAnim             = useRef(new Animated.Value(0)).current;

  // Fetch existing school when in edit mode
  const { data: existingSchool } = useQuery({
    queryKey: ['school-edit', editSchoolId],
    enabled: isEdit,
    staleTime: 0,
    queryFn: async () => {
      const { data, error: err } = await (supabase as any)
        .from('schools')
        .select('*')
        .eq('id', editSchoolId)
        .single();
      if (err) throw new Error(err.message);
      return data;
    },
  });

  // Pre-fill form when school data loads
  useEffect(() => {
    if (existingSchool) {
      setFormRaw({
        name: existingSchool.name ?? '',
        code: existingSchool.code ?? '',
        country: existingSchool.country ?? 'Zambia',
        timezone: existingSchool.timezone ?? 'Africa/Lusaka',
        currency: existingSchool.currency ?? 'ZMW',
        primary_color: existingSchool.primary_color ?? '#1B2A4A',
        secondary_color: existingSchool.secondary_color ?? '#E8A020',
        logo_url: existingSchool.logo_url ?? '',
        logo_pending_base64: null,
        logo_pending_mime: null,
        subscription_plan: existingSchool.subscription_plan ?? 'growth',
        subscription_status: existingSchool.subscription_status ?? 'trial',
        admin_email: '',
        admin_name: '',
        admin_password: '',
      });
    }
  }, [existingSchool]);

  const set = (patch: Partial<SchoolForm>) => {
    setFormRaw((f) => ({ ...f, ...patch }));
    setError('');
  };

  const animateSlide = (dir: 1 | -1, cb: () => void) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30 * dir, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
    cb();
  };

  const next = () => {
    const err = validateStep(step, form, isEdit);
    if (err) { setError(err); haptics.error(); return; }
    if (step < TOTAL - 1) {
      haptics.light();
      animateSlide(1, () => setStep((s) => s + 1));
    }
  };

  const back = () => {
    if (step > 0) {
      haptics.light();
      animateSlide(-1, () => setStep((s) => s - 1));
    } else {
      router.back();
    }
  };

  const handleCreate = async () => {
    const err = validateStep(step, form, false);
    if (err) { setError(err); haptics.error(); return; }

    setLoading(true);
    setError('');

    try {
      const { data: school, error: schoolErr } = await (supabase as any)
        .from('schools')
        .insert({
          name: form.name.trim(),
          code: form.code.trim(),
          country: form.country.trim(),
          timezone: form.timezone,
          currency: form.currency,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          logo_url: form.logo_url.trim() || null,
          subscription_plan: form.subscription_plan,
          subscription_status: form.subscription_status,
        })
        .select()
        .single();

      if (schoolErr) throw new Error(schoolErr.message);

      // 1b. Upload pending logo (if user picked a file rather than pasted a URL)
      if (form.logo_pending_base64) {
        try {
          const url = await uploadSchoolLogoFile({
            schoolId: school.id,
            base64: form.logo_pending_base64,
            mimeType: form.logo_pending_mime ?? 'image/jpeg',
          });
          await (supabase as any).from('schools').update({ logo_url: url }).eq('id', school.id);
        } catch (logoErr: any) {
          console.warn('[onboarding] logo upload failed:', logoErr?.message);
        }
      }

      const { error: fnErr } = await (supabase as any).functions.invoke('create-school-admin', {
        body: {
          school_id: school.id,
          email: form.admin_email.trim(),
          full_name: form.admin_name.trim(),
          password: form.admin_password,
        },
      });

      haptics.success();

      const warnMsg = fnErr
        ? `"${form.name}" onboarded successfully.\n\nAdmin account could not be created automatically — set it up manually.\n\nSchool code: ${form.code}`
        : `"${form.name}" is live.\n\nAdmin: ${form.admin_email}\nCode: ${form.code}`;
      const warnTitle = fnErr ? 'School created' : 'School onboarded';

      if (Platform.OS === 'web') {
        window.alert(`${warnTitle}\n\n${warnMsg}`);
        router.back();
      } else {
        Alert.alert(warnTitle, warnMsg, [{ text: 'Done', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    const err = validateStep(step, form, true);
    if (err) { setError(err); haptics.error(); return; }

    setLoading(true);
    setError('');

    try {
      const { error: updateErr } = await (supabase as any)
        .from('schools')
        .update({
          name: form.name.trim(),
          code: form.code.trim(),
          country: form.country.trim(),
          timezone: form.timezone,
          currency: form.currency,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          logo_url: form.logo_url.trim() || null,
          subscription_plan: form.subscription_plan,
          subscription_status: form.subscription_status,
        })
        .eq('id', editSchoolId);

      if (updateErr) throw new Error(updateErr.message);

      // Upload pending logo on edit too
      if (form.logo_pending_base64) {
        try {
          const url = await uploadSchoolLogoFile({
            schoolId: editSchoolId!,
            base64: form.logo_pending_base64,
            mimeType: form.logo_pending_mime ?? 'image/jpeg',
          });
          await (supabase as any).from('schools').update({ logo_url: url }).eq('id', editSchoolId);
        } catch (logoErr: any) {
          console.warn('[edit] logo upload failed:', logoErr?.message);
        }
      }

      haptics.success();
      if (Platform.OS === 'web') {
        window.alert(`"${form.name}" updated successfully.`);
        router.back();
      } else {
        Alert.alert('School updated', `"${form.name}" has been updated.`, [{ text: 'Done', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  const isLast = step === TOTAL - 1;

  const createStepComponents = [
    <Step1 key={0} form={form} set={set} />,
    <Step2 key={1} form={form} set={set} />,
    <Step3 key={2} form={form} set={set} />,
    <Step4 key={3} form={form} set={set} />,
    <ReviewStep key={4} form={form} isEdit={false} />,
  ];

  const editStepComponents = [
    <Step1 key={0} form={form} set={set} />,
    <Step2 key={1} form={form} set={set} />,
    <Step3 key={2} form={form} set={set} />,
    <ReviewStep key={3} form={form} isEdit={true} />,
  ];

  const stepComponents = isEdit ? editStepComponents : createStepComponents;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={back} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>{isEdit ? 'Edit School' : 'Onboard School'}</ThemedText>
          <ThemedText variant="caption" color="muted">{STEPS[step]}</ThemedText>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressWrap}>
        <ProgressBar value={step + 1} max={TOTAL} />
        <StepDots current={step} steps={STEPS} />
      </View>

      {/* Body */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
            {stepComponents[step]}
          </Animated.View>

          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>{error}</ThemedText>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer CTA */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button
          label={isLast ? (isEdit ? 'Save Changes' : 'Create School') : 'Continue'}
          onPress={isLast ? (isEdit ? handleUpdate : handleCreate) : next}
          loading={loading}
          fullWidth
          size="lg"
          iconLeft={isLast ? <Ionicons name="checkmark-circle-outline" size={20} color="#fff" /> : undefined}
        />
        {step > 0 && !isLast && (
          <TouchableOpacity onPress={back} style={styles.backLink}>
            <ThemedText style={{ color: colors.textMuted, fontSize: 14 }}>Back</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  progressWrap: { paddingHorizontal: Spacing['2xl'], paddingTop: Spacing.base, gap: Spacing.sm },
  dotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dotWrap: { alignItems: 'center' },
  dot: { height: 8, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing['2xl'], paddingBottom: Spacing['4xl'] },
  stepBody: { gap: Spacing.lg },
  inlineInput: {
    flexDirection: 'row', alignItems: 'center',
    height: 50, borderRadius: Radius.md, borderWidth: 1.5,
    paddingHorizontal: Spacing.base,
  },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  colorPreview: { width: 22, height: 22, borderRadius: 11, marginRight: Spacing.sm },
  previewCard: {
    borderRadius: Radius.lg, padding: Spacing['2xl'],
    alignItems: 'center', gap: 10, marginTop: Spacing.sm,
  },
  previewBadge: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full,
  },
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1.5,
  },
  reviewTable: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: 12 },
  swatchPair: { flexDirection: 'row' },
  colorPill: { flex: 1, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.base,
  },
  footer: {
    padding: Spacing['2xl'], paddingBottom: Spacing['3xl'],
    borderTopWidth: 1, gap: Spacing.sm,
  },
  backLink: { alignItems: 'center', paddingVertical: Spacing.xs },
  logoBox: {
    width: 84, height: 84, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1.5,
  },
});
