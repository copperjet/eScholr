import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Avatar, Card, Badge, SectionHeader,
  Skeleton, ErrorState, EmptyState, TabBar, BottomSheet, FormField,
  DatePickerField, Button,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import {
  useStaffDetail, useStaffRoleAssignments, useUpdateStaff,
  useUpsertRoleAssignment, useDeleteRoleAssignment,
  type StaffRoleAssignment,
} from '../../../hooks/useStaffRecords';
import { useStaffCertifications } from '../../../hooks/useCertifications';
import { useStaffDocuments } from '../../../hooks/useStaffDocuments';
import { useLeaveBalances, useStaffLeaveRequests } from '../../../hooks/useLeave';
import { supabase } from '../../../lib/supabase';

const TABS = ['Profile', 'Certifications', 'Documents', 'Roles', 'Leave'] as const;
type Tab = typeof TABS[number];

const CERT_PRESET: Record<string, string> = {
  valid: 'success', expiring: 'warning', expired: 'error',
};
const LEAVE_PRESET: Record<string, string> = {
  approved: 'success', pending: 'warning', rejected: 'error', cancelled: 'neutral',
};

export default function HRStaffDetail() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { staffId, staffName } = useLocalSearchParams<{ staffId: string; staffName?: string }>();
  const schoolId = user?.schoolId ?? '';
  const [activeTab, setActiveTab] = useState<Tab>('Profile');

  const { data: staff, isLoading: loadingStaff, isError, refetch: refetchStaff, isFetching } =
    useStaffDetail(staffId ?? '', schoolId);
  const { data: roleAssignments = [], refetch: refetchRoles } =
    useStaffRoleAssignments(staffId ?? '', schoolId);
  const { data: certs = [], refetch: refetchCerts } =
    useStaffCertifications(staffId ?? '', schoolId);
  const { data: docs = [], refetch: refetchDocs } =
    useStaffDocuments(staffId ?? '', schoolId);
  const { data: leaveBalances = [] } = useLeaveBalances(staffId ?? '', schoolId);
  const { data: leaveHistory = [] } = useStaffLeaveRequests(staffId ?? '', schoolId);

  const updateMutation = useUpdateStaff(schoolId);

  const refetch = () => { refetchStaff(); refetchRoles(); refetchCerts(); refetchDocs(); };

  const handleDeactivate = () => {
    if (!staffId) return;
    const isActive = staff?.status === 'active';
    Alert.alert(
      isActive ? 'Deactivate Staff?' : 'Reactivate Staff?',
      isActive
        ? `${staff?.full_name} will no longer appear in active staff lists.`
        : `${staff?.full_name} will be marked active again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isActive ? 'Deactivate' : 'Reactivate',
          style: isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateMutation.mutateAsync({
                staffId,
                patch: { status: isActive ? 'inactive' : 'active' },
              });
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Try again.');
            }
          },
        },
      ]
    );
  };

  const handleSendInvite = async () => {
    if (!staff) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    try {
      const res = await (supabase as any).functions.invoke('invite-user', {
        body: {
          staff_id:  staffId,
          email:     staff.email,
          full_name: staff.full_name,
          school_id: schoolId,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      const { temp_password } = res.data ?? {};
      Alert.alert(
        'Invite Sent',
        temp_password
          ? `Temp password: ${temp_password}\n\nShare this with the staff member.`
          : 'Login invite sent.'
      );
      refetchStaff();
    } catch (err: any) {
      Alert.alert('Invite failed', err.message ?? 'Try again.');
    }
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Staff Profile" showBack />
        <ErrorState title="Could not load staff data" onRetry={refetchStaff} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={staffName ?? 'Staff Profile'}
        showBack
        right={
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/(hr)/staff-edit' as any, params: { staffId } })}
            style={[styles.editBtn, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="pencil-outline" size={18} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !loadingStaff} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {loadingStaff ? (
          <LoadingSkeleton />
        ) : staff ? (
          <>
            {/* ── Profile card ─────────────────────────────────── */}
            <Card style={styles.card}>
              <View style={styles.profileRow}>
                <Avatar name={staff.full_name} photoUrl={staff.photo_url} size={64} />
                <View style={{ flex: 1, marginLeft: Spacing.base }}>
                  <ThemedText variant="h2" numberOfLines={2}>{staff.full_name}</ThemedText>
                  {staff.position   && <ThemedText variant="bodySm" color="muted">{staff.position}</ThemedText>}
                  {staff.department && <ThemedText variant="caption" color="muted">{staff.department}</ThemedText>}
                  <View style={{ flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs, flexWrap: 'wrap' }}>
                    <Badge label={staff.status ?? 'active'} preset={staff.status === 'active' ? 'success' : 'neutral'} />
                    {staff.staff_type && <Badge label={staff.staff_type.replace(/_/g, ' ')} preset="info" />}
                    {staff.login_status === 'none' && <Badge label="no login" preset="neutral" />}
                  </View>
                </View>
              </View>

              {/* Action row */}
              <View style={styles.actionRow}>
                {staff.login_status === 'none' && (
                  <Pressable
                    onPress={handleSendInvite}
                    style={[styles.actionBtn, { backgroundColor: colors.brand.primary + '18', borderColor: colors.brand.primary }]}
                  >
                    <Ionicons name="mail-outline" size={14} color={colors.brand.primary} />
                    <ThemedText style={{ color: colors.brand.primary, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>
                      Send Invite
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleDeactivate}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: (staff.status === 'active' ? Colors.semantic.error : Colors.semantic.success) + '18',
                      borderColor: staff.status === 'active' ? Colors.semantic.error : Colors.semantic.success,
                    },
                  ]}
                >
                  <Ionicons
                    name={staff.status === 'active' ? 'person-remove-outline' : 'person-add-outline'}
                    size={14}
                    color={staff.status === 'active' ? Colors.semantic.error : Colors.semantic.success}
                  />
                  <ThemedText style={{
                    color: staff.status === 'active' ? Colors.semantic.error : Colors.semantic.success,
                    fontSize: 12, fontWeight: '600', marginLeft: 4,
                  }}>
                    {staff.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </ThemedText>
                </Pressable>
              </View>
            </Card>

            {/* ── Tab bar ──────────────────────────────────────── */}
            <TabBar
              tabs={TABS.map((t) => ({ key: t, label: t }))}
              activeKey={activeTab}
              onChange={(k) => setActiveTab(k as Tab)}
              variant="pill"
              style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.base }}
            />

            {/* ── Tab content ─────────────────────────────────── */}
            {activeTab === 'Profile' && <ProfileTab staff={staff} colors={colors} />}
            {activeTab === 'Certifications' && (
              <CertificationsTab staffId={staffId ?? ''} certs={certs as any[]} colors={colors} />
            )}
            {activeTab === 'Documents' && (
              <DocumentsTab staffId={staffId ?? ''} docs={docs as any[]} colors={colors} />
            )}
            {activeTab === 'Roles' && (
              <RolesTab
                staffId={staffId ?? ''}
                schoolId={schoolId}
                assignments={roleAssignments as any[]}
                colors={colors}
                onRefresh={refetchRoles}
              />
            )}
            {activeTab === 'Leave' && (
              <LeaveTab balances={leaveBalances as any[]} history={leaveHistory as any[]} colors={colors} />
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

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab({ staff, colors }: { staff: any; colors: any }) {
  return (
    <>
      <SectionHeader title="Employment" />
      <Card style={styles.card}>
        <MetaGrid items={[
          { label: 'Staff No.',        value: staff.staff_number },
          { label: 'Staff Type',       value: staff.staff_type?.replace(/_/g, ' ') },
          { label: 'Employment Type',  value: staff.employment_type?.replace(/_/g, ' ') },
          { label: 'Hire Date',        value: staff.hire_date   ? format(new Date(staff.hire_date),   'dd MMM yyyy') : null },
          { label: 'Contract Start',   value: staff.contract_start ? format(new Date(staff.contract_start), 'dd MMM yyyy') : null },
          { label: 'Contract End',     value: staff.contract_end   ? format(new Date(staff.contract_end),   'dd MMM yyyy') : null },
          { label: 'Email',            value: staff.email },
          { label: 'Phone',            value: staff.phone },
        ]} />
      </Card>

      {(staff.dob || staff.gender || staff.national_id || staff.tax_id || staff.address || staff.emergency_contact_name) && (
        <>
          <SectionHeader title="Personal" />
          <Card style={styles.card}>
            <MetaGrid items={[
              { label: 'Date of Birth',     value: staff.dob ? format(new Date(staff.dob), 'dd MMM yyyy') : null },
              { label: 'Gender',            value: staff.gender?.replace(/_/g, ' ') },
              { label: 'National ID',       value: staff.national_id },
              { label: 'Tax ID',            value: staff.tax_id },
              { label: 'Address',           value: staff.address },
              { label: 'Emergency Contact', value: staff.emergency_contact_name },
              { label: 'Emergency Phone',   value: staff.emergency_contact_phone },
              { label: 'Relationship',      value: staff.emergency_contact_relation },
            ]} />
          </Card>
        </>
      )}

      {(staff.pay_type || staff.bank_name) && (
        <>
          <SectionHeader title="Pay & Banking" />
          <Card style={styles.card}>
            <MetaGrid items={[
              { label: 'Pay Type',     value: staff.pay_type },
              { label: 'Base Salary',  value: staff.base_salary != null ? `${staff.currency ?? ''} ${staff.base_salary}`.trim() : null },
              { label: 'Hourly Rate',  value: staff.hourly_rate != null ? `${staff.currency ?? ''} ${staff.hourly_rate}`.trim() : null },
              { label: 'Bank',         value: staff.bank_name },
              { label: 'Account No.',  value: staff.bank_account_number },
              { label: 'Branch',       value: staff.bank_branch },
            ]} />
          </Card>
        </>
      )}
    </>
  );
}

// ─── Certifications tab ───────────────────────────────────────────────────────

function CertificationsTab({ staffId, certs, colors }: { staffId: string; certs: any[]; colors: any }) {
  return (
    <>
      <View style={styles.tabActions}>
        <Pressable
          onPress={() => router.push({ pathname: '/(app)/(hr)/certifications' as any, params: { staffId, mode: 'add' } })}
          style={[styles.addSmallBtn, { backgroundColor: colors.brand.primary }]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 4 }}>Add</ThemedText>
        </Pressable>
      </View>

      {certs.length === 0 ? (
        <EmptyState title="No certifications" description="Add this staff member's credentials and licenses." icon="ribbon-outline" />
      ) : (
        certs.map((cert: any) => (
          <Card key={cert.id} style={[styles.card, styles.listCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>{cert.cert_type}</ThemedText>
                {cert.issuing_body && <ThemedText variant="caption" color="muted">{cert.issuing_body}</ThemedText>}
                {cert.cert_number  && <ThemedText variant="caption" color="muted">No. {cert.cert_number}</ThemedText>}
                {cert.expiry_date  && (
                  <ThemedText variant="caption" color="muted">
                    Expires {format(new Date(cert.expiry_date), 'dd MMM yyyy')}
                  </ThemedText>
                )}
              </View>
              <Badge label={cert.status} preset={(CERT_PRESET[cert.status] ?? 'neutral') as any} />
            </View>
          </Card>
        ))
      )}
    </>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────────────

function DocumentsTab({ staffId, docs, colors }: { staffId: string; docs: any[]; colors: any }) {
  return (
    <>
      <View style={styles.tabActions}>
        <Pressable
          onPress={() => router.push({ pathname: '/(app)/(hr)/documents' as any, params: { staffId } })}
          style={[styles.addSmallBtn, { backgroundColor: colors.brand.primary }]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 4 }}>Upload</ThemedText>
        </Pressable>
      </View>

      {docs.length === 0 ? (
        <EmptyState title="No documents" description="Upload contracts, ID copies, and other staff files." icon="document-outline" />
      ) : (
        docs.map((doc: any) => (
          <Card key={doc.id} style={[styles.card, styles.listCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <View style={[styles.docIcon, { backgroundColor: colors.brand.primary + '18' }]}>
                <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>
                  {doc.file_name ?? doc.doc_type}
                </ThemedText>
                <ThemedText variant="caption" color="muted">
                  {doc.doc_type} · {format(new Date(doc.uploaded_at), 'dd MMM yyyy')}
                </ThemedText>
                {doc.notes && <ThemedText variant="caption" color="muted" numberOfLines={1}>{doc.notes}</ThemedText>}
              </View>
            </View>
          </Card>
        ))
      )}
    </>
  );
}

// ─── Roles tab ────────────────────────────────────────────────────────────────

function RolesTab({
  staffId, schoolId, assignments, colors, onRefresh,
}: {
  staffId: string; schoolId: string; assignments: any[]; colors: any; onRefresh: () => void;
}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing]           = useState<StaffRoleAssignment | null>(null);
  const [role, setRole]                 = useState('');
  const [stipend, setStipend]           = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo]     = useState('');

  const upsertMutation = useUpsertRoleAssignment(schoolId);
  const deleteMutation = useDeleteRoleAssignment(schoolId);

  const openAdd = () => {
    setEditing(null);
    setRole(''); setStipend(''); setEffectiveFrom(''); setEffectiveTo('');
    setSheetVisible(true);
  };

  const openEdit = (a: StaffRoleAssignment) => {
    setEditing(a);
    setRole(a.role);
    setStipend(a.stipend_amount?.toString() ?? '');
    setEffectiveFrom(a.effective_from ?? '');
    setEffectiveTo(a.effective_to ?? '');
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (!role.trim()) {
      Alert.alert('Required', 'Role is required.');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        id:             editing?.id,
        staff_id:       staffId,
        role:           role.trim(),
        stipend_amount: stipend ? parseFloat(stipend) : null,
        effective_from: effectiveFrom || null,
        effective_to:   effectiveTo || null,
      });
      setSheetVisible(false);
      onRefresh();
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Try again.');
    }
  };

  const handleDelete = (a: StaffRoleAssignment) => {
    Alert.alert('Remove role assignment?', `Remove ${a.role.replace(/_/g, ' ')}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          deleteMutation.mutate({ id: a.id, staffId });
          onRefresh();
        },
      },
    ]);
  };

  return (
    <>
      <View style={styles.tabActions}>
        <Pressable
          onPress={openAdd}
          style={[styles.addSmallBtn, { backgroundColor: colors.brand.primary }]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 4 }}>Add Role</ThemedText>
        </Pressable>
      </View>

      {assignments.length === 0 ? (
        <EmptyState title="No role assignments" description="Additional roles and stipends appear here." icon="shield-outline" />
      ) : (
        <Card style={styles.card}>
          {assignments.map((a: any, i: number) => (
            <View
              key={a.id}
              style={[
                styles.roleRow,
                i < assignments.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              <View style={[styles.roleIcon, { backgroundColor: colors.brand.primary + '18' }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                  {a.role?.replace(/_/g, ' ') ?? '—'}
                </ThemedText>
                {a.stipend_amount != null && (
                  <ThemedText variant="caption" color="muted">Stipend: {a.stipend_amount}</ThemedText>
                )}
                {(a.effective_from || a.effective_to) && (
                  <ThemedText variant="caption" color="muted">
                    {a.effective_from ? format(new Date(a.effective_from), 'dd MMM yyyy') : '—'}
                    {' – '}
                    {a.effective_to ? format(new Date(a.effective_to), 'dd MMM yyyy') : 'ongoing'}
                  </ThemedText>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Pressable onPress={() => openEdit(a)}>
                  <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                </Pressable>
                <Pressable onPress={() => handleDelete(a)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.semantic.error} />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editing ? 'Edit Role' : 'Add Role'}
        snapHeight={520}
      >
        <FormField
          label="Role *"
          value={role}
          onChangeText={setRole}
          placeholder="hrt · st · hod · coordinator · hr · admin"
          autoCapitalize="none"
        />
        <FormField
          label="Stipend Amount"
          value={stipend}
          onChangeText={setStipend}
          keyboardType="decimal-pad"
          placeholder="Leave blank if none"
        />
        <DatePickerField label="Effective From" value={effectiveFrom} onChange={setEffectiveFrom} />
        <DatePickerField label="Effective To"   value={effectiveTo}   onChange={setEffectiveTo} />
        <Button
          label={editing ? 'Save Changes' : 'Add Role'}
          onPress={handleSave}
          loading={upsertMutation.isPending}
          disabled={!role.trim() || upsertMutation.isPending}
          style={{ marginTop: Spacing.base }}
        />
      </BottomSheet>
    </>
  );
}

// ─── Leave tab ────────────────────────────────────────────────────────────────

function LeaveTab({ balances, history, colors }: { balances: any[]; history: any[]; colors: any }) {
  return (
    <>
      {balances.length > 0 && (
        <>
          <SectionHeader title={`Leave Balances (${new Date().getFullYear()})`} />
          <Card style={styles.card}>
            {balances.map((b: any, i: number) => (
              <View
                key={i}
                style={[
                  styles.balanceRow,
                  i < balances.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
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
                  <ThemedText style={{
                    fontWeight: '800', fontSize: 16,
                    color: b.remaining_days > 0 ? Colors.semantic.success : Colors.semantic.error,
                  }}>
                    {b.remaining_days}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted"> left</ThemedText>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="Leave History" />
      {history.length === 0 ? (
        <EmptyState title="No leave requests" description="No leave taken." icon="calendar-outline" />
      ) : (
        history.map((leave: any) => (
          <Card key={leave.id} style={[styles.card, styles.listCard]}>
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
              </View>
              <Badge label={leave.status} preset={(LEAVE_PRESET[leave.status] ?? 'neutral') as any} />
            </View>
          </Card>
        ))
      )}
    </>
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

function LoadingSkeleton() {
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
  safe:        { flex: 1 },
  card:        { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg },
  listCard:    { padding: Spacing.md },
  profileRow:  { flexDirection: 'row', alignItems: 'center' },
  actionRow:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.base, flexWrap: 'wrap' },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  metaGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.base },
  metaItem:    { minWidth: '44%', flex: 1 },
  tabActions:  { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.screen, marginBottom: Spacing.sm },
  addSmallBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  roleRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  roleIcon:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docIcon:     { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  balanceRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  balancePill: { flexDirection: 'row', alignItems: 'baseline' },
  editBtn:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
