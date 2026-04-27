import React, { useState } from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet, Pressable,
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
} from '../../../hooks/usePlatform';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'active' | 'trial' | 'suspended' | 'cancelled';
type SubscriptionPlan   = 'starter' | 'growth' | 'scale' | 'enterprise';
type Tab = 'info' | 'usage' | 'notes';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string; color: string }[] = [
  { value: 'active',    label: 'Active',    color: Colors.semantic.success },
  { value: 'trial',     label: 'Trial',     color: Colors.semantic.warning },
  { value: 'suspended', label: 'Suspended', color: '#DC2626' },
  { value: 'cancelled', label: 'Cancelled', color: '#6B7280' },
];

const PLAN_OPTIONS: { value: SubscriptionPlan; label: string; desc: string; price: string }[] = [
  { value: 'starter',    label: 'Starter',    desc: 'Up to 200 students',   price: '$49/mo' },
  { value: 'growth',     label: 'Growth',     desc: 'Up to 500 students',   price: '$149/mo' },
  { value: 'scale',      label: 'Scale',      desc: 'Up to 2 000 students', price: '$399/mo' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Unlimited',            price: '$999/mo' },
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
    Alert.alert('Change Status', `Set "${school.name}" to ${status.toUpperCase()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => { haptics.light(); updateSchool.mutate({ subscription_status: status }); } },
    ]);
  };

  const handlePlanChange = (plan: SubscriptionPlan) => {
    if (plan === school.subscription_plan) return;
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

      <SectionHeader title="School Info" />
      <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {[
          { label: 'Country',  value: school.country ?? '—' },
          { label: 'Created',  value: format(new Date(school.created_at), 'd MMM yyyy') },
          { label: 'Renewal',  value: school.renewal_date ? format(new Date(school.renewal_date), 'd MMM yyyy') : '—' },
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
    { id: 'info',  label: 'Info',  icon: 'information-circle-outline' },
    { id: 'usage', label: 'Usage', icon: 'bar-chart-outline' },
    { id: 'notes', label: 'Notes', icon: 'document-text-outline' },
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
                {school.country ?? '—'} · {format(new Date(school.created_at), 'd MMM yyyy')}
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
            {activeTab === 'info'  && <InfoTab  school={school} colors={colors} refetch={refetch} isFetching={isFetching} />}
            {activeTab === 'usage' && <UsageTab school={school} colors={colors} refetch={refetch} isFetching={isFetching} />}
            {activeTab === 'notes' && <NotesTab school={school} colors={colors} />}
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
});
