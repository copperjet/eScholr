import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Avatar, Card, EmptyState, ErrorState, SectionHeader } from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

function useSTStudents(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['st-students', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      // Get ST assignments to find which streams they teach
      const { data: assignments } = await (supabase as any)
        .from('subject_teacher_assignments')
        .select('stream_id')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId);
      
      const streamIds = (assignments ?? []).map((a: any) => a.stream_id);
      if (streamIds.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from('students')
        .select('id, full_name, student_number, photo_url, streams(name, grades(name))')
        .in('stream_id', streamIds)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function STStudents() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const staffId = user?.staffId ?? null;
  const schoolId = user?.schoolId ?? '';

  const { data: students, isLoading, isError, refetch, isRefetching } = useSTStudents(staffId, schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load students" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.header}>
          <ThemedText variant="h4">My Students</ThemedText>
        </View>

        {isLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : students?.length === 0 ? (
          <EmptyState title="No students found" description="Students appear once assigned to your classes." icon="people-outline" />
        ) : (
          students?.map((s: any) => (
            <Pressable
              key={s.id}
              onPress={() => {
                haptics.selection();
                router.push({ pathname: '/(app)/student/[id]', params: { id: s.id } } as any);
              }}
            >
              <Card style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Avatar name={s.full_name} photoUrl={s.photo_url} size={48} />
                  <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                    <ThemedText style={{ fontWeight: '600' }}>{s.full_name}</ThemedText>
                    <ThemedText variant="caption" color="muted">{s.student_number}</ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {s.streams?.grades?.name} {s.streams?.name}
                    </ThemedText>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
});
