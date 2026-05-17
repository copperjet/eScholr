/**
 * Admin — Subject Color Palette
 * Assign bg/fg color pairs to subjects for timetable grid display.
 */
import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, Button,
  ColorSwatchPicker,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useSubjectColors, useUpdateSubjectColor, useResetColorPalette,
  DEFAULT_PALETTE,
} from '../../../../hooks/useTimetableLive';

function useSubjects(schoolId: string) {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['subjects-list', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subjects')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Use ColorSwatchPicker from components/ui for M9 WCAG-aware palette selector

export default function ColorsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const subjectsQ = useSubjects(sid);
  const colorsQ   = useSubjectColors(sid);
  const updateMut = useUpdateSubjectColor();
  const resetMut  = useResetColorPalette();

  const [expanded, setExpanded] = useState<string | null>(null);

  const colorMap: Record<string, { bg: string; fg: string }> = {};
  for (const c of (colorsQ.data ?? [])) colorMap[c.subject_id] = { bg: c.bg_color, fg: c.fg_color };

  const isLoading = subjectsQ.isLoading || colorsQ.isLoading;
  const subjects  = subjectsQ.data ?? [];

  async function handleSelect(subjectId: string, bg: string, fg: string) {
    haptics('light');
    try {
      await updateMut.mutateAsync({ school_id: sid, subject_id: subjectId, bg_color: bg, fg_color: fg, icon_name: null });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save color');
    }
  }

  async function handleReset() {
    haptics('light');
    Alert.alert(
      'Reset palette',
      'Assign default colors to all subjects?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await resetMut.mutateAsync({ school_id: sid, subjects });
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to reset');
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Subject Colors"
        subtitle="Timetable grid color palette"
        showBack
        rightElement={
          <TouchableOpacity onPress={handleReset} style={{ padding: 4 }}>
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          [1,2,3,4,5].map((i) => <Skeleton key={i} height={56} style={{ marginBottom: 8 }} />)
        ) : subjects.length === 0 ? (
          <EmptyState icon="color-palette-outline" title="No subjects" description="Add subjects first in School Structure" />
        ) : (
          subjects.map((subject) => {
            const pair = colorMap[subject.id] ?? SWATCHES[0];
            const isOpen = expanded === subject.id;
            return (
              <View key={subject.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setExpanded(isOpen ? null : subject.id)}
                  style={styles.rowHeader}
                  activeOpacity={0.7}
                >
                  <View style={[styles.preview, { backgroundColor: pair.bg }]}>
                    <ThemedText style={[styles.previewText, { color: pair.fg }]}>Aa</ThemedText>
                  </View>
                  <ThemedText style={[styles.subjectName, { color: colors.textPrimary }]}>{subject.name}</ThemedText>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {isOpen ? (
                  <View style={{ padding: Spacing.sm }}>
                    <ColorSwatchPicker
                      value={pair}
                      onChange={(swatch) => handleSelect(subject.id, swatch.bg, swatch.fg)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {subjects.length > 0 ? (
          <Button
            label="Reset all to defaults"
            variant="outline"
            onPress={handleReset}
            loading={resetMut.isPending}
            style={{ marginTop: Spacing.base }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content:     { padding: Spacing.base, gap: Spacing.xs, paddingBottom: 60 },
  row:         { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: 6 },
  rowHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm },
  preview:     { width: 40, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  previewText: { fontSize: 12, fontWeight: '700' },
  subjectName: { flex: 1, fontSize: 14, fontWeight: '500' },
});
