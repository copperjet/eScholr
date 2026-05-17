/**
 * Character Framework — school_super_admin / admin
 * Customise CREED value names + rating scale.
 * Backed by 5 fixed columns on character_records (creativity, respect, excellence, empathy, discipline).
 * Display names are stored in character_frameworks.value_names and rendered on report PDFs.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, ErrorState,
  ModuleGate, ModuleDisabledScreen,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import { useCharacterFramework, useUpdateCharacterFramework } from '../../../hooks/useCreed';

const DEFAULTS = ['Creativity', 'Respect', 'Excellence', 'Empathy', 'Discipline'];

function CharacterFrameworkContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isError, refetch } = useCharacterFramework(schoolId);
  const update = useUpdateCharacterFramework(schoolId);

  const [names, setNames]   = useState<string[]>(DEFAULTS);
  const [enabled, setEnabled] = useState(true);
  const [scale, setScale]   = useState<'cambridge' | 'developmental'>('cambridge');

  useEffect(() => {
    if (!data) return;
    setNames(Array.isArray(data.value_names) && data.value_names.length === 5 ? data.value_names : DEFAULTS);
    setEnabled(data.is_enabled);
    setScale(data.rating_scale);
  }, [data]);

  const handleSave = useCallback(async () => {
    const trimmed = names.map((n) => n.trim());
    if (trimmed.some((n) => !n)) {
      Alert.alert('All 5 names required', 'Each value must have a name.');
      return;
    }
    try {
      haptics.medium();
      await update.mutateAsync({
        value_names:  trimmed,
        is_enabled:   enabled,
        rating_scale: scale,
      });
      haptics.success();
      Alert.alert('Saved', 'Character framework updated. Future report PDFs will use the new labels.');
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message ?? 'Could not save.');
    }
  }, [names, enabled, scale, update]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset to defaults?',
      'Resets value names to CREED (Creativity, Respect, Excellence, Empathy, Discipline).',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', onPress: () => setNames(DEFAULTS) },
      ],
    );
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Character Framework" showBack />
        <ErrorState title="Could not load" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Character Framework" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }} keyboardShouldPersistTaps="handled">
          {isLoading ? (
            <>
              <Skeleton width="100%" height={80} radius={Radius.lg} />
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={56} radius={Radius.lg} />)}
            </>
          ) : (
            <>
              {/* Enable */}
              <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700' }}>Enable on Reports</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      Hide the character section from report PDFs when off.
                    </ThemedText>
                  </View>
                  <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.brand.primary }} />
                </View>
              </View>

              {/* Rating scale */}
              <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                <ThemedText style={{ fontSize: 14, fontWeight: '700', marginBottom: 8 }}>Rating Scale</ThemedText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['cambridge', 'developmental'] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => { haptics.light(); setScale(opt); }}
                      style={[
                        styles.scaleBtn,
                        {
                          backgroundColor: scale === opt ? colors.brand.primary : colors.surfaceSecondary,
                          borderColor: scale === opt ? colors.brand.primary : colors.border,
                        },
                      ]}
                    >
                      <ThemedText style={{ color: scale === opt ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                        {opt === 'cambridge' ? 'Cambridge (A*–U)' : 'Developmental (Exceeding–Emerging)'}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Value names */}
              <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                <View style={[styles.row, { marginBottom: 8 }]}>
                  <ThemedText style={{ fontSize: 14, fontWeight: '700', flex: 1 }}>Value Names</ThemedText>
                  <TouchableOpacity onPress={handleReset}>
                    <ThemedText style={{ color: colors.brand.primary, fontSize: 12, fontWeight: '600' }}>Reset</ThemedText>
                  </TouchableOpacity>
                </View>
                <ThemedText style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                  Five values map to the underlying columns (creativity, respect, excellence, empathy, discipline). Rename the labels to fit your school's framework.
                </ThemedText>
                {names.map((n, i) => (
                  <View key={i} style={{ marginBottom: 8 }}>
                    <ThemedText style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
                      Slot {i + 1} · stored as <ThemedText style={{ fontFamily: 'monospace' }}>{DEFAULTS[i].toLowerCase()}</ThemedText>
                    </ThemedText>
                    <TextInput
                      value={n}
                      onChangeText={(t) => {
                        setNames((prev) => { const copy = [...prev]; copy[i] = t; return copy; });
                      }}
                      placeholder={DEFAULTS[i]}
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    />
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={handleSave}
                disabled={update.isPending}
                style={[styles.saveBtn, { backgroundColor: colors.brand.primary, opacity: update.isPending ? 0.6 : 1 }]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <ThemedText style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>
                  {update.isPending ? 'Saving…' : 'Save Framework'}
                </ThemedText>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function CharacterFrameworkScreen() {
  return (
    <ModuleGate module="exams" fallback={<ModuleDisabledScreen module="exams" />}>
      <CharacterFrameworkContent />
    </ModuleGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { borderRadius: Radius.lg, padding: Spacing.base },
  row:  { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, fontSize: 15,
  },
  scaleBtn: {
    flex: 1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, alignItems: 'center',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
  },
});
