/**
 * Users Hub — School Super Admin
 * Single tab housing Staff · Students · Parents segmented control.
 * Each segment renders a count + "Manage" CTA that pushes the existing screen.
 */
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, ScreenHeader, Avatar, Badge, FastList, EmptyState,
  ListItemSkeleton, SearchBar,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type Segment = 'staff' | 'students' | 'parents';
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const SEGMENTS: { value: Segment; label: string; icon: IoniconsName }[] = [
  { value: 'staff',    label: 'Staff',    icon: 'id-card-outline' },
  { value: 'students', label: 'Students', icon: 'people-outline' },
  { value: 'parents',  label: 'Parents',  icon: 'people-circle-outline' },
];

function useUserCounts(schoolId: string) {
  return useQuery({
    queryKey: ['user-hub-counts', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const [staff, students, parents] = await Promise.all([
        db.from('staff').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
        db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
        db.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      ]);
      return {
        staff:    staff.count ?? 0,
        students: students.count ?? 0,
        parents:  parents.count ?? 0,
      };
    },
  });
}

function useStaffList(schoolId: string, search: string) {
  return useQuery({
    queryKey: ['users-hub-staff', schoolId, search],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      let q = db.from('staff')
        .select('id, full_name, email, status, staff_number, auth_user_id')
        .eq('school_id', schoolId)
        .order('full_name')
        .limit(50);
      if (search.trim()) q = q.ilike('full_name', `%${search.trim()}%`);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });
}

function useStudentsList(schoolId: string, search: string) {
  return useQuery({
    queryKey: ['users-hub-students', schoolId, search],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      let q = db.from('students')
        .select('id, full_name, student_number, status, photo_url, streams(name, grades(name))')
        .eq('school_id', schoolId)
        .order('full_name')
        .limit(50);
      if (search.trim()) q = q.ilike('full_name', `%${search.trim()}%`);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });
}

function useParentsList(schoolId: string, search: string) {
  return useQuery({
    queryKey: ['users-hub-parents', schoolId, search],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      let q = db.from('parents')
        .select('id, full_name, email, phone, relationship, auth_user_id')
        .eq('school_id', schoolId)
        .order('full_name')
        .limit(50);
      if (search.trim()) q = q.ilike('full_name', `%${search.trim()}%`);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });
}

export default function UsersHubScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [segment, setSegment] = useState<Segment>('staff');
  const [search, setSearch] = useState('');

  const counts = useUserCounts(schoolId);
  const staff    = useStaffList(schoolId,    segment === 'staff'    ? search : '');
  const students = useStudentsList(schoolId, segment === 'students' ? search : '');
  const parents  = useParentsList(schoolId,  segment === 'parents'  ? search : '');

  const goManage = () => {
    haptics.light();
    if (segment === 'staff')    router.push('/(app)/(admin)/staff' as any);
    if (segment === 'students') router.push('/(app)/(admin)/students' as any);
    if (segment === 'parents')  router.push('/(app)/(admin)/parents' as any);
  };

  const renderStaffRow = ({ item }: { item: any }) => (
    <Pressable onPress={() => router.push('/(app)/(admin)/staff' as any)} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar name={item.full_name} size={40} />
      <View style={{ flex: 1 }}>
        <ThemedText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{item.full_name}</ThemedText>
        <ThemedText variant="caption" color="muted" numberOfLines={1}>{item.staff_number ?? '—'} · {item.email}</ThemedText>
      </View>
      {!item.auth_user_id && (
        <View style={[styles.warnPill, { borderColor: Colors.semantic.warning }]}>
          <ThemedText variant="label" style={{ color: Colors.semantic.warning, fontSize: 9 }}>NO LOGIN</ThemedText>
        </View>
      )}
      <Badge label={item.status} preset={item.status === 'active' ? 'success' : 'neutral'} />
    </Pressable>
  );

  const renderStudentRow = ({ item }: { item: any }) => (
    <Pressable onPress={() => router.push({ pathname: '/(app)/student/[id]' as any, params: { id: item.id } })} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar name={item.full_name} photoUrl={item.photo_url} size={40} />
      <View style={{ flex: 1 }}>
        <ThemedText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{item.full_name}</ThemedText>
        <ThemedText variant="caption" color="muted" numberOfLines={1}>
          {item.student_number} · {item.streams?.grades?.name ?? '—'} {item.streams?.name ?? ''}
        </ThemedText>
      </View>
      <Badge label={item.status === 'active' ? 'Active' : 'Inactive'} preset={item.status === 'active' ? 'success' : 'neutral'} />
    </Pressable>
  );

  const renderParentRow = ({ item }: { item: any }) => (
    <Pressable onPress={() => router.push('/(app)/(admin)/parents' as any)} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar name={item.full_name} size={40} />
      <View style={{ flex: 1 }}>
        <ThemedText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{item.full_name}</ThemedText>
        <ThemedText variant="caption" color="muted" numberOfLines={1}>{item.relationship} · {item.email}</ThemedText>
      </View>
      {!item.auth_user_id && (
        <View style={[styles.warnPill, { borderColor: Colors.semantic.warning }]}>
          <ThemedText variant="label" style={{ color: Colors.semantic.warning, fontSize: 9 }}>NO LOGIN</ThemedText>
        </View>
      )}
    </Pressable>
  );

  const activeQuery = segment === 'staff' ? staff : segment === 'students' ? students : parents;
  const data = (activeQuery.data ?? []) as any[];
  const isLoading = activeQuery.isLoading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Users" />

      {/* Stat strip */}
      <View style={styles.statsRow}>
        {SEGMENTS.map(s => {
          const count = (counts.data as any)?.[s.value] ?? 0;
          const active = segment === s.value;
          return (
            <Pressable
              key={s.value}
              onPress={() => { haptics.selection(); setSegment(s.value); setSearch(''); }}
              style={[styles.statCard, { backgroundColor: active ? colors.brand.primary : colors.surface, borderColor: active ? colors.brand.primary : colors.border }]}
            >
              <Ionicons name={s.icon} size={18} color={active ? '#fff' : colors.brand.primary} />
              <ThemedText style={{ fontSize: 22, fontWeight: '800', color: active ? '#fff' : colors.textPrimary, marginTop: 4 }}>
                {counts.isLoading ? '…' : count}
              </ThemedText>
              <ThemedText variant="caption" style={{ color: active ? 'rgba(255,255,255,0.85)' : colors.textMuted }}>
                {s.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={`Search ${segment}…`} />
        <Pressable
          onPress={goManage}
          style={[styles.manageBtn, { backgroundColor: colors.brand.primary }]}
        >
          <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
          <ThemedText style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>
            Manage {SEGMENTS.find(s => s.value === segment)?.label} ({data.length}+)
          </ThemedText>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base }}>
          {Array.from({ length: 6 }).map((_, i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : data.length === 0 ? (
        <EmptyState
          title={search ? 'No results' : `No ${segment} yet`}
          description={search ? 'Try a different name.' : `Tap "Manage ${segment}" above to add the first one.`}
          icon={SEGMENTS.find(s => s.value === segment)?.icon}
        />
      ) : (
        <FastList
          data={data}
          keyExtractor={(it: any) => it.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isFetching && !isLoading}
              onRefresh={() => { activeQuery.refetch(); counts.refetch(); }}
              tintColor={colors.brand.primary}
            />
          }
          renderItem={
            segment === 'staff'    ? renderStaffRow
            : segment === 'students' ? renderStudentRow
            : renderParentRow
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  statCard: {
    flex: 1, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
    alignItems: 'center', gap: 2, ...Shadow.sm,
  },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.full, ...Shadow.sm,
  },
  list: { padding: Spacing.base, paddingBottom: TAB_BAR_HEIGHT + Spacing.xl, gap: Spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth,
    ...Shadow.sm,
  },
  warnPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
});
