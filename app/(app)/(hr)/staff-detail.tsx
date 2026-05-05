import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, ScreenHeader, Avatar, Card, Badge, SectionHeader,
  Skeleton, ErrorState, EmptyState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useStaffDetail(staffId: string, schoolId: string) {
  return useQuery({
    queryKey: ['hr-staff-detail', staffId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const db = supabase as any;
      const [staffRes, rolesRes, leaveRes, balancesRes, attRes] = await Promise.all([
        db.from('staff')
          .select('id, full_name, email, staff_number, phone, department, position, employment_type, status, hire_date, photo_url, national_id, address, emergency_contact_name, emergency_contact_phone, created_at')
          .eq('id', staffId)
          .eq('school_id', schoolId)
          .single(),

        db.from('staff_roles')
          .select('role, section_id, subject_id, sections(name), subjects(name)')
          .eq('staff_id', staffId)
          .eq('school_id', schoolId),

        db.from('leave_requests')
          .select('id, leave_type, start_date, end_date, days_requested, status, reason, created_at, approved_at, rejection_reason')
          .eq('staff_id', staffId)
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })
          .limit(20),

        db.from('staff_leave_balances')
          .select('leave_type, entitlement_days, used_days, remaining_days, year')
          .eq('staff_id', staffId)
          .eq('school_id', schoolId)
          .eq('year', new Date().getFullYear()),

        // Recent attendance — last 30 days if table has staff attendance
        db.from('attendance_records')
          .select('date, status')
          .eq('school_id', schoolId)
          .limit(1)
          .maybeSingle(), // just probe — staff attendance might not exist
      ]);

      return {
        staff: staffRes.data,
        roles: rolesRes.data ?? [],
        leaveHistory: leaveRes.data ?? [],
        leaveBalances: balancesRes.data ?? [],
      };
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const LEAVE_PRESET: Record<string, string> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
  cancelled: 'neutral',
};

export default function HRStaffDetail() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { staffId, staffName } = useLocalSearchParams<{ staffId: string; staffName?: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isError, refetch, isFetching } = useStaffDetail(staffId ?? '', schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Staff Profile" showBack />
        <ErrorState title="Could not load staff data" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const staff = data?.staff;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={staffName ?? 'Staff Profile'} showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? <LoadingSkeleton colors={colors} /> : staff ? (
          <>
            {/* ── Profile card ── */}
            <Card style={styles.card}>
              <View style={styles.profileRow}>
                <Avatar name={staff.full_name} photoUrl={staff.photo_url} size={64} />
                <View style={{ flex: 1, marginLeft: Spacing.base }}>
                  <ThemedText variant="h2" numberOfLines={2}>{staff.full_name}</ThemedText>
                  {staff.position && <ThemedText variant="bodySm" color="muted">{staff.position}</ThemedText>}
                  {staff.department && <ThemedText variant="caption" color="muted">{staff.department}</ThemedText>}
                  <Badge
                    label={staff.status ?? 'active'}
                    preset={staff.status === 'active' ? 'success' : 'neutral'}
                    style={{ marginTop: Spacing.xs, alignSelf: 'flex-start' }}
                  />
                </View>
              </View>
            </Card>

            {/* ── Employment info ── */}
            <SectionHeader title="Employment" />
            <Card style={styles.card}>
              <MetaGrid items={[
                { label: 'Staff No.', value: staff.staff_number },
                { label: 'Employment Type', value: staff.employment_type },
                { label: 'Hire Date', value: staff.hire_date ? format(new Date(staff.hire_date), 'dd MMM yyyy') : null },
                { label: 'Email', value: staff.email },
                { label: 'Phone', value: staff.phone },
              ]} />
            </Card>

            {/* ── Personal info ── */}
            {(staff.national_id || staff.address || staff.emergency_contact_name) && (
              <>
                <SectionHeader title="Personal" />
                <Card style={styles.card}>
                  <MetaGrid items={[
                    { label: 'National ID', value: staff.national_id },
                    { label: 'Address', value: staff.address },
                    { label: 'Emergency Contact', value: staff.emergency_contact_name },
                    { label: 'Emergency Phone', value: staff.emergency_contact_phone },
                  ]} />
                </Card>
              </>
            )}

            {/* ── Roles / assignments ── */}
            {(data?.roles ?? []).length > 0 && (
              <>
                <SectionHeader title="Roles & Assignments" />
                <Card style={styles.card}>
                  {data!.roles.map((r: any, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.roleRow,
                        i < data!.roles.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={[styles.roleIcon, { backgroundColor: colors.brand.primary + '18' }]}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                          {r.role?.replace(/_/g, ' ') ?? '—'}
                        </ThemedText>
                        {(r.sections?.name || r.subjects?.name) && (
                          <ThemedText variant="caption" color="muted">
                            {[r.sections?.name, r.subjects?.name].filter(Boolean).join(' · ')}
                          </ThemedText>
                        )}
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {/* ── Leave balances ── */}
            {(data?.leaveBalances ?? []).length > 0 && (
              <>
                <SectionHeader title={`Leave Balances (${new Date().getFullYear()})`} />
                <Card style={styles.card}>
                  {data!.leaveBalances.map((b: any, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.balanceRow,
                        i < data!.leaveBalances.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                          {b.leave_type?.replace(/_/g, ' ')}
                        </ThemedText>
                        <ThemedText variant="caption" color="muted">
                          Used {b.used_days} / {b.entitlement_days} days
                        </ThemedText>
                      </View>
                      <View style={styles.balancePill}>
                        <ThemedText style={{ fontWeight: '800', fontSize: 16, color: b.remaining_days > 0 ? Colors.semantic.success : Colors.semantic.error }}>
                          {b.remaining_days}
                        </ThemedText>
                        <ThemedText variant="caption" color="muted"> left</ThemedText>
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {/* ── Leave history ── */}
            <SectionHeader title="Leave History" />
            {(data?.leaveHistory ?? []).length === 0 ? (
              <EmptyState title="No leave requests" description="No leave taken." icon="calendar-outline" />
            ) : (
              data!.leaveHistory.map((leave: any) => (
                <Card key={leave.id} style={[styles.card, styles.leaveCard]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                        {leave.leave_type?.replace(/_/g, ' ')}
                      </ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {leave.start_date ? format(new Date(leave.start_date), 'd MMM yyyy') : '—'}
                        {' – '}
                        {leave.end_date ? format(new Date(leave.end_date), 'd MMM yyyy') : '—'}
                        {' · '}{leave.days_requested} day{leave.days_requested !== 1 ? 's' : ''}
                      </ThemedText>
                      {leave.reason && (
                        <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={2}>
                          {leave.reason}
                        </ThemedText>
                      )}
                      {leave.rejection_reason && (
                        <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: 2 }}>
                          Rejected: {leave.rejection_reason}
                        </ThemedText>
                      )}
                    </View>
                    <Badge
                      label={leave.status}
                      preset={(LEAVE_PRESET[leave.status] ?? 'neutral') as any}
                    />
                  </View>
                </Card>
              ))
            )}

            <View style={{ height: 48 }} />
          </>
        ) : (
          <EmptyState title="Staff not found" icon="person-outline" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaGrid({ items }: { items: Array<{ label: string; value?: string | null }> }) {
  const filled = items.filter((i) => i.value);
  if (filled.length === 0) return null;
  return (
    <View style={styles.metaGrid}>
      {filled.map((item) => (
        <View key={item.label} style={styles.metaItem}>
          <ThemedText variant="caption" color="muted">{item.label}</ThemedText>
          <ThemedText variant="bodySm" style={{ fontWeight: '500' }}>{item.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function LoadingSkeleton({ colors }: { colors: any }) {
  return (
    <View style={{ padding: Spacing.screen, gap: Spacing.base }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.base }}>
        <Skeleton width={64} height={64} radius={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={18} />
          <Skeleton width="40%" height={13} />
        </View>
      </View>
      {[1, 2, 3].map((i) => <Skeleton key={i} height={80} radius={Radius.lg} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg },
  leaveCard: { padding: Spacing.md },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  metaItem: { minWidth: '44%', flex: 1 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  roleIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  balancePill: { flexDirection: 'row', alignItems: 'baseline' },
});
