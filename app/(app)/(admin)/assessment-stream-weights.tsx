/**
 * Stream-specific weight overrides for an assessment template.
 * params: templateId, templateName
 * If a stream has no override, it falls back to template.weight_percent.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState,
  ModuleGate, ModuleDisabledScreen,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import {
  useAssessmentTemplates,
  useSchoolStreams,
  useTemplateStreamOverrides,
  useUpsertStreamOverride,
} from '../../../hooks/useAssessmentConfig';

function AssessmentStreamWeightsContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const { templateId } = useLocalSearchParams<{ templateId: string }>();

  const { data: templates = [], isLoading: tplLoading } = useAssessmentTemplates(schoolId);
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);

  const { data: streams = [], isLoading: streamsLoading } = useSchoolStreams(schoolId);
  const { data: overrides = [], isLoading: ovLoading, isError, refetch } = useTemplateStreamOverrides(templateId ?? null);
  const upsert = useUpsertStreamOverride(templateId ?? '');

  const overrideMap = useMemo(() => {
    const m: Record<string, number> = {};
    overrides.forEach((o) => { m[o.stream_id] = o.weight_override; });
    return m;
  }, [overrides]);

  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => { setLocal({}); }, [templateId]);

  const handleBlur = useCallback(async (streamId: string) => {
    const raw = local[streamId];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Clear override
      try {
        await upsert.mutateAsync({ stream_id: streamId, weight_override: null });
        haptics.light();
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not clear override.');
      }
      return;
    }
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0 || num > 100) {
      Alert.alert('Invalid weight', 'Use a number between 0 and 100, or leave blank to inherit the default.');
      setLocal((p) => { const c = { ...p }; delete c[streamId]; return c; });
      return;
    }
    try {
      await upsert.mutateAsync({ stream_id: streamId, weight_override: num });
      haptics.light();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save override.');
    }
  }, [local, upsert]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Stream Weights" showBack />
        <ErrorState title="Could not load" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const loading = tplLoading || streamsLoading || ovLoading;
  const defaultWeight = template?.weight_percent ?? 0;

  // Group streams by section/grade for readability
  const grouped = useMemo(() => {
    const m: Record<string, typeof streams> = {};
    streams.forEach((s) => {
      const key = `${s.section_name} · ${s.grade_name}`;
      if (!m[key]) m[key] = [];
      m[key].push(s);
    });
    return m;
  }, [streams]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={template ? `${template.name} Weights` : 'Stream Weights'}
        subtitle={template ? `Default: ${defaultWeight}% — override per stream` : undefined}
        showBack
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={56} radius={Radius.lg} />)
          ) : streams.length === 0 ? (
            <EmptyState title="No streams" description="Create classes/streams first." />
          ) : (
            <>
              <View style={[styles.infoBox, { backgroundColor: colors.brand.primarySoft }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.brand.primary} />
                <ThemedText style={{ fontSize: 12, color: colors.brand.primary, flex: 1 }}>
                  Leave blank to use the school default ({defaultWeight}%). Overrides apply only to this assessment for the selected stream.
                </ThemedText>
              </View>
              {Object.entries(grouped).map(([groupKey, list]) => (
                <View key={groupKey} style={{ gap: Spacing.sm }}>
                  <ThemedText style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.6 }}>
                    {groupKey.toUpperCase()}
                  </ThemedText>
                  {list.map((s) => {
                    const override = overrideMap[s.id];
                    const value = local[s.id] !== undefined
                      ? local[s.id]
                      : override !== undefined ? String(override) : '';
                    return (
                      <View key={s.id} style={[styles.row, { backgroundColor: colors.surface }, Shadow.sm]}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>{s.name}</ThemedText>
                          <ThemedText style={{ fontSize: 11, color: colors.textMuted }}>
                            {override !== undefined ? `Override: ${override}%` : `Default: ${defaultWeight}%`}
                          </ThemedText>
                        </View>
                        <TextInput
                          value={value}
                          onChangeText={(t) => setLocal((p) => ({ ...p, [s.id]: t.replace(/[^0-9.]/g, '') }))}
                          onBlur={() => handleBlur(s.id)}
                          placeholder={`${defaultWeight}`}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          style={[styles.input, {
                            color: colors.textPrimary,
                            backgroundColor: colors.surfaceSecondary,
                            borderColor: override !== undefined ? colors.brand.primary : colors.border,
                          }]}
                        />
                        <ThemedText style={{ marginLeft: 6, color: colors.textMuted, fontSize: 14 }}>%</ThemedText>
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ height: 40 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function AssessmentStreamWeightsScreen() {
  return (
    <ModuleGate module="exams" fallback={<ModuleDisabledScreen module="exams" />}>
      <AssessmentStreamWeightsContent />
    </ModuleGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  infoBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: Spacing.sm, borderRadius: Radius.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: Spacing.md, borderRadius: Radius.lg,
  },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, fontSize: 15,
    width: 80, textAlign: 'right',
  },
});
