/**
 * Admissions Config — required documents and max upload size for the public admissions form.
 * Accessible to school_super_admin and admin.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, ScreenHeader, Button, Card, Skeleton, ErrorState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

const DOC_OPTIONS: { key: string; label: string }[] = [
  { key: 'birth_cert', label: 'Birth Certificate' },
  { key: 'prev_school_report', label: 'Previous School Report' },
  { key: 'immunization', label: 'Immunization Record' },
  { key: 'passport', label: 'Passport' },
  { key: 'id_card', label: 'ID Card' },
  { key: 'medical', label: 'Medical Record' },
];

const MAX_MB_LIMIT = 50;

export default function AdmissionsConfigScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admissions-config', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('schools')
        .select('admissions_required_docs, public_admissions_documents_max_mb')
        .eq('id', schoolId)
        .single();
      if (error) throw error;
      return data as {
        admissions_required_docs: string[] | null;
        public_admissions_documents_max_mb: number | null;
      };
    },
  });

  const [required, setRequired] = useState<string[]>([]);
  const [maxMb, setMaxMb] = useState('10');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRequired(data.admissions_required_docs ?? ['birth_cert']);
    setMaxMb(String(data.public_admissions_documents_max_mb ?? 10));
  }, [data]);

  const toggle = useCallback((key: string) => {
    haptics.selection();
    setRequired((prev) => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const handleSave = async () => {
    const mb = Number(maxMb);
    if (!Number.isFinite(mb) || mb < 1 || mb > MAX_MB_LIMIT) {
      Alert.alert('Invalid size', `Max file size must be 1–${MAX_MB_LIMIT} MB.`);
      return;
    }
    if (required.length === 0) {
      Alert.alert('Required docs', 'Select at least one required document.');
      return;
    }
    setSaving(true);
    haptics.medium();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/update-school`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            school_id: schoolId,
            admissions_required_docs: required,
            public_admissions_documents_max_mb: mb,
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      haptics.success();
      Alert.alert('Saved', 'Admissions configuration updated.');
      refetch();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Save failed', e.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Admissions Config" showBack />
        <ErrorState title="Could not load config" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Admissions Config" showBack />
      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="100%" height={140} radius={Radius.lg} />
          <Skeleton width="100%" height={80} radius={Radius.lg} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>REQUIRED DOCUMENTS</ThemedText>
            <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.md }}>
              Documents that applicants must upload via the public admissions form.
            </ThemedText>
            <View style={{ gap: Spacing.sm }}>
              {DOC_OPTIONS.map((opt) => {
                const selected = required.includes(opt.key);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => toggle(opt.key)}
                    style={[
                      styles.docOption,
                      {
                        backgroundColor: selected ? colors.brand.primary + '12' : colors.surfaceSecondary,
                        borderColor: selected ? colors.brand.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={[
                      styles.checkbox,
                      {
                        borderColor: selected ? colors.brand.primary : colors.border,
                        backgroundColor: selected ? colors.brand.primary : 'transparent',
                      },
                    ]}>
                      {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <ThemedText variant="body" style={{ flex: 1, marginLeft: Spacing.md }}>
                      {opt.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>MAX FILE SIZE (MB)</ThemedText>
            <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.md }}>
              Maximum size per uploaded document. Range 1–{MAX_MB_LIMIT} MB.
            </ThemedText>
            <TextInput
              value={maxMb}
              onChangeText={setMaxMb}
              keyboardType="numeric"
              maxLength={2}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
            />
          </Card>

          <Button
            label={saving ? 'Saving…' : 'Save Configuration'}
            variant="primary"
            fullWidth
            loading={saving}
            disabled={saving}
            onPress={handleSave}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.base, gap: Spacing.base, paddingBottom: 48 },
  card:         { padding: Spacing.base },
  sectionLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: Spacing.xs },
  docOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: 16,
  },
});
