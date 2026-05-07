import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  SearchBar, ListItem, Skeleton, EmptyState, ErrorState,
  ScreenHeader, FastList, FilterChipRow,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { useStaffList } from '../../../hooks/useStaffRecords';

type StaffTypeFilter = 'all' | 'teacher' | 'support' | 'substitute' | 'administrator';

const TYPE_CHIPS: Array<{ label: string; value: StaffTypeFilter }> = [
  { label: 'All',           value: 'all' },
  { label: 'Teachers',      value: 'teacher' },
  { label: 'Support',       value: 'support' },
  { label: 'Substitutes',   value: 'substitute' },
  { label: 'Administrators',value: 'administrator' },
];

export default function HRStaff() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<StaffTypeFilter>('all');

  const { data: staff, isLoading, isError, refetch, isRefetching } = useStaffList(schoolId, 'active');

  const filtered = (staff ?? []).filter((s: any) => {
    const matchSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.staff_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.department ?? '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || s.staff_type === typeFilter;
    return matchSearch && matchType;
  });

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load staff" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Staff Directory"
        right={
          <Pressable
            onPress={() => router.push('/(app)/(hr)/staff-add' as any)}
            style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        }
      />

      <View style={styles.searchBar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, number, department…" />
      </View>

      <FilterChipRow
        options={TYPE_CHIPS.map((c) => c.label)}
        selected={TYPE_CHIPS.find((c) => c.value === typeFilter)?.label ?? 'All'}
        onSelect={(label) => setTypeFilter(TYPE_CHIPS.find((c) => c.label === label)?.value ?? 'all')}
        style={{ paddingHorizontal: Spacing.screen, marginBottom: Spacing.sm }}
      />

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
          title={search || typeFilter !== 'all' ? 'No results' : 'No staff found'}
          description={search ? `No staff match "${search}"` : 'Add staff with the + button.'}
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
  addBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
