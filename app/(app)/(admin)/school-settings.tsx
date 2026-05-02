/**
 * School Settings — name, logo, brand colours
 * Accessible to school_super_admin and above.
 */
import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, TextInput,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Avatar } from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export default function SchoolSettingsScreen() {
  const { colors } = useTheme();
  const { user, school, setSchool } = useAuthStore();

  const [name, setName]                 = useState(school?.name ?? '');
  const [logoUrl, setLogoUrl]           = useState(school?.logo_url ?? '');
  const [primaryColor, setPrimary]      = useState(school?.primary_color ?? '#1B2A4A');
  const [secondaryColor, setSecondary]  = useState(school?.secondary_color ?? '#E8A020');
  const [saving, setSaving]             = useState(false);
  const [dirty, setDirty]               = useState(false);

  useEffect(() => {
    const changed =
      name !== (school?.name ?? '') ||
      logoUrl !== (school?.logo_url ?? '') ||
      primaryColor !== (school?.primary_color ?? '#1B2A4A') ||
      secondaryColor !== (school?.secondary_color ?? '#E8A020');
    setDirty(changed);
  }, [name, logoUrl, primaryColor, secondaryColor, school]);

  const validate = (): string | null => {
    if (!name.trim()) return 'School name is required.';
    if (primaryColor && !HEX_RE.test(primaryColor)) return 'Primary colour must be a 7-character hex code (e.g. #1B2A4A).';
    if (secondaryColor && !HEX_RE.test(secondaryColor)) return 'Secondary colour must be a 7-character hex code (e.g. #E8A020).';
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) { Alert.alert('Validation Error', err); return; }

    Alert.alert(
      'Save school settings?',
      'This will update the school name and branding across the entire app.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', style: 'default', onPress: doSave },
      ],
    );
  };

  const doSave = async () => {
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
            school_id: user?.schoolId,
            name: name.trim(),
            logo_url: logoUrl.trim() || null,
            primary_color: primaryColor.trim() || null,
            secondary_color: secondaryColor.trim() || null,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Update failed');

      // Refresh school in auth store
      const { data: updated } = await (supabase as any)
        .from('schools')
        .select('*')
        .eq('id', user?.schoolId)
        .single();
      if (updated) setSchool(updated);

      haptics.success();
      Alert.alert('Saved', 'School settings updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Save failed', e.message ?? 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>School Settings</ThemedText>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!dirty || saving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ThemedText style={{ color: dirty && !saving ? colors.brand.primary : colors.textMuted, fontWeight: '700' }}>
            {saving ? 'Saving…' : 'Save'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Logo preview */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>LOGO PREVIEW</ThemedText>
          <View style={styles.logoRow}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={{ width: 64, height: 64, borderRadius: 12 }}
                contentFit="contain"
              />
            ) : (
              <Avatar name={name || school?.name || 'S'} size={64} />
            )}
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <ThemedText variant="bodySm" color="secondary" style={{ lineHeight: 20 }}>
                Paste a publicly accessible image URL. Recommended: square PNG, at least 256×256px.
              </ThemedText>
            </View>
          </View>
          <Field
            label="Logo URL"
            value={logoUrl}
            onChangeText={setLogoUrl}
            placeholder="https://example.com/logo.png"
            autoCapitalize="none"
            keyboardType="url"
            colors={colors}
          />
        </View>

        {/* School info */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>SCHOOL IDENTITY</ThemedText>
          <Field
            label="School Name"
            value={name}
            onChangeText={setName}
            placeholder="Enter school name"
            colors={colors}
          />
        </View>

        {/* Brand colours */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>BRAND COLOURS</ThemedText>
          <View style={styles.colorRow}>
            <Field
              label="Primary Colour"
              value={primaryColor}
              onChangeText={setPrimary}
              placeholder="#1B2A4A"
              autoCapitalize="none"
              colors={colors}
              style={{ flex: 1 }}
            />
            <View style={[styles.swatch, { backgroundColor: HEX_RE.test(primaryColor) ? primaryColor : colors.border }]} />
          </View>
          <View style={styles.colorRow}>
            <Field
              label="Secondary Colour"
              value={secondaryColor}
              onChangeText={setSecondary}
              placeholder="#E8A020"
              autoCapitalize="none"
              colors={colors}
              style={{ flex: 1 }}
            />
            <View style={[styles.swatch, { backgroundColor: HEX_RE.test(secondaryColor) ? secondaryColor : colors.border }]} />
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!dirty || saving}
          style={[styles.saveBtn, { backgroundColor: dirty && !saving ? colors.brand.primary : colors.border }]}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          <ThemedText style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Inline text field ─────────────────────────────────────────────────────────

function Field({
  label, value, onChangeText, placeholder, autoCapitalize, keyboardType, colors, style,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  autoCapitalize?: any; keyboardType?: any; colors: any; style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: Spacing.md }, style]}>
      <ThemedText variant="caption" color="muted" style={{ marginBottom: 4 }}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={autoCapitalize ?? 'words'}
        keyboardType={keyboardType ?? 'default'}
        style={{
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: Radius.md,
          padding: Spacing.md,
          color: colors.textPrimary,
          backgroundColor: colors.background,
          fontSize: 15,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  scroll: { padding: Spacing.base, paddingBottom: 40, gap: Spacing.base },
  card: { borderRadius: Radius.lg, padding: Spacing.base },
  sectionLabel: { marginBottom: Spacing.md, fontSize: 11, letterSpacing: 0.5 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  colorRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  swatch: { width: 44, height: 44, borderRadius: Radius.md, marginBottom: Spacing.md },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
  },
});
