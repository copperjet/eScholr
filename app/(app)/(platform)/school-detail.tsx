import React, { useState } from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet, Pressable, Image,
  Alert, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Button, ErrorState, StatCard, SectionHeader, ListItemSkeleton,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import {
  useUpdateSchoolPlatform, useSchoolNotes, useCreateSchoolNote,
  useDeleteSchoolNote, usePinSchoolNote, useImpersonateSchool,
  useImpersonationLog,
  useDeleteSchool, useSchoolAdmins, useInviteSchoolAdmin,
  useSchoolStaff, useAssignStaffRole, useRemoveStaffRole,
  ALL_STAFF_ROLES, StaffRole,
} from '../../../hooks/usePlatform';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
type SubscriptionPlan   = 'starter' | 'growth' | 'scale' | 'enterprise';
type Tab = 'info' | 'staff' | 'usage' | 'notes' | 'admins';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string; color: string }[] = [
  { value: 'active',    label: 'Active',    color: Colors.semantic.success },
  { value: 'trial',     label: 'Trial',     color: Colors.semantic.warning },
  { value: 'suspended', label: 'Suspended', color: '#DC2626' },
  { value: 'cancelled', label: 'Cancelled', color: '#6B7280' },
];

const PLAN_OPTIONS: { value: SubscriptionPlan; label: string; desc: string; price: string }[] = [
  { value: 'starter',    label: 'Starter',    desc: 'Up to 200 students',   price: 'K1,250/mo' },
  { value: 'growth',     label: 'Growth',     desc: 'Up to 500 students',   price: 'K3,750/mo' },
  { value: 'scale',      label: 'Scale',      desc: 'Up to 2 000 students', price: 'K10,000/mo' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Unlimited',            price: 'K25,000/mo' },
];

// ── useSchoolDetail ───────────────────────────────────────────────────────────

function useSchoolDetail(schoolId: string) {
  return useQuery({
    queryKey: ['platform-school-detail', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data: overviewData, error } = await (supabase as any).functions.invoke('get-schools-overview');
      if (error) throw new Error(error.message);
      const school = ((overviewData as any)?.schools ?? []).find((s: any) => s.id === schoolId);
      if (!school) throw new Error('School not found');
      return school as any;
    },
  });
}

// ── Info tab ──────────────────────────────────────────────────────────────────

function InfoTab({ school, colors, refetch, isFetching }: { school: any; colors: any; refetch: () => void; isFetching: boolean }) {
  const updateSchool = useUpdateSchoolPlatform(school.id);

  const handleStatusChange = (status: SubscriptionStatus) => {
    if (status === school.subscription_status) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`Set "${school.name}" to ${status.toUpperCase()}?`)) {
        haptics.light(); updateSchool.mutate({ subscription_status: status });
      }
      return;
    }
    Alert.alert('Change Status', `Set "${school.name}" to ${status.toUpperCase()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => { haptics.light(); updateSchool.mutate({ subscription_status: status }); } },
    ]);
  };

  const handlePlanChange = (plan: SubscriptionPlan) => {
    if (plan === school.subscription_plan) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`Switch "${school.name}" to ${plan.toUpperCase()} plan?`)) {
        haptics.light(); updateSchool.mutate({ subscription_plan: plan });
      }
      return;
    }
    Alert.alert('Change Plan', `Switch "${school.name}" to ${plan.toUpperCase()} plan?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => { haptics.light(); updateSchool.mutate({ subscription_plan: plan }); } },
    ]);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
    >
      <View style={styles.statRow}>
        <StatCard label="Students" value={school.student_count ?? 0} icon="people"  iconBg={Colors.semantic.infoLight}    iconColor={Colors.semantic.info}    style={styles.statCell} />
        <StatCard label="Staff"    value={school.staff_count   ?? 0} icon="id-card" iconBg={Colors.semantic.successLight} iconColor={Colors.semantic.success} style={styles.statCell} />
      </View>

      {/* School Info header with Edit button */}
      <View style={styles.sectionHeaderRow}>
        <ThemedText variant="label" color="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>SCHOOL INFO</ThemedText>
        <TouchableOpacity
          onPress={() => router.push((`/(app)/(platform)/onboard?editSchoolId=${school.id}`) as any)}
          style={styles.editChip}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={14} color={colors.brand.primary} />
          <ThemedText style={{ color: colors.brand.primary, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>Edit</ThemedText>
        </TouchableOpacity>
      </View>
      <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {school.logo_url ? (
          <View style={[styles.metaRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText variant="caption" color="muted" style={{ flex: 1 }}>Logo</ThemedText>
            <Image source={{ uri: school.logo_url }} style={{ width: 40, height: 40, borderRadius: 8 }} resizeMode="contain" />
          </View>
        ) : null}
        {[
          { label: 'Country',  value: school.country  ?? '—' },
          { label: 'Timezone', value: school.timezone ?? '—' },
          { label: 'Currency', value: school.currency ?? '—' },
          { label: 'Created',  value: format(new Date(school.created_at), 'dd/MM/yy') },
          { label: 'Renewal',  value: school.renewal_date ? format(new Date(school.renewal_date), 'dd/MM/yy') : '—' },
        ].map((row, i, arr) => (
          <View key={row.label} style={[styles.metaRow, i < arr.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText variant="caption" color="muted" style={{ flex: 1 }}>{row.label}</ThemedText>
            <ThemedText style={{ fontWeight: '600', fontSize: 14 }}>{row.value}</ThemedText>
          </View>
        ))}
      </View>

      <SectionHeader title="Subscription Status" />
      <View style={styles.chipRow}>
        {STATUS_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => handleStatusChange(opt.value)}
            style={[styles.bigChip, {
              backgroundColor: school.subscription_status === opt.value ? opt.color : colors.surfaceSecondary,
              borderColor:     school.subscription_status === opt.value ? opt.color : colors.border,
            }]}
          >
            {school.subscription_status === opt.value && (
              <Ionicons name="checkmark-circle" size={14} color="#fff" style={{ marginRight: 4 }} />
            )}
            <ThemedText style={{ fontSize: 13, fontWeight: '700', color: school.subscription_status === opt.value ? '#fff' : colors.textPrimary }}>
              {opt.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Subscription Plan" />
      <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
        {PLAN_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => handlePlanChange(opt.value)}
            style={[styles.planCard, {
              backgroundColor: school.subscription_plan === opt.value ? colors.brand.primary + '15' : colors.surfaceSecondary,
              borderColor:     school.subscription_plan === opt.value ? colors.brand.primary : colors.border,
            }]}
          >
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>{opt.label}</ThemedText>
              <ThemedText variant="caption" color="muted">{opt.desc}</ThemedText>
            </View>
            <ThemedText style={{ fontWeight: '700', fontSize: 13, color: colors.brand.primary }}>{opt.price}</ThemedText>
            {school.subscription_plan === opt.value && (
              <Ionicons name="checkmark-circle" size={22} color={colors.brand.primary} style={{ marginLeft: 6 }} />
            )}
          </Pressable>
        ))}
      </View>

      {updateSchool.isError && (
        <View style={[styles.errorBox, { backgroundColor: '#FEE2E2', marginHorizontal: Spacing.screen, marginTop: Spacing.base }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
          <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>Update failed. Try again.</ThemedText>
        </View>
      )}

      <DangerZone school={school} />
    </ScrollView>
  );
}

// ── Usage tab ─────────────────────────────────────────────────────────────────

function UsageTab({ school, colors, refetch, isFetching }: { school: any; colors: any; refetch: () => void; isFetching: boolean }) {
  const impersonate = useImpersonateSchool();
  const { data: impLog } = useImpersonationLog(school.id);
  const [impReason, setImpReason] = useState('');
  const [showReason, setShowReason] = useState(false);

  const doImpersonate = async () => {
    haptics.light();
    try {
      const result = await impersonate.mutateAsync({ school_id: school.id, reason: impReason || 'Support session' });
      setImpReason(''); setShowReason(false);
      if (result.method === 'magic_link' && result.action_link) {
        Alert.alert(
          '✓ Magic Link Ready',
          `Target: ${result.target_email}\nExpires: ${format(new Date(result.expires_at), 'HH:mm')}\n\nThe link has been logged. Share with support team to complete session.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Manual Required', `Target: ${result.target_email}\n\n${result.note ?? 'Use Supabase dashboard to reset password.'}`, [{ text: 'OK' }]);
      }
    } catch (e: any) {
      Alert.alert('Failed', e.message ?? 'Impersonation failed');
    }
  };

  const handleImpersonatePress = () => {
    if (!showReason) { setShowReason(true); return; }
    if (!impReason.trim()) { Alert.alert('Reason required', 'Enter a reason for this support session.'); return; }
    Alert.alert(
      'Impersonate School',
      `Log in as admin of "${school.name}"?\n\nReason: "${impReason}"\n\nThis action is permanently audit-logged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', style: 'destructive', onPress: doImpersonate },
      ]
    );
  };

  const statsData = [
    { label: 'Students',    value: school.student_count    ?? 0, icon: 'people-outline',        color: Colors.semantic.info },
    { label: 'Staff',       value: school.staff_count      ?? 0, icon: 'id-card-outline',       color: Colors.semantic.success },
    { label: 'Reports',     value: school.report_count     ?? 0, icon: 'document-text-outline', color: Colors.semantic.warning },
    { label: 'Attendance',  value: school.attendance_count ?? 0, icon: 'calendar-outline',      color: '#8B5CF6' },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
    >
      {/* Usage stats */}
      <SectionHeader title="Usage" />
      <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
        {statsData.map((s) => (
          <View key={s.label} style={[styles.usageRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.usageIcon, { backgroundColor: s.color + '20' }]}>
              <Ionicons name={s.icon as any} size={18} color={s.color} />
            </View>
            <ThemedText style={{ flex: 1, fontWeight: '500', fontSize: 15 }}>{s.label}</ThemedText>
            <ThemedText style={{ fontWeight: '700', fontSize: 17 }}>{s.value.toLocaleString()}</ThemedText>
          </View>
        ))}
      </View>

      {/* Impersonation */}
      <SectionHeader title="Support Impersonation" />
      <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
        <View style={[styles.impersonateCard, { backgroundColor: '#FFF7ED', borderColor: '#F59E0B' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="warning-outline" size={16} color="#D97706" />
            <ThemedText style={{ fontWeight: '700', fontSize: 13, color: '#D97706' }}>AUDIT-LOGGED ACTION</ThemedText>
          </View>
          <ThemedText style={{ fontSize: 13, color: '#92400E', lineHeight: 20 }}>
            Every impersonation session is permanently logged with timestamp, reason, and your identity.
          </ThemedText>
        </View>

        {showReason && (
          <View style={[styles.reasonInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              value={impReason}
              onChangeText={setImpReason}
              placeholder="Reason for access (e.g. billing dispute, data query)…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={200}
              style={{ fontSize: 14, color: colors.textPrimary, minHeight: 56 }}
            />
          </View>
        )}

        <TouchableOpacity
          onPress={handleImpersonatePress}
          disabled={impersonate.isPending}
          style={[styles.impersonateBtn, { backgroundColor: impersonate.isPending ? colors.border : colors.brand.primary }]}
        >
          {impersonate.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="log-in-outline" size={18} color="#fff" />
          }
          <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 8 }}>
            {showReason ? 'Confirm Impersonation' : 'Impersonate Admin'}
          </ThemedText>
        </TouchableOpacity>

        {showReason && (
          <TouchableOpacity onPress={() => { setShowReason(false); setImpReason(''); }}>
            <ThemedText style={{ textAlign: 'center', color: colors.textMuted, fontSize: 13, paddingVertical: 4 }}>Cancel</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {/* Recent sessions for this school */}
      {(impLog ?? []).length > 0 && (
        <>
          <SectionHeader title="Past Sessions" />
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
            {(impLog ?? []).slice(0, 5).map((log: any) => (
              <View key={log.id} style={[styles.impLogRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="shield-outline" size={15} color={colors.textMuted} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <ThemedText style={{ fontSize: 13, fontWeight: '500' }}>{log.target_email}</ThemedText>
                  <ThemedText variant="caption" color="muted">{log.reason ?? 'No reason'} · {format(new Date(log.created_at), 'd MMM HH:mm')}</ThemedText>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push('/(app)/(platform)/impersonation-log' as any)}>
              <ThemedText style={{ textAlign: 'center', color: colors.brand.primary, fontSize: 13, fontWeight: '600', paddingVertical: Spacing.sm }}>
                View all sessions →
              </ThemedText>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ school, colors }: { school: any; colors: any }) {
  const { data: notes, isLoading } = useSchoolNotes(school.id);
  const createNote = useCreateSchoolNote(school.id);
  const deleteNote = useDeleteSchoolNote(school.id);
  const pinNote    = usePinSchoolNote(school.id);
  const [draft, setDraft] = useState('');
  const [pinDraft, setPinDraft] = useState(false);

  const handleCreate = () => {
    if (!draft.trim()) return;
    createNote.mutate({ body: draft.trim(), is_pinned: pinDraft });
    setDraft(''); setPinDraft(false);
    haptics.light();
  };

  const handleDelete = (noteId: string) => {
    Alert.alert('Delete Note', 'Remove this note permanently?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { haptics.light(); deleteNote.mutate(noteId); } },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}>
        {/* Compose */}
        <SectionHeader title="Add Note" />
        <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
          <View style={[styles.noteInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Internal note (billing, support, agreements…)"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              style={{ fontSize: 14, color: colors.textPrimary, minHeight: 80 }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Pressable
              onPress={() => { haptics.light(); setPinDraft(!pinDraft); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name={pinDraft ? 'pin' : 'pin-outline'} size={16} color={pinDraft ? colors.brand.primary : colors.textMuted} />
              <ThemedText style={{ fontSize: 13, color: pinDraft ? colors.brand.primary : colors.textMuted }}>Pin note</ThemedText>
            </Pressable>
            <View style={{ flex: 1 }} />
            <ThemedText variant="caption" color="muted">{draft.length}/2000</ThemedText>
          </View>
          <Button
            label={createNote.isPending ? 'Saving…' : 'Add Note'}
            onPress={handleCreate}
            disabled={!draft.trim() || createNote.isPending}
            size="md"
          />
        </View>

        {/* Notes list */}
        <SectionHeader title={`Notes (${(notes ?? []).length})`} />
        <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
          {isLoading
            ? [0, 1].map((i) => <ListItemSkeleton key={i} />)
            : (notes ?? []).length === 0
              ? (
                <View style={[styles.emptyNotes, { borderColor: colors.border }]}>
                  <Ionicons name="document-outline" size={28} color={colors.textMuted} />
                  <ThemedText color="muted" style={{ marginTop: 8, textAlign: 'center' }}>No notes yet.</ThemedText>
                </View>
              )
              : (notes ?? []).map((note: any) => (
                <View key={note.id} style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {note.is_pinned && (
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={11} color={colors.brand.primary} />
                      <ThemedText style={{ fontSize: 11, color: colors.brand.primary, marginLeft: 3, fontWeight: '700' }}>PINNED</ThemedText>
                    </View>
                  )}
                  <ThemedText style={{ fontSize: 14, lineHeight: 21 }}>{note.body}</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: Spacing.md }}>
                    <ThemedText variant="caption" color="muted" style={{ flex: 1 }}>
                      {format(new Date(note.created_at), 'd MMM yyyy HH:mm')}
                    </ThemedText>
                    <TouchableOpacity
                      onPress={() => pinNote.mutate({ noteId: note.id, isPinned: !note.is_pinned })}
                      hitSlop={8}
                    >
                      <Ionicons name={note.is_pinned ? 'pin' : 'pin-outline'} size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(note.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
          }
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SchoolDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const { data: school, isLoading, isError, refetch, isFetching } = useSchoolDetail(id ?? '');

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ErrorState title="Could not load school" description="Check connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'info',   label: 'Info',   icon: 'information-circle-outline' },
    { id: 'staff',  label: 'Staff',  icon: 'id-card-outline' },
    { id: 'admins', label: 'Admins', icon: 'people-circle-outline' },
    { id: 'usage',  label: 'Usage',  icon: 'bar-chart-outline' },
    { id: 'notes',  label: 'Notes',  icon: 'document-text-outline' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
            {isLoading ? 'Loading…' : school?.name}
          </ThemedText>
          {school && <ThemedText variant="caption" color="muted">{school.code}</ThemedText>}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.screen, gap: Spacing.base }}>
          {[0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : school ? (
        <View style={{ flex: 1 }}>
          {/* Color banner */}
          <View style={[styles.banner, { backgroundColor: school.primary_color ?? colors.brand.primary }]}>
            <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{school.name}</ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[styles.bannerBadge, { backgroundColor: school.secondary_color ?? 'rgba(255,255,255,0.2)' }]}>
                <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{school.code}</ThemedText>
              </View>
              <ThemedText style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                {school.country ?? '—'} · {format(new Date(school.created_at), 'dd/MM/yy')}
              </ThemedText>
            </View>
          </View>

          {/* Tab bar */}
          <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => { haptics.light(); setActiveTab(tab.id); }}
                style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2.5 }]}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={16}
                  color={activeTab === tab.id ? colors.brand.primary : colors.textMuted}
                />
                <ThemedText style={{
                  fontSize: 13, fontWeight: '600', marginLeft: 4,
                  color: activeTab === tab.id ? colors.brand.primary : colors.textMuted,
                }}>
                  {tab.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {/* Tab content */}
          <View style={{ flex: 1 }}>
            {activeTab === 'info'   && <InfoTab        school={school} colors={colors} refetch={refetch} isFetching={isFetching} />}
            {activeTab === 'staff'  && <StaffRolesTab  school={school} colors={colors} />}
            {activeTab === 'admins' && <AdminsTab       school={school} colors={colors} />}
            {activeTab === 'usage'  && <UsageTab        school={school} colors={colors} refetch={refetch} isFetching={isFetching} />}
            {activeTab === 'notes'  && <NotesTab        school={school} colors={colors} />}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  banner:  { padding: Spacing['2xl'], gap: 4 },
  bannerBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  tabBar:  { flexDirection: 'row', borderBottomWidth: 1 },
  tab:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, gap: 4 },
  statRow: { flexDirection: 'row', paddingHorizontal: Spacing.screen, paddingTop: Spacing.base, gap: Spacing.sm },
  statCell: { flex: 1 },
  metaCard: { marginHorizontal: Spacing.screen, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  metaRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: 12 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  bigChip:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1.5 },
  planCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1.5 },
  errorBox: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md },
  usageRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm },
  usageIcon:{ width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  impersonateCard: { borderRadius: Radius.md, borderWidth: 1.5, padding: Spacing.base },
  impersonateBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, borderRadius: Radius.md },
  reasonInput: { borderRadius: Radius.md, borderWidth: 1.5, padding: Spacing.base },
  impLogRow:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  noteInput:   { borderRadius: Radius.md, borderWidth: 1.5, padding: Spacing.base },
  noteCard:    { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.base },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  emptyNotes:  { borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed', padding: Spacing['2xl'], alignItems: 'center' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screen, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  editChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: 'transparent' },
  editLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  editInput:   { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  saveBtn:     { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm },
  adminCard:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm },
  roleBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  dangerCard:  { borderRadius: Radius.md, borderWidth: 1.5, padding: Spacing.base },
  dangerBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, marginTop: Spacing.sm },
  searchInput: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, fontSize: 14 },
  staffRow:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm },
  staffAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  miniRoleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column', justifyContent: 'flex-end', zIndex: 100 },
  sheet:        { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderWidth: 1, paddingTop: Spacing.sm, paddingBottom: Spacing['2xl'] },
  sheetHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: Spacing.md },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, gap: Spacing.sm },
  roleRow:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, gap: Spacing.md },
  roleIcon:     { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});


// ── Staff Roles tab ───────────────────────────────────────────────────────────

const ROLE_META: Record<StaffRole, { label: string; color: string }> = {
  school_super_admin: { label: 'School Super Admin', color: '#7C3AED' },
  admin:              { label: 'Admin',               color: Colors.semantic.info },
  principal:          { label: 'Principal',           color: Colors.semantic.success },
  coordinator:        { label: 'Coordinator',         color: '#0891B2' },
  hod:                { label: 'HOD',                 color: '#D97706' },
  hrt:                { label: 'Homeroom Teacher',    color: '#059669' },
  st:                 { label: 'Subject Teacher',     color: '#2563EB' },
  finance:            { label: 'Finance',             color: '#B45309' },
  front_desk:         { label: 'Front Desk',          color: '#7C3AED' },
  hr:                 { label: 'HR',                  color: '#DC2626' },
};

function StaffRoleSheet({
  staff, schoolId, colors, onClose,
}: {
  staff: any; schoolId: string; colors: any; onClose: () => void;
}) {
  const assign = useAssignStaffRole(schoolId);
  const remove = useRemoveStaffRole(schoolId);
  const pendingRef = React.useRef<string | null>(null);

  const toggle = async (role: StaffRole) => {
    if (pendingRef.current) return;
    pendingRef.current = role;
    haptics.light();
    try {
      if (staff.roles.includes(role)) {
        await remove.mutateAsync({ staffId: staff.id, role });
      } else {
        await assign.mutateAsync({ staffId: staff.id, role });
      }
    } catch (e: any) {
      haptics.error();
      Alert.alert('Failed', e?.message ?? 'Could not update role.');
    } finally {
      pendingRef.current = null;
    }
  };

  const isBusy = assign.isPending || remove.isPending;

  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{staff.full_name}</ThemedText>
          <ThemedText variant="caption" color="muted">{staff.email}</ThemedText>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ThemedText variant="label" color="muted" style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Assign Roles
      </ThemedText>

      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
        <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.xl, gap: Spacing.sm }}>
          {ALL_STAFF_ROLES.map((role) => {
            const meta = ROLE_META[role];
            const active = staff.roles.includes(role);
            return (
              <Pressable
                key={role}
                onPress={() => toggle(role)}
                disabled={isBusy}
                style={[
                  styles.roleRow,
                  {
                    backgroundColor: active ? meta.color + '12' : colors.surfaceSecondary,
                    borderColor: active ? meta.color : colors.border,
                  },
                ]}
              >
                <View style={[styles.roleIcon, { backgroundColor: meta.color + '20' }]}>
                  <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={meta.color} />
                </View>
                <ThemedText style={{ flex: 1, fontWeight: active ? '700' : '500', fontSize: 14, color: active ? meta.color : colors.textPrimary }}>
                  {meta.label}
                </ThemedText>
                {isBusy && pendingRef.current === role && (
                  <ActivityIndicator size="small" color={meta.color} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function StaffRolesTab({ school, colors }: { school: any; colors: any }) {
  const { data: staffList, isLoading, refetch, isFetching } = useSchoolStaff(school.id);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<any | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffList ?? [];
    return (staffList ?? []).filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q),
    );
  }, [staffList, search]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 80 }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={{ paddingHorizontal: Spacing.screen, paddingTop: Spacing.base, paddingBottom: Spacing.sm }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search staff…"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
          />
        </View>

        <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
          {isLoading
            ? [0, 1, 2, 3, 4].map((i) => <ListItemSkeleton key={i} />)
            : filtered.length === 0
              ? (
                <View style={[styles.emptyNotes, { borderColor: colors.border, marginTop: Spacing.base }]}>
                  <Ionicons name="people-outline" size={28} color={colors.textMuted} />
                  <ThemedText color="muted" style={{ marginTop: 8, textAlign: 'center' }}>
                    {search ? 'No staff match.' : 'No staff found.'}
                  </ThemedText>
                </View>
              )
              : filtered.map((staff) => (
                <Pressable
                  key={staff.id}
                  onPress={() => { haptics.light(); setSelected(staff); }}
                  style={[styles.staffRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.staffAvatar, { backgroundColor: colors.brand.primary + '20' }]}>
                    <ThemedText style={{ fontWeight: '700', fontSize: 14, color: colors.brand.primary }}>
                      {staff.full_name.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={{ fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{staff.full_name}</ThemedText>
                    <ThemedText variant="caption" color="muted" numberOfLines={1}>{staff.email}</ThemedText>
                    {staff.roles.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {staff.roles.map((r) => (
                          <View key={r} style={[styles.miniRoleBadge, { backgroundColor: (ROLE_META[r]?.color ?? colors.brand.primary) + '18' }]}>
                            <ThemedText style={{ fontSize: 10, fontWeight: '700', color: ROLE_META[r]?.color ?? colors.brand.primary }}>
                              {ROLE_META[r]?.label ?? r}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))
          }
        </View>
      </ScrollView>

      {selected && (
        <View style={[styles.sheetOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setSelected(null)} />
          <StaffRoleSheet
            staff={selected}
            schoolId={school.id}
            colors={colors}
            onClose={() => setSelected(null)}
          />
        </View>
      )}
    </View>
  );
}

function DangerZone({ school }: { school: any }) {
  const deleteSchool = useDeleteSchool(school.id);
  const [showConfirm, setShowConfirm] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const { colors } = useTheme();

  const nameMatches = nameInput.trim().toLowerCase() === school.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!nameMatches) return;
    haptics.error();
    try {
      await deleteSchool.mutateAsync();
      haptics.success();
      router.back();
    } catch (e: any) {
      haptics.error();
      if (Platform.OS === 'web') {
        window.alert(`Delete failed\n${e?.message ?? 'Could not delete school.'}`);
      } else {
        Alert.alert('Delete failed', e?.message ?? 'Could not delete school.');
      }
    }
  };

  return (
    <>
      <SectionHeader title="Danger Zone" />
      <View style={{ paddingHorizontal: Spacing.screen, paddingBottom: Spacing['2xl'] }}>
        <View style={[styles.dangerCard, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
          <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#BE123C', marginBottom: 4 }}>Delete School</ThemedText>
          <ThemedText style={{ fontSize: 13, color: '#9F1239', lineHeight: 19 }}>
            Permanently removes this school and all associated data. Irreversible.
          </ThemedText>

          {!showConfirm ? (
            <TouchableOpacity
              onPress={() => { setShowConfirm(true); setNameInput(''); }}
              style={[styles.dangerBtn, { borderColor: '#DC2626', backgroundColor: 'transparent', marginTop: Spacing.sm }]}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <ThemedText style={{ color: '#DC2626', fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Delete School</ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
              <ThemedText style={{ fontSize: 12, color: '#9F1239', fontWeight: '600' }}>
                Type the school name to confirm: <ThemedText style={{ fontWeight: '800' }}>{school.name}</ThemedText>
              </ThemedText>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder={school.name}
                placeholderTextColor="#FECDD3"
                autoCapitalize="none"
                style={{
                  borderWidth: 1.5, borderColor: nameInput ? (nameMatches ? '#10B981' : '#DC2626') : '#FECDD3',
                  borderRadius: Radius.md, padding: Spacing.md, fontSize: 14, color: '#1F2937',
                  backgroundColor: '#FFF',
                }}
              />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  onPress={() => { setShowConfirm(false); setNameInput(''); }}
                  style={[styles.dangerBtn, { flex: 1, borderColor: colors.border, backgroundColor: 'transparent' }]}
                >
                  <ThemedText style={{ color: colors.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDelete}
                  disabled={!nameMatches || deleteSchool.isPending}
                  style={[styles.dangerBtn, { flex: 1, borderColor: '#DC2626', backgroundColor: nameMatches ? '#DC2626' : '#FEE2E2' }]}
                >
                  <Ionicons name="trash-outline" size={16} color={nameMatches ? '#fff' : '#DC2626'} />
                  <ThemedText style={{ color: nameMatches ? '#fff' : '#DC2626', fontWeight: '700', fontSize: 14, marginLeft: 6 }}>
                    {deleteSchool.isPending ? 'Deleting…' : 'Delete forever'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

function AdminsTab({ school, colors }: { school: any; colors: any }) {
  const { data: admins, isLoading } = useSchoolAdmins(school.id);
  const invite = useInviteSchoolAdmin(school.id);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  const handleInvite = async () => {
    if (!form.full_name.trim() || !form.email.includes('@') || form.password.length < 8) {
      Alert.alert('Validation', 'Name, valid email, and password (min 8 chars) required.');
      return;
    }
    setSaving(true);
    try {
      await invite.mutateAsync({ full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), password: form.password });
      haptics.success();
      setForm({ full_name: '', email: '', password: '' });
      setShowForm(false);
      Alert.alert('Admin created', `${form.email} can now sign in.`);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Failed', e?.message ?? 'Could not create admin.');
    } finally {
      setSaving(false);
    }
  };

  const ROLE_COLORS: Record<string, string> = {
    school_super_admin: '#7C3AED',
    admin: Colors.semantic.info,
    principal: Colors.semantic.success,
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}>
      <View style={[styles.sectionHeaderRow, { paddingTop: Spacing.base }]}>
        <ThemedText variant="label" color="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>SCHOOL ADMINS</ThemedText>
        <TouchableOpacity onPress={() => setShowForm(!showForm)} style={[styles.editChip, { borderColor: colors.brand.primary }]} hitSlop={8}>
          <Ionicons name={showForm ? 'close' : 'person-add-outline'} size={14} color={colors.brand.primary} />
          <ThemedText style={{ color: colors.brand.primary, fontWeight: '700', fontSize: 12, marginLeft: 4 }}>
            {showForm ? 'Cancel' : 'Add Admin'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={[{ marginHorizontal: Spacing.screen, marginBottom: Spacing.base, padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText variant="label" color="muted" style={styles.editLabel}>FULL NAME</ThemedText>
          <TextInput value={form.full_name} onChangeText={(t) => setForm(f => ({ ...f, full_name: t }))} placeholder="Jane Mwansa" placeholderTextColor={colors.textMuted} style={[styles.editInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]} />
          <ThemedText variant="label" color="muted" style={styles.editLabel}>EMAIL</ThemedText>
          <TextInput value={form.email} onChangeText={(t) => setForm(f => ({ ...f, email: t }))} placeholder="admin@school.edu" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" style={[styles.editInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]} />
          <ThemedText variant="label" color="muted" style={styles.editLabel}>TEMP PASSWORD</ThemedText>
          <TextInput value={form.password} onChangeText={(t) => setForm(f => ({ ...f, password: t }))} placeholder="Min 8 characters" placeholderTextColor={colors.textMuted} secureTextEntry style={[styles.editInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]} />
          <TouchableOpacity onPress={handleInvite} disabled={saving} style={[styles.saveBtn, { backgroundColor: saving ? colors.border : colors.brand.primary }]}>
            <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Creating…' : 'Create Admin'}</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
        {isLoading
          ? [0, 1, 2].map((i) => <ListItemSkeleton key={i} />)
          : (admins ?? []).length === 0
            ? (
              <View style={[styles.emptyNotes, { borderColor: colors.border }]}>
                <Ionicons name="people-outline" size={28} color={colors.textMuted} />
                <ThemedText color="muted" style={{ marginTop: 8, textAlign: 'center' }}>No admins found.</ThemedText>
              </View>
            )
            : (admins ?? []).map((admin) => (
              <View key={admin.id} style={[styles.adminCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: (ROLE_COLORS[admin.role] ?? colors.brand.primary) + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person-outline" size={18} color={ROLE_COLORS[admin.role] ?? colors.brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600', fontSize: 14 }}>{admin.full_name || '—'}</ThemedText>
                  <ThemedText variant="caption" color="muted">{admin.email}</ThemedText>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLORS[admin.role] ?? colors.brand.primary) + '20' }]}>
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: ROLE_COLORS[admin.role] ?? colors.brand.primary }}>
                    {admin.role.replace('_', ' ').toUpperCase()}
                  </ThemedText>
                </View>
              </View>
            ))
        }
      </View>
    </ScrollView>
  );
}
