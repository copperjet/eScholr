/**
 * Publish timetable — confirm + publish (warns if archiving prior)
 */
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../../lib/supabase';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, Skeleton, ErrorState,
} from '../../../../../components/ui';
import { Spacing, Radius } from '../../../../../constants/Typography';
import { usePublishTimetable, useTimetableConflicts } from '../../../../../hooks/useTimetableBuilder';

interface TimetableMeta { id: string; name: string; status: string; semester_id: string | null; }
interface ExistingPublished { id: string; name: string; }

function usePublishMeta(id: string, schoolId: string) {
  return useQuery<{ tt: TimetableMeta; existing: ExistingPublished | null }>({
    queryKey: ['ttb-publish-meta', id, schoolId],
    enabled: !!id && !!schoolId,
    queryFn: async () => {
      const db = supabase as any;
      const { data: tt, error } = await db
        .from('timetables').select('id, name, status, semester_id').eq('id', id).single();
      if (error) throw error;

      let existing: ExistingPublished | null = null;
      if (tt.semester_id) {
        const { data: ep } = await db
          .from('timetables')
          .select('id, name')
          .eq('school_id', schoolId)
          .eq('semester_id', tt.semester_id)
          .eq('status', 'published')
          .neq('id', id)
          .maybeSingle();
        existing = ep ?? null;
      }
      return { tt: tt as TimetableMeta, existing };
    },
  });
}

export default function PublishScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = user?.schoolId ?? '';

  const metaQ      = usePublishMeta(id, sid);
  const conflictsQ = useTimetableConflicts(id, sid);
  const publishMut = usePublishTimetable();

  const [publishing, setPublishing] = useState(false);

  const errors = (conflictsQ.data ?? []).filter((c) => c.severity === 'error' && !c.resolved);

  async function handlePublish() {
    if (errors.length > 0) {
      Alert.alert(
        'Unresolved errors',
        `${errors.length} errors must be resolved before publishing.`,
        [{ text: 'OK' }],
      );
      return;
    }
    const existing = metaQ.data?.existing;
    const confirmMsg = existing
      ? `"${existing.name}" is currently published. It will be archived. Continue?`
      : 'Publish this timetable? It will become visible to teachers and students.';

    Alert.alert('Publish timetable', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish', style: 'default',
        onPress: async () => {
          setPublishing(true);
          try {
            await publishMut.mutateAsync({ id, school_id: sid, published_by: user?.id ?? '' });
            router.replace(`/(app)/(admin)/timetable` as any);
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to publish');
          } finally {
            setPublishing(false);
          }
        },
      },
    ]);
  }

  if (metaQ.isLoading || conflictsQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Publish" showBack />
        <View style={{ padding: Spacing.lg, gap: 12 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      </SafeAreaView>
    );
  }

  if (metaQ.isError || !metaQ.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Publish" showBack />
        <ErrorState message="Failed to load" onRetry={metaQ.refetch} />
      </SafeAreaView>
    );
  }

  const { tt, existing } = metaQ.data;
  const totalConflicts = (conflictsQ.data ?? []).filter((c) => !c.resolved).length;
  const warnings = totalConflicts - errors.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Publish Timetable" showBack />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Timetable name */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.ttName}>{tt.name}</ThemedText>
            <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>
              Status: {tt.status}
            </ThemedText>
          </View>
        </View>

        {/* Conflict summary */}
        {totalConflicts > 0 ? (
          <View style={[styles.card, { backgroundColor: errors.length > 0 ? '#FEF2F2' : '#FFFBEB', borderColor: errors.length > 0 ? '#FECACA' : '#FDE68A' }]}>
            <Ionicons
              name={errors.length > 0 ? 'alert-circle' : 'warning-outline'}
              size={22}
              color={errors.length > 0 ? '#DC2626' : '#D97706'}
            />
            <View style={{ flex: 1 }}>
              {errors.length > 0 ? (
                <ThemedText style={{ color: '#DC2626', fontWeight: '600', fontSize: 14 }}>
                  {errors.length} error{errors.length !== 1 ? 's' : ''} must be resolved
                </ThemedText>
              ) : null}
              {warnings > 0 ? (
                <ThemedText style={{ color: '#D97706', fontSize: 13 }}>
                  {warnings} warning{warnings !== 1 ? 's' : ''} (publishable)
                </ThemedText>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
            <ThemedText style={{ color: '#16A34A', fontWeight: '600', fontSize: 14 }}>
              No conflicts — ready to publish
            </ThemedText>
          </View>
        )}

        {/* Prior published warning */}
        {existing ? (
          <View style={[styles.card, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
            <Ionicons name="archive-outline" size={20} color="#EA580C" />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ color: '#EA580C', fontWeight: '600', fontSize: 14 }}>
                Will archive existing published timetable
              </ThemedText>
              <ThemedText style={{ color: '#9A3412', fontSize: 13, marginTop: 2 }}>
                "{existing.name}" will be archived
              </ThemedText>
            </View>
          </View>
        ) : null}

        {/* What happens */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText style={[styles.infoTitle, { color: colors.textSecondary }]}>After publishing</ThemedText>
          {[
            'Teachers see their schedule in the Timetable screen',
            'Students and parents see their stream schedule',
            'Daily view shows current period',
            'Prior published timetable (if any) is archived',
          ].map((line, i) => (
            <View key={i} style={styles.infoRow}>
              <Ionicons name="checkmark" size={14} color={colors.primary} />
              <ThemedText style={{ fontSize: 13 }}>{line}</ThemedText>
            </View>
          ))}
        </View>

        <Button
          label="Publish timetable"
          onPress={handlePublish}
          loading={publishing}
          disabled={errors.length > 0}
          style={{ marginTop: Spacing.md }}
        />
        <Button
          label="Back to grid"
          variant="outline"
          onPress={() => router.back()}
          style={{ marginTop: Spacing.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:   { padding: Spacing.base, gap: Spacing.md, paddingBottom: 60 },
  card:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  ttName:    { fontSize: 15, fontWeight: '700' },
  infoCard:  { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.sm },
  infoTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
