import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, RefreshControl, Alert, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ScreenHeader, SearchBar, FilterChipRow, Badge, Card, ThemedText,
  EmptyState, ErrorState, FastList, Skeleton, FormField, DatePickerField,
  Button, SectionHeader, BottomSheet,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { supabase } from '../../../lib/supabase';
import {
  useAllCertifications, useCreateCertification, useUpdateCertification,
  useDeleteCertification, type CertStatusFilter, type StaffCertification,
} from '../../../hooks/useCertifications';

const STATUS_CHIPS: Array<{ label: string; value: CertStatusFilter }> = [
  { label: 'All',      value: 'all' },
  { label: 'Valid',    value: 'valid' },
  { label: 'Expiring', value: 'expiring' },
  { label: 'Expired',  value: 'expired' },
];

const CERT_COLOR: Record<string, string> = {
  valid:    Colors.semantic.success,
  expiring: Colors.semantic.warning,
  expired:  Colors.semantic.error,
};
const CERT_PRESET: Record<string, string> = {
  valid: 'success', expiring: 'warning', expired: 'error',
};

const CERT_BUCKET = 'cert-documents';

export default function HRCertifications() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const { staffId: prefillStaffId, mode } = useLocalSearchParams<{ staffId?: string; mode?: string }>();

  const [statusFilter, setStatusFilter] = useState<CertStatusFilter>('all');
  const [search, setSearch]             = useState('');
  const [showForm, setShowForm]         = useState(mode === 'add');

  // Add form state
  const [formStaffId, setFormStaffId] = useState(prefillStaffId ?? '');
  const [certType, setCertType]       = useState('');
  const [certNumber, setCertNumber]   = useState('');
  const [issuingBody, setIssuingBody] = useState('');
  const [issueDate, setIssueDate]     = useState('');
  const [expiryDate, setExpiryDate]   = useState('');
  const [pickedFile, setPickedFile]   = useState<{ name: string; uri: string; mimeType?: string } | null>(null);
  const [uploading, setUploading]     = useState(false);

  // Edit sheet state
  const [editSheet, setEditSheet]     = useState(false);
  const [editCert, setEditCert]       = useState<StaffCertification | null>(null);
  const [editType, setEditType]       = useState('');
  const [editNumber, setEditNumber]   = useState('');
  const [editBody, setEditBody]       = useState('');
  const [editIssue, setEditIssue]     = useState('');
  const [editExpiry, setEditExpiry]   = useState('');
  const [editFile, setEditFile]       = useState<{ name: string; uri: string; mimeType?: string } | null>(null);
  const [editUploading, setEditUploading] = useState(false);

  const { data: certs = [], isLoading, isError, refetch, isRefetching } =
    useAllCertifications(schoolId, statusFilter);
  const createMutation = useCreateCertification(schoolId);
  const updateMutation = useUpdateCertification(schoolId);
  const deleteMutation = useDeleteCertification(schoolId);

  const filtered = certs.filter((c: any) => {
    const name = (c.staff?.full_name ?? '').toLowerCase();
    const type = (c.cert_type ?? '').toLowerCase();
    const q    = search.toLowerCase();
    return name.includes(q) || type.includes(q);
  });

  // ── file helpers ─────────────────────────────────────────────────────────────

  const pickFile = async (setter: (f: { name: string; uri: string; mimeType?: string } | null) => void) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setter({ name: a.name, uri: a.uri, mimeType: a.mimeType ?? undefined });
    }
  };

  const uploadCertFile = async (file: { name: string; uri: string; mimeType?: string }, certStaffId: string): Promise<string> => {
    const path = `${schoolId}/${certStaffId}/${Date.now()}_${file.name}`;
    const response = await fetch(file.uri);
    const blob     = await response.blob();
    const { error: upErr } = await (supabase as any).storage
      .from(CERT_BUCKET)
      .upload(path, blob, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;
    const { data: urlData } = (supabase as any).storage.from(CERT_BUCKET).getPublicUrl(path);
    return urlData.publicUrl as string;
  };

  // ── add ───────────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!formStaffId || !certType) {
      Alert.alert('Required', 'Staff ID and certification type are required.');
      return;
    }
    setUploading(true);
    try {
      let fileUrl: string | null = null;
      if (pickedFile) fileUrl = await uploadCertFile(pickedFile, formStaffId);

      await createMutation.mutateAsync({
        staff_id:     formStaffId,
        cert_type:    certType,
        cert_number:  certNumber || null,
        issuing_body: issuingBody || null,
        issue_date:   issueDate || null,
        expiry_date:  expiryDate || null,
        file_url:     fileUrl,
      });
      setCertType(''); setCertNumber(''); setIssuingBody('');
      setIssueDate(''); setExpiryDate(''); setPickedFile(null);
      setShowForm(false);
      if (prefillStaffId) router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── edit ──────────────────────────────────────────────────────────────────────

  const openEdit = (cert: StaffCertification) => {
    setEditCert(cert);
    setEditType(cert.cert_type);
    setEditNumber(cert.cert_number ?? '');
    setEditBody(cert.issuing_body ?? '');
    setEditIssue(cert.issue_date ?? '');
    setEditExpiry(cert.expiry_date ?? '');
    setEditFile(null);
    setEditSheet(true);
  };

  const handleEdit = async () => {
    if (!editCert || !editType) return;
    setEditUploading(true);
    try {
      let fileUrl = editCert.file_url;
      if (editFile) fileUrl = await uploadCertFile(editFile, editCert.staff_id);

      await updateMutation.mutateAsync({
        id: editCert.id,
        patch: {
          cert_type:    editType,
          cert_number:  editNumber || null,
          issuing_body: editBody || null,
          issue_date:   editIssue || null,
          expiry_date:  editExpiry || null,
          file_url:     fileUrl,
        },
      });
      setEditSheet(false);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Try again.');
    } finally {
      setEditUploading(false);
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────────

  const handleDelete = (id: string, staffId: string) => {
    Alert.alert('Delete certification?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteMutation.mutate({ id, staffId }),
      },
    ]);
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Certifications" showBack />
        <ErrorState title="Could not load certifications" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const isSaving = createMutation.isPending || uploading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Certifications"
        showBack
        right={
          <Pressable
            onPress={() => setShowForm((v) => !v)}
            style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
          </Pressable>
        }
      />

      {/* ── Add form ─────────────────────────────────────────── */}
      {showForm && (
        <Card style={[styles.card, { margin: Spacing.screen }]}>
          <SectionHeader title="New Certification" />
          {!prefillStaffId && (
            <FormField label="Staff ID" value={formStaffId} onChangeText={setFormStaffId} autoCapitalize="none" />
          )}
          <FormField label="Certification Type *" value={certType}    onChangeText={setCertType}    autoCapitalize="words" />
          <FormField label="Certificate Number"   value={certNumber}  onChangeText={setCertNumber} />
          <FormField label="Issuing Body"         value={issuingBody} onChangeText={setIssuingBody} />
          <DatePickerField label="Issue Date"  value={issueDate}  onChange={setIssueDate} />
          <DatePickerField label="Expiry Date" value={expiryDate} onChange={setExpiryDate} />
          <Pressable
            onPress={() => pickFile(setPickedFile)}
            style={[styles.filePicker, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="attach-outline" size={20} color={colors.brand.primary} />
            <ThemedText style={{ marginLeft: Spacing.sm, color: colors.brand.primary, fontWeight: '600', flex: 1 }} numberOfLines={1}>
              {pickedFile ? pickedFile.name : 'Attach certificate (optional)'}
            </ThemedText>
            {pickedFile && (
              <Pressable onPress={() => setPickedFile(null)}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </Pressable>
          <Button
            label="Save Certification"
            onPress={handleAdd}
            loading={isSaving}
            disabled={!certType || isSaving}
          />
        </Card>
      )}

      {/* ── Filters ──────────────────────────────────────────── */}
      <View style={styles.searchRow}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or type…" />
      </View>
      <FilterChipRow
        options={STATUS_CHIPS.map((c) => c.label)}
        selected={STATUS_CHIPS.find((c) => c.value === statusFilter)?.label ?? 'All'}
        onSelect={(label) => setStatusFilter(STATUS_CHIPS.find((c) => c.label === label)?.value ?? 'all')}
        style={{ paddingHorizontal: Spacing.screen, marginBottom: Spacing.sm }}
      />

      {/* ── List ─────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={{ padding: Spacing.screen, gap: Spacing.sm }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={72} radius={Radius.lg} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={statusFilter !== 'all' || search ? 'No results' : 'No certifications'}
          description="Add staff licenses and credentials to track expiry."
          icon="ribbon-outline"
        />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: cert }: { item: any }) => (
            <Card style={[styles.card, styles.listCard]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={[styles.certIcon, { backgroundColor: (CERT_COLOR[cert.status] ?? colors.brand.primary) + '18' }]}>
                  <Ionicons name="ribbon-outline" size={20} color={CERT_COLOR[cert.status] ?? colors.brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }}>{cert.cert_type}</ThemedText>
                  {cert.staff?.full_name && (
                    <ThemedText variant="caption" color="muted">{cert.staff.full_name}</ThemedText>
                  )}
                  {cert.issuing_body && <ThemedText variant="caption" color="muted">{cert.issuing_body}</ThemedText>}
                  {cert.expiry_date  && (
                    <ThemedText variant="caption" color="muted">
                      Expires {format(new Date(cert.expiry_date), 'dd MMM yyyy')}
                    </ThemedText>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: Spacing.xs }}>
                  <Badge label={cert.status} preset={(CERT_PRESET[cert.status] ?? 'neutral') as any} />
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs }}>
                    {cert.file_url && (
                      <Ionicons name="document-attach-outline" size={14} color={colors.brand.primary} />
                    )}
                    <Pressable onPress={() => openEdit(cert)}>
                      <Ionicons name="pencil-outline" size={14} color={colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => handleDelete(cert.id, cert.staff_id)}>
                      <Ionicons name="trash-outline" size={14} color={Colors.semantic.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </Card>
          )}
        />
      )}

      {/* ── Edit sheet ───────────────────────────────────────── */}
      <BottomSheet
        visible={editSheet}
        onClose={() => setEditSheet(false)}
        title="Edit Certification"
        snapHeight={580}
      >
        <FormField label="Certification Type *" value={editType}   onChangeText={setEditType}   autoCapitalize="words" />
        <FormField label="Certificate Number"   value={editNumber} onChangeText={setEditNumber} />
        <FormField label="Issuing Body"         value={editBody}   onChangeText={setEditBody} />
        <DatePickerField label="Issue Date"  value={editIssue}  onChange={setEditIssue} />
        <DatePickerField label="Expiry Date" value={editExpiry} onChange={setEditExpiry} />
        <Pressable
          onPress={() => pickFile(setEditFile)}
          style={[styles.filePicker, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="attach-outline" size={20} color={colors.brand.primary} />
          <ThemedText style={{ marginLeft: Spacing.sm, color: colors.brand.primary, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {editFile
              ? editFile.name
              : editCert?.file_url
              ? 'Replace attached file…'
              : 'Attach certificate (optional)'}
          </ThemedText>
          {editFile && (
            <Pressable onPress={() => setEditFile(null)}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </Pressable>
        <Button
          label="Save Changes"
          onPress={handleEdit}
          loading={updateMutation.isPending || editUploading}
          disabled={!editType || updateMutation.isPending || editUploading}
          style={{ marginTop: Spacing.base }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  searchRow:  { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  card:       { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, gap: Spacing.sm },
  listCard:   { padding: Spacing.md, gap: 0 },
  addBtn:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  certIcon:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  filePicker: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
});
