/**
 * Parent timetable entry — child picker.
 * Single child: jumps straight to shared viewer.
 * Multiple children: shows picker list first.
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState, Avatar } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

interface Child {
  id: string;
  full_name: string;
  photo_url: string | null;
  student_number: string;
  stream_id: string;
  streams: { name: string } | null;
  grades: { name: string } | null;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery<Child[]>({
    queryKey: ['parent-children-tt', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, student_number, stream_id, streams(name), grades(name))')
        .eq('parent_id', parentId!)
        .eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.students).filter(Boolean) as Child[];
    },
  });
}

function openTimetable(streamId: string) {
  haptics('light');
  router.push(`/(app)/timetable?streamId=${streamId}` as any);
}

export default function ParentTimetable() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const childrenQ = useChildren(user?.parentId ?? null, schoolId);

  if (childrenQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Timetable" showBack />
        <View style={{ padding: Spacing.lg, gap: Spacing.sm }}>
          {[1, 2].map((i) => <Skeleton key={i} height={68} radius={Radius.md} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (childrenQ.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Timetable" showBack />
        <ErrorState message="Could not load children" onRetry={childrenQ.refetch} />
      </SafeAreaView>
    );
  }

  const children = childrenQ.data ?? [];

  // Single child: go directly
  if (children.length === 1) {
    openTimetable(children[0].stream_id);
    return null;
  }

  if (children.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Timetable" showBack />
        <EmptyState icon="calendar-outline" title="No children linked" description="Contact the school to link your children." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Timetable" subtitle="Select child" showBack />

      <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
        {children.map((child) => (
          <TouchableOpacity
            key={child.id}
            onPress={() => openTimetable(child.stream_id)}
            activeOpacity={0.7}
            style={[styles.childRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Avatar
              name={child.full_name}
              uri={child.photo_url}
              size={44}
            />
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <ThemedText style={styles.childName}>{child.full_name}</ThemedText>
              <ThemedText style={[styles.childMeta, { color: colors.textMuted }]}>
                {child.grades?.name ?? ''}{child.streams?.name ? ` · ${child.streams.name}` : ''}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  childRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  childName: { fontSize: 15, fontWeight: '600' },
  childMeta: { fontSize: 12, marginTop: 2 },
});
