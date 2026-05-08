/**
 * Students — /(app)/(frontdesk)/students
 * Front desk: view + search all students using canonical query key.
 */
import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, SearchBar, FAB, ListItemSkeleton, EmptyState,
  ErrorState, ListItem, IconChip, FastList,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

function useStudentList(schoolId: string) {
  return useQuery<any[]>({
    queryKey: ['students', 'list', { schoolId, status: 'active' }],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('students')
        .select(`
          id, full_name, student_number, gender, photo_url, status,
          streams ( name, grades ( name, school_sections ( name ) ) )
        `)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export default function FDStudentsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useStudentList(schoolId);

  const filtered = (data ?? []).filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.full_name?.toLowerCase().includes(q) || s.student_number?.includes(q);
  });

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load students" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <ThemedText variant="h2">Students</ThemedText>
        <ThemedText variant="caption" color="muted">
          {isLoading ? '…' : `${(data ?? []).length} active`}
        </ThemedText>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or number…" />
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: Spacing.screen }}>
          {Array.from({ length: 6 }).map((_, i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? `No results for "${search}"` : 'No active students'}
          description={search ? '' : 'Import students or enroll applications.'}
          icon="people-outline"
        />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={(s: any) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: s }: { item: any }) => {
            const initials = (s.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            const grade = s.streams?.grades?.name ?? '';
            const stream = s.streams?.name ?? '';
            const subtitle = [grade, stream].filter(Boolean).join(' · ');

            return (
              <View style={[styles.rowCard, { backgroundColor: colors.surface }, Shadow.sm]}>
                <ListItem
                  title={s.full_name}
                  subtitle={subtitle || 'No class assigned'}
                  caption={s.student_number}
                  leading={
                    <IconChip
                      icon={<ThemedText style={{ color: colors.brand.primary, fontSize: 15, fontWeight: '700' }}>{initials}</ThemedText>}
                      bg={colors.brand.primary + '18'}
                      size={44}
                      radius={22}
                    />
                  }
                  onPress={() => {
                    haptics.selection();
                    router.push({ pathname: '/(app)/(frontdesk)/student-detail' as any, params: { id: s.id } });
                  }}
                />
              </View>
            );
          }}
        />
      )}

      <FAB
        icon={<Ionicons name="person-add" size={22} color="#fff" />}
        label="Add Student"
        onPress={() => router.push('/(app)/(frontdesk)/student-edit' as any)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  searchWrap: { paddingHorizontal: Spacing.screen, paddingBottom: Spacing.sm },
  list:       { paddingHorizontal: Spacing.screen, paddingTop: Spacing.xs, paddingBottom: TAB_BAR_HEIGHT + 80, gap: Spacing.sm },
  rowCard:    { borderRadius: Radius.lg, overflow: 'hidden' },
});
