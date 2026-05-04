import React, { useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, Badge, Button, StatCard, SectionHeader,
  EmptyState, ErrorState, ListItemSkeleton, SearchBar, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { useLeaveBalances, useInitializeLeaveBalances } from '../../../hooks/useLeave';

const LEAVE_TYPES = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'unpaid'];

const DEFAULT_ENTITLEMENTS: Record<string, number> = {
  annual: 21,
  sick: 30,
  maternity: 90,
  paternity: 7,
  compassionate: 5,
  unpaid: 0,
};

interface StaffRow {
  id: string;
  full_name: string;
  photo_url: string | null;
  staff_number: string | null;
  status: string;
}

function useStaffList(schoolId: string) {
  return useQuery({
    queryKey: ['staff-list', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name, photo_url, staff_number, status')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
}

export default function HRLeaveBalances() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [search, setSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  const { data: staffList, isLoading: staffLoading, isError: staffError, refetch: refetchStaff } = useStaffList(schoolId);
  const { data: balances, isLoading: balLoading, refetch: refetchBal } = useLeaveBalances(selectedStaffId, schoolId, currentYear);
  const initMutation = useInitializeLeaveBalances(schoolId);

  const filteredStaff = useMemo(() => {
    if (!search.trim()) return staffList ?? [];
    const q = search.toLowerCase();
    return (staffList ?? []).filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.staff_number?.toLowerCase() ?? '').includes(q)
    );
  }, [staffList, search]);

  const selectedStaff = staffList?.find(s => s.id === selectedStaffId);

  const handleInitialize = async () => {
    if (!selectedStaffId) return;
    const entitlements = LEAVE_TYPES.map(type => ({
      leaveType: type,
      days: DEFAULT_ENTITLEMENTS[type] ?? 0,
    }));
    try {
      await initMutation.mutateAsync({
        staffId: selectedStaffId,
        year: currentYear,
        entitlements,
      });
      Alert.alert('Initialized', `Leave balances set for ${currentYear}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (staffError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load staff" description="Try again." onRetry={refetchStaff} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={staffLoading} onRefresh={refetchStaff} tintColor={colors.brand.primary} />}
      >
        <ScreenHeader title="Leave Balances" subtitle={`${currentYear} Leave Year`} showBack />

        {/* Search */}
        <View style={{ paddingHorizontal: Spacing.screen, marginBottom: Spacing.md }}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search staff..." />
        </View>

        {/* Staff list (horizontal chips) */}
        <SectionHeader title={`Staff (${filteredStaff.length})`} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {staffLoading ? (
            <View style={{ paddingHorizontal: Spacing.md, gap: 8 }}>
              <View style={{ height: 16, width: '40%', backgroundColor: colors.surfaceSecondary, borderRadius: 4 }} />
            </View>
          ) : filteredStaff.length === 0 ? (
            <ThemedText color="muted" style={{ padding: Spacing.md }}>No staff found</ThemedText>
          ) : (
            filteredStaff.map(s => {
              const active = s.id === selectedStaffId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSelectedStaffId(s.id)}
                  style={[styles.staffChip, {
                    backgroundColor: active ? colors.brand.primarySoft : colors.surface,
                    borderColor: active ? colors.brand.primary : colors.border,
                  }]}
                >
                  <Avatar name={s.full_name} photoUrl={s.photo_url} size={36} />
                  <View style={{ marginLeft: Spacing.sm }}>
                    <ThemedText style={{ fontSize: 13, fontWeight: active ? '600' : '400' }} numberOfLines={1}>
                      {s.full_name}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">{s.staff_number ?? '—'}</ThemedText>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Selected staff balances */}
        {selectedStaff && (
          <>
            <SectionHeader
              title={selectedStaff.full_name}
              action={balances && balances.length > 0 ? 'Reset' : 'Initialize'}
              onAction={handleInitialize}
            />

            {balLoading ? (
              <Card style={{ marginHorizontal: Spacing.screen, padding: Spacing.lg }}>
                <ListItemSkeleton />
              </Card>
            ) : !balances || balances.length === 0 ? (
              <Card variant="tinted" style={{ marginHorizontal: Spacing.screen, padding: Spacing.lg, alignItems: 'center' }}>
                <ThemedText color="muted" style={{ marginBottom: Spacing.md }}>
                  No leave balances initialized for {currentYear}
                </ThemedText>
                <Button
                  label={initMutation.isPending ? 'Initializing...' : `Initialize ${currentYear} Balances`}
                  onPress={handleInitialize}
                  disabled={initMutation.isPending}
                  size="sm"
                />
              </Card>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {balances.map(b => (
                  <Card key={b.id} style={{ marginHorizontal: Spacing.screen, padding: Spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <ThemedText style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                          {b.leave_type} Leave
                        </ThemedText>
                        <ThemedText variant="caption" color="muted">
                          Entitlement: {b.entitlement_days} days
                        </ThemedText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                          <StatCompact label="Used" value={b.used_days} color={Colors.semantic.warning} />
                          <StatCompact label="Left" value={b.remaining_days} color={b.remaining_days > 0 ? Colors.semantic.success : Colors.semantic.error} />
                        </View>
                      </View>
                    </View>
                    {/* Mini progress bar */}
                    <View style={[styles.progressBg, { backgroundColor: colors.surfaceSecondary }]}>
                      <View
                        style={[styles.progressFill, {
                          width: `${Math.min(100, (b.used_days / Math.max(1, b.entitlement_days)) * 100)}%`,
                          backgroundColor: b.remaining_days > 0 ? Colors.semantic.success : Colors.semantic.error,
                        }]}
                      />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}

        {!selectedStaff && (
          <EmptyState
            title="Select a staff member"
            description="Tap a staff card above to view their leave balances."
            icon="people-outline"
          />
        )}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCompact({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 48 }}>
      <ThemedText style={{ fontSize: 16, fontWeight: '700', color }}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  chipRow: {
    paddingHorizontal: Spacing.screen, gap: Spacing.sm, paddingBottom: Spacing.md,
  },
  staffChip: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1,
    minWidth: 160,
  },
  progressBg: {
    height: 6, borderRadius: 3, marginTop: Spacing.sm, overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
