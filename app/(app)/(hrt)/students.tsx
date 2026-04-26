import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { SearchBar, ListItem, Skeleton, EmptyState, ErrorState } from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';

function useStudents(schoolId: string) {
  return useQuery({
    queryKey: ['hrt-students', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, student_number, photo_url, status, streams(name, grades(name))')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      return (data ?? []) as any[];
    },
  });
}

export default function HRTStudentsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const { data: students, isLoading, isError, refetch, isFetching } = useStudents(user?.schoolId ?? '');

  const filtered = (students ?? []).filter((s: any) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.student_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load students" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or ID…" />
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skRow}>
              <Skeleton width={46} height={46} radius={23} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="52%" height={14} />
                <Skeleton width="30%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No results' : 'No students yet'}
          description={search ? `No students match "${search}"` : 'Students in your class will appear here.'}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item }) => {
            const gradeName = item.streams?.grades?.name ?? '';
            const streamName = item.streams?.name ?? '';
            const subtitle = [item.student_number, gradeName ? `${gradeName}${streamName ? ' ' + streamName : ''}` : streamName]
              .filter(Boolean).join('  ·  ');
            return (
              <ListItem
                title={item.full_name}
                subtitle={subtitle}
                avatarName={item.full_name}
                avatarUrl={item.photo_url}
                showChevron
                separator
                onPress={() => router.push({ pathname: '/(app)/student/[id]' as any, params: { id: item.id } })}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  skRow: { flexDirection: 'row', alignItems: 'center' },
  list: { paddingBottom: 100 },
});
