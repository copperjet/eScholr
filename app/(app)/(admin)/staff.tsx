/**
 * Admin Staff Management — /(app)/(admin)/staff
 * List · Add · Edit roles · Activate/Deactivate · Send invite
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView,
  TouchableOpacity, RefreshControl, ScrollView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { webConfirm, webAlert } from '../../../lib/alert';
import {
  ThemedText, Avatar, Badge, SearchBar, FAB, BottomSheet,
  Skeleton, EmptyState, ErrorState, FormField, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, Radius, Typography, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import type { UserRole } from '../../../types/database';

// ── Constants ─────────────────────────────────────────────────
// Roles that can be assigned to staff via the staff management screen.
// school_super_admin is intentionally excluded — it is created only at
// school onboarding by the platform admin and cannot be reassigned here.
const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin',              label: 'Administrator' },
  { value: 'principal',          label: 'Principal' },
  { value: 'coordinator',        label: 'Coordinator' },
  { value: 'hod',                label: 'Head of Department' },
  { value: 'hrt',                label: 'Class Teacher (HRT)' },
  { value: 'st',                 label: 'Subject Teacher' },
  { value: 'finance',            label: 'Finance' },
  { value: 'front_desk',         label: 'Front Desk' },
  { value: 'hr',                 label: 'Human Resources' },
  { value: 'librarian',          label: 'Librarian' },
];

const ROLE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ALL_ROLES.map(r => [r.value, r.label])),
  school_super_admin: 'School Super Admin',
  super_admin: 'Platform Admin',
  parent: 'Parent',
  student: 'Student',
  hr: 'Human Resources',
};

// ── Data hooks ────────────────────────────────────────────────
function useStaff(schoolId: string) {
  return useQuery({
    queryKey: ['admin-staff', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const [staffRes, rolesRes] = await Promise.all([
        supabase
          .from('staff')
          .select('id, full_name, email, phone, department, status, staff_number, date_joined, auth_user_id, login_status, temp_password')
          .eq('school_id', schoolId)
          .order('full_name'),
        supabase
          .from('staff_roles')
          .select('staff_id, role')
          .eq('school_id', schoolId),
      ]);
      if (staffRes.error) throw staffRes.error;

      const rolesMap: Record<string, string[]> = {};
      (rolesRes.data ?? []).forEach((r: any) => {
        rolesMap[r.staff_id] = [...(rolesMap[r.staff_id] ?? []), r.role];
      });

      return (staffRes.data ?? []).map((s: any) => ({ ...s, roles: rolesMap[s.id] ?? [] }));
    },
  });
}

// ── Main screen ───────────────────────────────────────────────
export default function AdminStaffScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId = user?.schoolId ?? '';

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'active' | 'all' | 'inactive' | 'pending'>('active');
  const [showTempPw, setShowTempPw] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [editRolesMode, setEditRolesMode] = useState(false);
  const [confirmLogin, setConfirmLogin] = useState(false);

  // Add Staff form state
  const [form, setForm] = useState({ full_name: '', email: '', department: '', phone: '' });
  const [formRoles, setFormRoles] = useState<UserRole[]>([]);
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useStaff(schoolId);

  // ── Mutations ─────────────────────────────────────────────
  const addStaff = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.email.trim()) throw new Error('Name and email are required.');
      if (formRoles.length === 0) throw new Error('Assign at least one role.');

      const { data: newStaff, error } = await (supabase as any)
        .from('staff')
        .insert({
          school_id: schoolId,
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          department: form.department.trim() || null,
          phone: form.phone.trim() || null,
          date_joined: new Date().toISOString().split('T')[0],
        } as any)
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('This email is already linked to an existing or deactivated account.');
        throw new Error(error.message);
      }

      const staffId = (newStaff as any).id;
      const { error: roleErr } = await (supabase as any)
        .from('staff_roles')
        .insert(formRoles.map(r => ({ school_id: schoolId, staff_id: staffId, role: r })) as any);
      if (roleErr) throw new Error(roleErr.message);

      await (supabase as any).from('audit_logs').insert({
        school_id: schoolId,
        event_type: 'account_created',
        actor_id: user?.staffId,
        data: { staff_id: staffId, email: form.email, roles: formRoles },
      } as any);

      return staffId;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      setAddVisible(false);
      setForm({ full_name: '', email: '', department: '', phone: '' });
      setFormRoles([]);
      setFormError('');
    },
    onError: (err: any) => {
      haptics.error();
      setFormError(err.message ?? 'Could not create staff member.');
    },
  });

  const updateRoles = useMutation({
    mutationFn: async ({ staffId, roles }: { staffId: string; roles: UserRole[] }) => {
      await (supabase as any).from('staff_roles').delete().eq('staff_id', staffId).eq('school_id', schoolId);
      if (roles.length > 0) {
        const { error } = await (supabase as any)
          .from('staff_roles')
          .insert(roles.map(r => ({ school_id: schoolId, staff_id: staffId, role: r })) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      setEditRolesMode(false);
      // refresh selected staff roles display
      const updated = data?.find((s: any) => s.id === selectedStaff?.id);
      if (updated) setSelectedStaff(updated);
    },
    onError: () => haptics.error(),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ staffId, currentStatus }: { staffId: string; currentStatus: string }) => {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { error } = await (supabase as any)
        .from('staff')
        .update({ status: newStatus })
        .eq('id', staffId)
        .eq('school_id', schoolId);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      setDetailVisible(false);
    },
    onError: () => haptics.error(),
  });

  const sendInvite = useMutation({
    mutationFn: async (staff: any) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            staff_id: staff.id,
            email: staff.email,
            full_name: staff.full_name,
            school_id: schoolId,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Invite failed');
      return json;
    },
    onSuccess: (json: any) => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      setDetailVisible(false);
    },
    onError: (err: any) => {
      haptics.error();
      console.error('invite-user error:', err);
      webAlert('Login Creation Failed', err.message ?? 'Could not create login. Check the edge function is deployed and the staff member has a valid email.');
    },
  });

  const hardDeleteUser = useMutation({
    mutationFn: async (staff: any) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            user_id: staff.auth_user_id,
            type: 'staff',
            record_id: staff.id,
            school_id: schoolId,
            mode: 'anonymize', // safer default: anonymize instead of hard delete
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      return json;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      setDetailVisible(false);
      setSelectedStaff(null);
      webAlert('User Deleted', 'The user has been permanently removed.');
    },
    onError: (err: any) => {
      haptics.error();
      webAlert('Delete Failed', err.message ?? 'Could not delete user.');
    },
  });

  // ── Derived lists ─────────────────────────────────────────
  const pendingLogins = (data ?? []).filter((s: any) => s.login_status === 'pending_login');

  const filtered = (data ?? [])
    .filter((s: any) => {
      if (filterActive === 'pending') return s.login_status === 'pending_login';
      return filterActive === 'all' || s.status === filterActive;
    })
    .filter((s: any) =>
      !search ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.staff_number ?? '').toLowerCase().includes(search.toLowerCase())
    );

  const openDetail = useCallback((staff: any) => {
    setSelectedStaff(staff);
    setEditRolesMode(false);
    setShowTempPw(false);
    setDetailVisible(true);
    haptics.light();
  }, []);

  const toggleFormRole = (role: UserRole) =>
    setFormRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  // ── Render ────────────────────────────────────────────────
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
        title={`Staff${data ? ` (${data.filter((s: any) => s.status === 'active').length} active)` : ''}`}
        showBack
        right={
          <TouchableOpacity
            onPress={() => router.push('/(app)/(admin)/staff-import' as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.brand.primary + '14' }}
          >
            <Ionicons name="download-outline" size={15} color={colors.brand.primary} />
            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '700' }}>Import</ThemedText>
          </TouchableOpacity>
        }
      />

      {/* Search + filter chips */}
      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, gap: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, email, ID…" />
        <View style={styles.filterRow}>
          {(['active', 'all', 'inactive', 'pending'] as const).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilterActive(f)}
              style={[styles.chip, {
                borderColor: filterActive === f ? colors.brand.primary : colors.border,
                backgroundColor: filterActive === f ? colors.brand.primary + '14' : colors.surfaceSecondary,
              }]}
            >
              <ThemedText variant="bodySm" style={{
                color: filterActive === f ? colors.brand.primary : colors.textMuted,
                fontWeight: filterActive === f ? '700' : '500',
                textTransform: 'capitalize',
              }}>
                {f === 'pending' ? `Pending${pendingLogins.length > 0 ? ` (${pendingLogins.length})` : ''}` : f}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pending logins banner */}
      {!isLoading && pendingLogins.length > 0 && filterActive !== 'pending' && (
        <TouchableOpacity
          onPress={() => setFilterActive('pending')}
          style={[styles.pendingBanner, { backgroundColor: Colors.semantic.warning + '18', borderColor: Colors.semantic.warning + '50' }]}
        >
          <Ionicons name="time-outline" size={16} color={Colors.semantic.warning} />
          <ThemedText variant="bodySm" style={{ flex: 1, color: Colors.semantic.warning, fontWeight: '600', marginLeft: Spacing.sm }}>
            {pendingLogins.length} staff member{pendingLogins.length !== 1 ? 's' : ''} with pending login — tap to view
          </ThemedText>
          <Ionicons name="chevron-forward" size={14} color={Colors.semantic.warning} />
        </TouchableOpacity>
      )}

      {/* List */}
      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={44} height={44} radius={22} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="75%" height={11} />
              </View>
              <Skeleton width={60} height={24} radius={12} />
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? `No results for "${search}"` : 'No staff found'}
          description={!search ? 'Tap + to add a staff member.' : ''}
        />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={(s: any) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
          renderItem={({ item: staff }: { item: any }) => (
            <TouchableOpacity
              onPress={() => openDetail(staff)}
              activeOpacity={0.8}
              style={[styles.staffRow, {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: staff.status === 'inactive' ? 0.55 : 1,
              }]}
            >
              <Avatar name={staff.full_name} size={44} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>{staff.full_name}</ThemedText>
                <ThemedText variant="caption" color="muted">{staff.staff_number} · {staff.email}</ThemedText>
                {staff.roles.length > 0 && (
                  <View style={styles.roleChips}>
                    {staff.roles.slice(0, 3).map((r: string) => (
                      <View key={r} style={[styles.roleChip, { backgroundColor: colors.brand.primary + '14' }]}>
                        <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 10 }}>
                          {ROLE_LABELS[r] ?? r}
                        </ThemedText>
                      </View>
                    ))}
                    {staff.roles.length > 3 && (
                      <ThemedText variant="caption" color="muted">+{staff.roles.length - 3}</ThemedText>
                    )}
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge label={staff.status} preset={staff.status === 'active' ? 'success' : 'neutral'} />
                {staff.login_status === 'pending_login' && (
                  <View style={[styles.noLoginBadge, { borderColor: Colors.semantic.warning, backgroundColor: Colors.semantic.warning + '15' }]}>
                    <ThemedText variant="label" style={{ color: Colors.semantic.warning, fontSize: 9 }}>PENDING</ThemedText>
                  </View>
                )}
                {staff.login_status === 'none' && (
                  <View style={[styles.noLoginBadge, { borderColor: Colors.semantic.warning }]}>
                    <ThemedText variant="label" style={{ color: Colors.semantic.warning, fontSize: 9 }}>NO LOGIN</ThemedText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB — Add Staff */}
      <FAB
        icon={<Ionicons name="person-add" size={22} color="#fff" />}
        label="Add Staff"
        onPress={() => {
          haptics.light();
          setForm({ full_name: '', email: '', department: '', phone: '' });
          setFormRoles([]);
          setFormError('');
          setAddVisible(true);
        }}
      />

      {/* ── Add Staff Sheet ─────────────────────────────────── */}
      <BottomSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        title="Add Staff Member"
        snapHeight={640}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <FormField label="Full Name *" value={form.full_name} onChangeText={(v: string) => setForm(p => ({ ...p, full_name: v }))} placeholder="e.g. Joyce Kamau" iconLeft="person-outline" />
            <FormField label="Email *" value={form.email} onChangeText={(v: string) => setForm(p => ({ ...p, email: v }))} placeholder="e.g. jkamau@school.edu" keyboardType="email-address" autoCapitalize="none" iconLeft="mail-outline" />
            <FormField label="Department" value={form.department} onChangeText={(v: string) => setForm(p => ({ ...p, department: v }))} placeholder="e.g. English" iconLeft="business-outline" />
            <FormField label="Phone" value={form.phone} onChangeText={(v: string) => setForm(p => ({ ...p, phone: v }))} placeholder="+260 97…" keyboardType="phone-pad" iconLeft="call-outline" />

            <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm, marginTop: Spacing.sm }}>
              ROLES (select at least one)
            </ThemedText>
            <View style={styles.roleGrid}>
              {ALL_ROLES.map(r => {
                const active = formRoles.includes(r.value);
                return (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => { haptics.selection(); toggleFormRole(r.value); }}
                    style={[styles.roleToggle, {
                      backgroundColor: active ? colors.brand.primary + '18' : colors.surfaceSecondary,
                      borderColor: active ? colors.brand.primary : colors.border,
                    }]}
                  >
                    {active && <Ionicons name="checkmark-circle" size={14} color={colors.brand.primary} />}
                    <ThemedText variant="bodySm" style={{ color: active ? colors.brand.primary : colors.textSecondary, fontWeight: active ? '700' : '500' }}>
                      {r.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {formError ? (
              <View style={[styles.errorBox, { backgroundColor: Colors.semantic.errorLight }]}>
                <ThemedText variant="bodySm" style={{ color: Colors.semantic.error }}>{formError}</ThemedText>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => addStaff.mutate()}
              disabled={addStaff.isPending}
              style={[styles.submitBtn, { backgroundColor: colors.brand.primary, opacity: addStaff.isPending ? 0.7 : 1 }]}
            >
              <Ionicons name={addStaff.isPending ? 'sync-outline' : 'checkmark'} size={20} color="#fff" />
              <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                {addStaff.isPending ? 'Creating…' : 'Create Staff Member'}
              </ThemedText>
            </TouchableOpacity>
            <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
              You can send a login invite after creating the account.
            </ThemedText>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* ── Staff Detail Sheet ──────────────────────────────── */}
      <BottomSheet
        visible={detailVisible && !!selectedStaff}
        onClose={() => { setDetailVisible(false); setEditRolesMode(false); setConfirmLogin(false); setShowTempPw(false); }}
        title={selectedStaff?.full_name ?? 'Staff'}
        snapHeight={editRolesMode ? 560 : (selectedStaff?.login_status === 'pending_login' ? 560 : 500)}
      >
        {selectedStaff && !editRolesMode && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ gap: Spacing.base, paddingBottom: Spacing.xl }}>
              {[
                { icon: 'id-card-outline',  label: selectedStaff.staff_number ?? '—' },
                { icon: 'mail-outline',     label: selectedStaff.email },
                { icon: 'call-outline',     label: selectedStaff.phone ?? '—' },
                { icon: 'business-outline', label: selectedStaff.department ?? '—' },
                { icon: 'calendar-outline', label: selectedStaff.date_joined ? `Joined ${format(parseISO(selectedStaff.date_joined), 'dd/MM/yy')}` : '—' },
              ].map(row => (
                <View key={row.icon} style={styles.detailRow}>
                  <Ionicons name={row.icon as any} size={16} color={colors.textMuted} />
                  <ThemedText variant="body" style={{ marginLeft: Spacing.sm, flex: 1 }}>{row.label}</ThemedText>
                </View>
              ))}

              {/* Roles display */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                  <ThemedText variant="label" color="muted" style={{ flex: 1 }}>ROLES</ThemedText>
                  <TouchableOpacity onPress={() => setEditRolesMode(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <ThemedText variant="bodySm" style={{ color: colors.brand.primary, fontWeight: '600' }}>Edit</ThemedText>
                  </TouchableOpacity>
                </View>
                <View style={styles.roleChips}>
                  {selectedStaff.roles.length > 0
                    ? selectedStaff.roles.map((r: string) => (
                        <View key={r} style={[styles.roleChip, { backgroundColor: colors.brand.primary + '18' }]}>
                          <ThemedText variant="label" style={{ color: colors.brand.primary }}>{ROLE_LABELS[r] ?? r}</ThemedText>
                        </View>
                      ))
                    : <ThemedText variant="bodySm" color="muted">No roles assigned</ThemedText>
                  }
                </View>
              </View>

              {/* Auth status + invite */}
              {selectedStaff.login_status === 'pending_login' ? (
                <View style={[styles.authCard, { backgroundColor: Colors.semantic.warning + '12', borderColor: Colors.semantic.warning }]}>
                  <Ionicons name="time-outline" size={16} color={Colors.semantic.warning} />
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '700', color: Colors.semantic.warning }}>Login pending — awaiting first sign-in</ThemedText>
                    <ThemedText variant="caption" color="muted">Share the temporary password below. It disappears once they log in and reset it.</ThemedText>
                  </View>
                </View>
              ) : (
                <View style={[styles.authCard, { backgroundColor: selectedStaff.auth_user_id ? Colors.semantic.successLight : Colors.semantic.warningLight, borderColor: selectedStaff.auth_user_id ? Colors.semantic.success : Colors.semantic.warning }]}>
                  <Ionicons
                    name={selectedStaff.auth_user_id ? 'shield-checkmark' : 'mail-unread-outline'}
                    size={16}
                    color={selectedStaff.auth_user_id ? Colors.semantic.success : Colors.semantic.warning}
                  />
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '600', color: selectedStaff.auth_user_id ? Colors.semantic.success : Colors.semantic.warning }}>
                      {selectedStaff.auth_user_id ? 'Login active' : 'No login account yet'}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {selectedStaff.auth_user_id ? 'Staff member has signed in and set their password.' : 'Send an invite to create their login.'}
                    </ThemedText>
                  </View>
                  {!selectedStaff.auth_user_id && (
                    confirmLogin ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => { setConfirmLogin(false); sendInvite.mutate(selectedStaff); }}
                          disabled={sendInvite.isPending}
                          style={[styles.inviteBtn, { backgroundColor: Colors.semantic.warning }]}
                        >
                          <ThemedText variant="label" style={{ color: '#fff', fontWeight: '700' }}>
                            {sendInvite.isPending ? '…' : 'Yes, create'}
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setConfirmLogin(false)}
                          style={[styles.inviteBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border }]}
                        >
                          <ThemedText variant="label" style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancel</ThemedText>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setConfirmLogin(true)}
                        disabled={sendInvite.isPending}
                        style={[styles.inviteBtn, { backgroundColor: Colors.semantic.warning }]}
                      >
                        <ThemedText variant="label" style={{ color: '#fff', fontWeight: '700' }}>Create Login</ThemedText>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}

              {/* Temporary password card — visible while login_status is pending */}
              {selectedStaff.login_status === 'pending_login' && selectedStaff.temp_password && (
                <View style={[styles.tempPwCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                    <Ionicons name="key-outline" size={15} color={colors.brand.primary} />
                    <ThemedText variant="label" color="muted" style={{ marginLeft: 6, flex: 1 }}>TEMPORARY PASSWORD</ThemedText>
                    <TouchableOpacity
                      onPress={() => setShowTempPw(v => !v)}
                      hitSlop={8}
                    >
                      <Ionicons name={showTempPw ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <ThemedText style={{ flex: 1, fontFamily: 'monospace', fontSize: 16, fontWeight: '700', letterSpacing: 2, color: colors.textPrimary }}>
                      {showTempPw ? selectedStaff.temp_password : '••••••••••••'}
                    </ThemedText>
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          navigator.clipboard?.writeText(selectedStaff.temp_password);
                          haptics.success();
                          webAlert('Copied', 'Temporary password copied to clipboard.');
                        } else {
                          webAlert('Temporary Password', selectedStaff.temp_password);
                        }
                      }}
                      hitSlop={8}
                      style={[styles.inviteBtn, { backgroundColor: colors.brand.primary }]}
                    >
                      <ThemedText variant="label" style={{ color: '#fff', fontWeight: '700' }}>Copy</ThemedText>
                    </TouchableOpacity>
                  </View>
                  <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
                    Share this with {selectedStaff.full_name.split(' ')[0]}. They will be prompted to set a new password on first login.
                  </ThemedText>
                </View>
              )}

              {/* Toggle status */}
              <TouchableOpacity
                onPress={() => {
                  const isActive = selectedStaff.status === 'active';
                  webConfirm(
                    isActive ? 'Deactivate Staff' : 'Activate Staff',
                    `${isActive ? 'Deactivate' : 'Activate'} ${selectedStaff.full_name}?`,
                    () => toggleStatus.mutate({ staffId: selectedStaff.id, currentStatus: selectedStaff.status }),
                    isActive ? 'Deactivate' : 'Activate',
                    'Cancel',
                    isActive,
                  );
                }}
                disabled={toggleStatus.isPending}
                style={[styles.toggleBtn, { borderColor: selectedStaff.status === 'active' ? Colors.semantic.error : Colors.semantic.success }]}
              >
                <Ionicons
                  name={selectedStaff.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'}
                  size={18}
                  color={selectedStaff.status === 'active' ? Colors.semantic.error : Colors.semantic.success}
                />
                <ThemedText variant="body" style={{ marginLeft: 8, fontWeight: '600', color: selectedStaff.status === 'active' ? Colors.semantic.error : Colors.semantic.success }}>
                  {selectedStaff.status === 'active' ? 'Deactivate Account' : 'Reactivate Account'}
                </ThemedText>
              </TouchableOpacity>

              {/* Hard Delete */}
              <TouchableOpacity
                onPress={() => {
                  webConfirm(
                    'Delete User Permanently',
                    `This will permanently delete ${selectedStaff.full_name} and all their data. This action cannot be undone.\n\nAre you sure?`,
                    () => hardDeleteUser.mutate(selectedStaff),
                    'Delete',
                    'Cancel',
                    true,
                  );
                }}
                disabled={hardDeleteUser.isPending}
                style={[styles.toggleBtn, { borderColor: Colors.semantic.error, marginTop: Spacing.sm }]}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.semantic.error} />
                <ThemedText variant="body" style={{ marginLeft: 8, fontWeight: '600', color: Colors.semantic.error }}>
                  {hardDeleteUser.isPending ? 'Deleting…' : 'Delete Permanently'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Edit Roles mode ──────────────────────────────── */}
        {selectedStaff && editRolesMode && (
          <EditRolesPanel
            staff={selectedStaff}
            colors={colors}
            isPending={updateRoles.isPending}
            onSave={(roles) => updateRoles.mutate({ staffId: selectedStaff.id, roles })}
            onCancel={() => setEditRolesMode(false)}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Edit Roles panel ──────────────────────────────────────────
function EditRolesPanel({ staff, colors, isPending, onSave, onCancel }: {
  staff: any; colors: any; isPending: boolean;
  onSave: (roles: UserRole[]) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<UserRole[]>(staff.roles as UserRole[]);
  const toggle = (role: UserRole) =>
    setSelected(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  return (
    <View style={{ gap: Spacing.base, paddingBottom: Spacing.xl }}>
      <ThemedText variant="bodySm" color="muted">Toggle roles for {staff.full_name}</ThemedText>
      <View style={styles.roleGrid}>
        {ALL_ROLES.map(r => {
          const active = selected.includes(r.value);
          return (
            <TouchableOpacity
              key={r.value}
              onPress={() => { haptics.selection(); toggle(r.value); }}
              style={[styles.roleToggle, {
                backgroundColor: active ? colors.brand.primary + '18' : colors.surfaceSecondary,
                borderColor: active ? colors.brand.primary : colors.border,
              }]}
            >
              {active && <Ionicons name="checkmark-circle" size={14} color={colors.brand.primary} />}
              <ThemedText variant="bodySm" style={{ color: active ? colors.brand.primary : colors.textSecondary, fontWeight: active ? '700' : '500' }}>
                {r.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
        <TouchableOpacity onPress={onCancel} style={[styles.cancelBtn, { borderColor: colors.border, flex: 1 }]}>
          <ThemedText variant="body" color="muted">Cancel</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSave(selected)}
          disabled={isPending || selected.length === 0}
          style={[styles.submitBtn, { backgroundColor: colors.brand.primary, flex: 2, opacity: isPending || selected.length === 0 ? 0.6 : 1 }]}
        >
          <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
            {isPending ? 'Saving…' : 'Save Roles'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT },
  staffRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base,
    marginBottom: Spacing.sm, borderRadius: Radius.lg, gap: Spacing.md,
    ...Shadow.sm,
  },
  roleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  roleChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  noLoginBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  tempPwCard: {
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, marginTop: Spacing.sm,
  },
  authCard: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base,
    borderRadius: Radius.lg, borderWidth: 1,
  },
  inviteBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.md },
  form: { gap: 2, paddingBottom: Spacing.xl },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: 12, fontSize: 15,
  },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  roleToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.md, borderWidth: 1.5,
  },
  errorBox: { padding: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.sm },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.base, borderRadius: Radius.lg, marginTop: Spacing.base,
  },
  cancelBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.base, borderRadius: Radius.lg, borderWidth: 1,
  },
});
