/**
 * Admin Parent Management — /(app)/(admin)/parents
 * List · Add · Link to student · Send invite
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView,
  TouchableOpacity, Alert, RefreshControl, TextInput, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Badge, SearchBar, FAB, BottomSheet,
  Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const RELATIONSHIPS = [
  { value: 'mother',   label: 'Mother' },
  { value: 'father',   label: 'Father' },
  { value: 'guardian', label: 'Guardian' },
] as const;

type RelationshipVal = typeof RELATIONSHIPS[number]['value'];

// ── Data hooks ────────────────────────────────────────────────
function useParents(schoolId: string) {
  return useQuery({
    queryKey: ['admin-parents', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const [parentsRes, linksRes] = await Promise.all([
        supabase
          .from('parents')
          .select('id, full_name, email, phone, relationship, created_at, auth_user_id')
          .eq('school_id', schoolId)
          .order('full_name'),
        supabase
          .from('student_parent_links')
          .select('parent_id, student_id, students(id, full_name, student_number)')
          .eq('school_id', schoolId),
      ]);
      if (parentsRes.error) throw parentsRes.error;

      const linksMap: Record<string, any[]> = {};
      (linksRes.data ?? []).forEach((l: any) => {
        linksMap[l.parent_id] = [...(linksMap[l.parent_id] ?? []), l.students];
      });

      return (parentsRes.data ?? []).map((p: any) => ({
        ...p,
        linkedStudents: linksMap[p.id] ?? [],
      }));
    },
  });
}

function useStudents(schoolId: string) {
  return useQuery({
    queryKey: ['admin-students-list', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('students')
        .select('id, full_name, student_number, grade_id, grades(name), streams(name)')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Main screen ───────────────────────────────────────────────
export default function AdminParentsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId = user?.schoolId ?? '';

  const [search, setSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [linkVisible, setLinkVisible] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', relationship: 'guardian' as RelationshipVal });
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useParents(schoolId);
  const { data: students } = useStudents(schoolId);

  // ── Mutations ─────────────────────────────────────────────
  const addParent = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.email.trim()) throw new Error('Name and email are required.');
      const { data: np, error } = await (supabase as any)
        .from('parents')
        .insert({
          school_id: schoolId,
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          relationship: form.relationship,
        } as any)
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('This email is already linked to an existing or deactivated account.');
        throw new Error(error.message);
      }
      return (np as any).id;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-parents'] });
      setAddVisible(false);
      setForm({ full_name: '', email: '', phone: '', relationship: 'guardian' });
      setFormError('');
    },
    onError: (err: any) => {
      haptics.error();
      setFormError(err.message ?? 'Could not create parent.');
    },
  });

  const linkStudent = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await (supabase as any)
        .from('student_parent_links')
        .insert({ school_id: schoolId, student_id: studentId, parent_id: selectedParent.id } as any);
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-parents'] });
      // refresh selected parent in sheet
      setSelectedParent((prev: any) => prev
        ? { ...prev, linkedStudents: [...(prev.linkedStudents ?? []), students?.find((s: any) => s.id === linkStudent.variables)] }
        : prev
      );
      setLinkVisible(false);
      setStudentSearch('');
    },
    onError: (err: any) => {
      haptics.error();
      Alert.alert('Link Failed', err.message);
    },
  });

  const unlinkStudent = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await (supabase as any)
        .from('student_parent_links')
        .delete()
        .eq('parent_id', selectedParent.id)
        .eq('student_id', studentId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: (_data, studentId) => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-parents'] });
      setSelectedParent((prev: any) => prev
        ? { ...prev, linkedStudents: prev.linkedStudents.filter((s: any) => s?.id !== studentId) }
        : prev
      );
    },
    onError: () => haptics.error(),
  });

  const sendInvite = useMutation({
    mutationFn: async (parent: any) => {
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
            parent_id: parent.id,
            email: parent.email,
            full_name: parent.full_name,
            school_id: schoolId,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Invite failed');
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-parents'] });
      Alert.alert('Invite Sent', 'A login link has been emailed to the parent.');
    },
    onError: (err: any) => {
      haptics.error();
      Alert.alert('Invite Failed', err.message ?? 'Could not send invite.');
    },
  });

  // ── Filtered list ─────────────────────────────────────────
  const filtered = (data ?? []).filter((p: any) =>
    !search ||
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  const alreadyLinkedIds = new Set((selectedParent?.linkedStudents ?? []).map((s: any) => s?.id));
  const availableStudents = (students ?? []).filter((s: any) =>
    !alreadyLinkedIds.has(s.id) && (
      !studentSearch ||
      s.full_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.student_number.toLowerCase().includes(studentSearch.toLowerCase())
    )
  );

  const openDetail = useCallback((parent: any) => {
    setSelectedParent(parent);
    setDetailVisible(true);
    haptics.light();
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load parents" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={`Parents${data ? ` (${data.length})` : ''}`} showBack />

      {/* Search */}
      <View style={{ paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or email…" />
      </View>

      {/* List */}
      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={44} height={44} radius={22} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="70%" height={11} />
              </View>
              <Skeleton width={50} height={24} radius={12} />
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? `No results for "${search}"` : 'No parents yet'}
          description={!search ? 'Tap + to add a parent.' : ''}
        />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={(p: any) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
          renderItem={({ item: parent }) => (
            <TouchableOpacity
              onPress={() => openDetail(parent)}
              activeOpacity={0.8}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Avatar name={parent.full_name} size={44} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>{parent.full_name}</ThemedText>
                <ThemedText variant="caption" color="muted">{parent.email}</ThemedText>
                {parent.linkedStudents.length > 0 && (
                  <ThemedText variant="caption" color="muted">
                    {parent.linkedStudents.length} student{parent.linkedStudents.length > 1 ? 's' : ''} linked
                  </ThemedText>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {parent.relationship && (
                  <Badge label={parent.relationship} preset="neutral" />
                )}
                {!parent.auth_user_id && (
                  <View style={[styles.noLoginBadge, { borderColor: Colors.semantic.warning }]}>
                    <ThemedText variant="label" style={{ color: Colors.semantic.warning, fontSize: 9 }}>NO LOGIN</ThemedText>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB */}
      <FAB
        icon={<Ionicons name="person-add" size={22} color="#fff" />}
        label="Add Parent"
        onPress={() => {
          haptics.light();
          setForm({ full_name: '', email: '', phone: '', relationship: 'guardian' });
          setFormError('');
          setAddVisible(true);
        }}
      />

      {/* ── Add Parent Sheet ────────────────────────────────── */}
      <BottomSheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        title="Add Parent / Guardian"
        snapHeight={520}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: 2, paddingBottom: Spacing.xl }}>
            <FormField label="Full Name *" value={form.full_name} onChangeText={(v: string) => setForm(p => ({ ...p, full_name: v }))} placeholder="e.g. Mary Banda" colors={colors} />
            <FormField label="Email *" value={form.email} onChangeText={(v: string) => setForm(p => ({ ...p, email: v }))} placeholder="e.g. mary@gmail.com" keyboardType="email-address" autoCapitalize="none" colors={colors} />
            <FormField label="Phone" value={form.phone} onChangeText={(v: string) => setForm(p => ({ ...p, phone: v }))} placeholder="+260 97…" keyboardType="phone-pad" colors={colors} />

            <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm, marginTop: Spacing.sm }}>
              RELATIONSHIP
            </ThemedText>
            <View style={styles.relRow}>
              {RELATIONSHIPS.map(r => {
                const active = form.relationship === r.value;
                return (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => { haptics.selection(); setForm(p => ({ ...p, relationship: r.value })); }}
                    style={[styles.relChip, {
                      backgroundColor: active ? colors.brand.primary + '18' : colors.surfaceSecondary,
                      borderColor: active ? colors.brand.primary : colors.border,
                    }]}
                  >
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
              onPress={() => addParent.mutate()}
              disabled={addParent.isPending}
              style={[styles.submitBtn, { backgroundColor: colors.brand.primary, opacity: addParent.isPending ? 0.7 : 1 }]}
            >
              <Ionicons name={addParent.isPending ? 'sync-outline' : 'checkmark'} size={20} color="#fff" />
              <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                {addParent.isPending ? 'Creating…' : 'Create Parent'}
              </ThemedText>
            </TouchableOpacity>
            <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
              After creating, link students and send a login invite from the parent detail.
            </ThemedText>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* ── Parent Detail Sheet ─────────────────────────────── */}
      <BottomSheet
        visible={detailVisible && !!selectedParent}
        onClose={() => setDetailVisible(false)}
        title={selectedParent?.full_name ?? 'Parent'}
        snapHeight={560}
      >
        {selectedParent && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ gap: Spacing.base, paddingBottom: Spacing.xl }}>
              {/* Info rows */}
              {[
                { icon: 'mail-outline',     label: selectedParent.email },
                { icon: 'call-outline',     label: selectedParent.phone ?? '—' },
                { icon: 'heart-outline',    label: selectedParent.relationship ?? '—' },
              ].map(row => (
                <View key={row.icon} style={styles.detailRow}>
                  <Ionicons name={row.icon as any} size={16} color={colors.textMuted} />
                  <ThemedText variant="body" style={{ marginLeft: Spacing.sm, flex: 1, textTransform: 'capitalize' }}>{row.label}</ThemedText>
                </View>
              ))}

              {/* Linked students */}
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                  <ThemedText variant="label" color="muted" style={{ flex: 1 }}>LINKED STUDENTS</ThemedText>
                  <TouchableOpacity
                    onPress={() => { setStudentSearch(''); setLinkVisible(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[styles.linkBtn, { backgroundColor: colors.brand.primary + '14' }]}>
                      <Ionicons name="link-outline" size={13} color={colors.brand.primary} />
                      <ThemedText variant="label" style={{ color: colors.brand.primary, fontWeight: '600' }}>Link</ThemedText>
                    </View>
                  </TouchableOpacity>
                </View>
                {selectedParent.linkedStudents.length === 0 ? (
                  <ThemedText variant="bodySm" color="muted">No students linked yet.</ThemedText>
                ) : (
                  selectedParent.linkedStudents.filter(Boolean).map((s: any) => (
                    <View key={s.id} style={[styles.studentRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <Avatar name={s.full_name} size={32} />
                      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                        <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{s.full_name}</ThemedText>
                        <ThemedText variant="caption" color="muted">{s.student_number}</ThemedText>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert('Unlink Student', `Remove ${s.full_name} from this parent?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Unlink', style: 'destructive', onPress: () => unlinkStudent.mutate(s.id) },
                          ]);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="unlink-outline" size={18} color={Colors.semantic.error} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              {/* Auth / invite card */}
              <View style={[styles.authCard, {
                backgroundColor: selectedParent.auth_user_id ? Colors.semantic.successLight : Colors.semantic.warningLight,
                borderColor: selectedParent.auth_user_id ? Colors.semantic.success : Colors.semantic.warning,
              }]}>
                <Ionicons
                  name={selectedParent.auth_user_id ? 'shield-checkmark' : 'mail-unread-outline'}
                  size={16}
                  color={selectedParent.auth_user_id ? Colors.semantic.success : Colors.semantic.warning}
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600', color: selectedParent.auth_user_id ? Colors.semantic.success : Colors.semantic.warning }}>
                    {selectedParent.auth_user_id ? 'Login enabled' : 'No login account yet'}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {selectedParent.auth_user_id ? 'This parent can sign in to view their child\'s progress.' : 'Send an invite email to create their login.'}
                  </ThemedText>
                </View>
                {!selectedParent.auth_user_id && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert('Send Invite', `Send a login invite to ${selectedParent.email}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Send', onPress: () => sendInvite.mutate(selectedParent) },
                      ]);
                    }}
                    disabled={sendInvite.isPending}
                    style={[styles.inviteBtn, { backgroundColor: Colors.semantic.warning }]}
                  >
                    <ThemedText variant="label" style={{ color: '#fff', fontWeight: '700' }}>
                      {sendInvite.isPending ? '…' : 'Invite'}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* ── Link Student Sheet ──────────────────────────────── */}
      <BottomSheet
        visible={linkVisible}
        onClose={() => { setLinkVisible(false); setStudentSearch(''); }}
        title="Link a Student"
        snapHeight={500}
      >
        <View style={{ flex: 1, gap: Spacing.sm }}>
          <SearchBar value={studentSearch} onChangeText={setStudentSearch} placeholder="Search student name or ID…" />
          <ScrollView showsVerticalScrollIndicator={false}>
            {availableStudents.length === 0 ? (
              <ThemedText variant="bodySm" color="muted" style={{ textAlign: 'center', marginTop: Spacing.xl }}>
                {studentSearch ? 'No matching students' : 'All active students are already linked.'}
              </ThemedText>
            ) : (
              availableStudents.map((s: any) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => linkStudent.mutate(s.id)}
                  disabled={linkStudent.isPending}
                  activeOpacity={0.75}
                  style={[styles.studentPickRow, { borderBottomColor: colors.border }]}
                >
                  <Avatar name={s.full_name} size={36} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>{s.full_name}</ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {s.student_number} · {(s.grades as any)?.name ?? ''} {(s.streams as any)?.name ?? ''}
                    </ThemedText>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.brand.primary} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── FormField helper ──────────────────────────────────────────
function FormField({ label, colors, ...props }: any) {
  return (
    <View style={{ gap: 4, marginBottom: Spacing.sm }}>
      <ThemedText variant="label" color="muted">{label}</ThemedText>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base,
    marginBottom: Spacing.sm, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md,
  },
  noLoginBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  relRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  relChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1.5,
  },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.md,
  },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.sm,
    borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.sm,
  },
  studentPickRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  authCard: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base,
    borderRadius: Radius.lg, borderWidth: 1,
  },
  inviteBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.md },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: 12, fontSize: 15,
  },
  errorBox: { padding: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.sm },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.base, borderRadius: Radius.lg, marginTop: Spacing.base,
  },
});
