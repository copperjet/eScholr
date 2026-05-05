import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  SearchBar, ListItem, Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';

function useStaffList(schoolId: string) {
  return useQuery({
    queryKey: ['hr-staff-list', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name, staff_number, email, department, photo_url, staff_roles(role)')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function HRStaff() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [search, setSearch] = useState('');

  const { data: staff, isLoading, isError, refetch, isRefetching } = useStaffList(schoolId);

  const filtered = (staff ?? []).filter((s: any) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.staff_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.department ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load staff" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Staff Directory" />
      <View style={styles.searchBar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, number, department…" />
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skRow}>
              <Skeleton width={46} height={46} radius={23} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="52%" height={14} />
                <Skeleton width="35%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No results' : 'No staff found'}
          description={search ? `No staff match "${search}"` : 'Staff records appear once added by admin.'}
          icon="people-outline"
        />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: s }: { item: any }) => {
            const subtitle = [s.staff_number, s.department].filter(Boolean).join(' · ');
            return (
              <ListItem
                title={s.full_name}
                subtitle={subtitle || s.email}
                caption={subtitle ? s.email : undefined}
                avatarName={s.full_name}
                avatarUrl={s.photo_url}
                showChevron
                separator
                onPress={() => router.push({
                  pathname: '/(app)/(hr)/staff-detail' as any,
                  params: { staffId: s.id, staffName: s.full_name },
                })}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  searchBar: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  skRow:     { flexDirection: 'row', alignItems: 'center' },
});
