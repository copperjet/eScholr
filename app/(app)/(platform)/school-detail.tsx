import React, { useState } from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet, Pressable,
  Alert, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Button, ErrorState, StatCard, SectionHeader, ListItemSkeleton,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// ── Types ────────────────────────────��────────────────────���───────────────────

type SubscriptionStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
type SubscriptionPlan   = 'starter' | 'growth' | 'scale' | 'enterprise';

// ── Data hooks ───────────────────────────────��────────────────────────────────

function useSchoolDetail(schoolId: string) {
  return useQuery({
    queryKey: ['platform-school-detail', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;

      const [schoolRes, studentsRes, staffRes, semesterRes] = await Promise.all([
        // Must use edge fn for school data — RLS blocks null school_id clients
        db.functions.invoke('get-schools-overview'),
        db.functions.invoke('get-school-stats', { body: { school_id: schoolId } }),
        // fallbacks from overview
        Promise.resolve(null),
        Promise.resolve(null),
      ]);

      // Get this school from overview data
      const overview = schoolRes.data as any;
      const school = (overview?.schools ?? []).find((s: any) => s.id === schoolId);
      if (!school) throw new Error('School not found');

      return {
        school,
        student_count: school.student_count ?? 0,
        staff_count:   school.staff_count   ?? 0,
      };
    },
  });
}

function useUpdateSchool(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { subscription_plan?: SubscriptionPlan; subscription_status?: SubscriptionStatus }) => {
      const { error } = await (supabase as any).functions.invoke('update-school', {
        body: { school_id: schoolId, ...patch },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-schools-overview'] });
      qc.invalidateQueries({ queryKey: ['platform-school-detail', schoolId] });
    },
  });
}

// ── Status/Plan selectors ────────────────────────────────���────────────────────

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string; color: string }[] = [
  { value: 'active',    label: 'Active',    color: Colors.semantic.success },
  { value: 'trial',     label: 'Trial',     color: Colors.semantic.warning },
  { value: 'suspended', label: 'Suspended', color: '#DC2626' },
  { value: 'cancelled', label: 'Cancelled', color: '#6B7280' },
];

const PLAN_OPTIONS: { value: SubscriptionPlan; label: string; desc: string }[] = [
  { value: 'starter',    label: 'Starter',    desc: 'Up to 200 students' },
  { value: 'growth',     label: 'Growth',     desc: 'Up to 500 students' },
  { value: 'scale',      label: 'Scale',      desc: 'Up to 2 000 students' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Unlimited' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SchoolDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useSchoolDetail(id ?? '');
  const updateSchool = useUpdateSchool(id ?? '');

  const school = data?.school;

  const handleStatusChange = (status: SubscriptionStatus) => {
    if (status === school?.subscription_status) return;
    Alert.alert(
      'Change Status',
      `Set "${school?.name}" to ${status.toUpperCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            haptics.light();
            updateSchool.mutate({ subscription_status: status });
          },
        },
      ]
    );
  };

  const handlePlanChange = (plan: SubscriptionPlan) => {
    if (plan === school?.subscription_plan) return;
    Alert.alert(
      'Change Plan',
      `Switch "${school?.name}" to ${plan.toUpperCase()} plan?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            haptics.light();
            updateSchool.mutate({ subscription_plan: plan });
          },
        },
      ]
    );
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ErrorState title="Could not load school" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
            {isLoading ? 'Loading…' : school?.name}
          </ThemedText>
          {school && (
            <ThemedText variant="caption" color="muted">{school.code}</ThemedText>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {isLoading ? (
          <View style={{ padding: Spacing.screen, gap: Spacing.base }}>
            {[0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)}
          </View>
        ) : school ? (
          <>
            {/* ── Color banner ── */}
            <View style={[styles.banner, { backgroundColor: school.primary_color ?? colors.brand.primary }]}>
              <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>{school.name}</ThemedText>
              <View style={[styles.bannerBadge, { backgroundColor: school.secondary_color ?? 'rgba(255,255,255,0.2)' }]}>
                <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{school.code}</ThemedText>
              </View>
              <ThemedText style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {school.country ?? '—'} · Created {format(new Date(school.created_at), 'd MMM yyyy')}
              </ThemedText>
            </View>

            {/* ── Stats ── */}
            <View style={styles.statRow}>
              <StatCard label="Students" value={data?.student_count ?? 0} icon="people" iconBg={Colors.semantic.infoLight} iconColor={Colors.semantic.info} style={styles.statCell} />
              <StatCard label="Staff"    value={data?.staff_count   ?? 0} icon="id-card" iconBg={Colors.semantic.successLight} iconColor={Colors.semantic.success} style={styles.statCell} />
            </View>

            {/* ── Subscription status ── */}
            <SectionHeader title="Subscription Status" />
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleStatusChange(opt.value)}
                  style={[
                    styles.bigChip,
                    {
                      backgroundColor: school.subscription_status === opt.value ? opt.color : colors.surfaceSecondary,
                      borderColor: school.subscription_status === opt.value ? opt.color : colors.border,
                    },
                  ]}
                >
                  {school.subscription_status === opt.value && (
                    <Ionicons name="checkmark-circle" size={14} color="#fff" style={{ marginRight: 4 }} />
                  )}
                  <ThemedText style={{
                    fontSize: 13, fontWeight: '700',
                    color: school.subscription_status === opt.value ? '#fff' : colors.text,
                  }}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {/* ── Plan ── */}
            <SectionHeader title="Subscription Plan" />
            <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
              {PLAN_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handlePlanChange(opt.value)}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: school.subscription_plan === opt.value ? colors.brand.primary + '15' : colors.surfaceSecondary,
                      borderColor: school.subscription_plan === opt.value ? colors.brand.primary : colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>{opt.label}</ThemedText>
                    <ThemedText variant="caption" color="muted">{opt.desc}</ThemedText>
                  </View>
                  {school.subscription_plan === opt.value && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.brand.primary} />
                  )}
                </Pressable>
              ))}
            </View>

            {updateSchool.isError && (
              <View style={[styles.errorBox, { backgroundColor: '#FEE2E2', marginHorizontal: Spacing.screen, marginTop: Spacing.base }]}>
                <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>
                  Update failed. Try again.
                </ThemedText>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  banner: {
    padding: Spacing['2xl'], gap: 8,
  },
  bannerBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  statRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.base, gap: Spacing.sm,
  },
  statCell: { flex: 1 },
  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: Spacing.screen, gap: Spacing.sm,
  },
  bigChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1.5,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md,
  },
});
