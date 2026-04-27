import React, { useState, useMemo } from 'react';
import { View, StyleSheet, SafeAreaView, Pressable, RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  SearchBar, FAB, ListItemSkeleton, EmptyState, ErrorState,
  ListItem, Chip, Badge, ThemedText, FastList,
} from '../../../components/ui';
import { useAllStudents } from '../../../hooks/useStudents';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

function useStreamsFilter(schoolId: string) {
  return useQuery({
    queryKey: ['streams-filter', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('streams').select('id, name, grades(id, name)')
        .eq('school_id', schoolId).order('name');
      return (data ?? []) as any[];
    },
  });
}

export default function AdminStudentsScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const schoolId   = user?.schoolId ?? '';

  const [search, setSearch]           = useState('');
  const [streamFilter, setStreamFilter] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: students = [], isLoading, isError, refetch, isRefetching } =
    useAllStudents(schoolId, { streamId: streamFilter, activeOnly: !showInactive });
  const { data: streams = [] } = useStreamsFilter(schoolId);

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      s.full_name.toLowerCase().includes(q) || s.student_number.toLowerCase().includes(q)
    );
  }, [students, search]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load students" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <ThemedText variant="h2">Students</ThemedText>
          {!isLoading && (
            <ThemedText variant="caption" color="muted">
              {filtered.length} {showInactive ? '' : 'active '}student{filtered.length !== 1 ? 's' : ''}
            </ThemedText>
          )}
        </View>
        <Pressable
          onPress={() => setShowInactive(v => !v)}
          style={[styles.pill, { backgroundColor: showInactive ? colors.brand.primarySoft : colors.surfaceSecondary, borderColor: showInactive ? colors.brand.primary : colors.border }]}
        >
          <ThemedText style={{ fontSize: 12, fontWeight: '600', color: showInactive ? colors.brand.primary : colors.textMuted }}>
            {showInactive ? 'All' : 'Active'}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(app)/(admin)/student-import' as any)}
          style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        >
          <Ionicons name="cloud-upload-outline" size={14} color={colors.brand.primary} />
          <ThemedText style={{ fontSize: 12, fontWeight: '600', color: colors.brand.primary, marginLeft: 4 }}>Import</ThemedText>
        </Pressable>
      </View>

      {/* ── Search ── */}
      <View style={{ paddingHorizontal: Spacing.screen, paddingBottom: Spacing.xs }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name or student number…" />
      </View>

      {/* ── Stream chips ── */}
      {streams.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <Chip label="All" selected={!streamFilter} onPress={() => setStreamFilter(null)} />
          {streams.map((s: any) => (
            <Chip
              key={s.id}
              label={`${s.grades?.name ?? ''} ${s.name}`}
              selected={streamFilter === s.id}
              onPress={() => setStreamFilter(streamFilter === s.id ? null : s.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <View style={{ paddingHorizontal: Spacing.screen }}>
          {Array.from({ length: 7 }).map((_, i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No results' : 'No students'}
          description={search ? 'Try a different name or number.' : 'Tap + to add a student or use Import for bulk CSV.'}
          icon="people-outline"
        />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: s }) => (
            <View style={[styles.rowCard, { backgroundColor: colors.surface }, Shadow.sm]}>
              <ListItem
                title={s.full_name}
                subtitle={[s.student_number, s.grade_name && `${s.grade_name} ${s.stream_name}`].filter(Boolean).join(' · ')}
                avatarName={s.full_name}
                avatarUrl={s.photo_url}
                avatarSize={44}
                badge={!s.is_active ? { label: 'Inactive', preset: 'neutral' } : undefined}
                showChevron
                onPress={() => { haptics.selection(); router.push({ pathname: '/(app)/student/[id]' as any, params: { id: s.id } }); }}
                trailing={
                  <Pressable
                    onPress={() => { haptics.selection(); router.push({ pathname: '/(app)/(admin)/student-edit' as any, params: { student_id: s.id } }); }}
                    hitSlop={8}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                }
              />
            </View>
          )}
        />
      )}

      <FAB
        icon={<Ionicons name="add" size={24} color="#fff" />}
        onPress={() => { haptics.medium(); router.push('/(app)/(admin)/student-add' as any); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.md, gap: Spacing.sm },
  pill:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  chipsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm },
  list:    { paddingHorizontal: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT, gap: Spacing.sm },
  rowCard: { borderRadius: Radius.lg, overflow: 'hidden' },
});
