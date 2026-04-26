import React, { useState, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, FlatList, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, SearchBar, Badge, BottomSheet, FAB,
  ListItemSkeleton, EmptyState, ErrorState, TabBar,
  ListItem, Chip, Button, FormField, IconChip,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const STATUS_TABS = ['new', 'in_progress', 'enrolled', 'closed'] as const;
const STATUS_META: Record<string, { label: string; preset: any; color: string }> = {
  new:         { label: 'New',         preset: 'info',    color: Colors.semantic.info },
  in_progress: { label: 'In Progress', preset: 'warning', color: Colors.semantic.warning },
  enrolled:    { label: 'Enrolled',    preset: 'success', color: Colors.semantic.success },
  closed:      { label: 'Closed',      preset: 'neutral', color: '#9CA3AF' },
};
const NATURES = ['Admission', 'Re-Enrollment', 'Fee Query', 'General', 'Transfer', 'Other'] as const;

function useInquiries(schoolId: string, status: string) {
  return useQuery({
    queryKey: ['inquiries', schoolId, status],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inquiries')
        .select('id, name, contact_phone, contact_email, nature_of_inquiry, date, status, notes, created_at')
        .eq('school_id', schoolId).eq('status', status)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export default function InquiriesScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId   = user?.schoolId ?? '';

  const [activeTab, setActiveTab]           = useState<string>('new');
  const [search, setSearch]                 = useState('');
  const [sheetVisible, setSheetVisible]     = useState(false);
  const [detailSheet, setDetailSheet]       = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', nature: 'Admission', notes: '' });

  const { data, isLoading, isError, refetch, isFetching } = useInquiries(schoolId, activeTab);

  const createInquiry = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name required');
      const { error } = await (supabase as any).from('inquiries').insert({
        school_id: schoolId, name: form.name.trim(),
        contact_phone: form.phone.trim() || null, contact_email: form.email.trim() || null,
        nature_of_inquiry: form.nature, notes: form.notes.trim() || null,
        created_by: user?.staffId, status: 'new',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      setSheetVisible(false);
      setForm({ name: '', phone: '', email: '', nature: 'Admission', notes: '' });
    },
    onError: () => haptics.error(),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from('inquiries').update({ status, updated_at: new Date().toISOString() })
        .eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => { haptics.success(); queryClient.invalidateQueries({ queryKey: ['inquiries'] }); setDetailSheet(false); },
    onError: () => haptics.error(),
  });

  const filtered = (data ?? []).filter(
    (i: any) => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.contact_phone ?? '').includes(search)
  );

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load inquiries" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={styles.topBar}>
        <ThemedText variant="h2">Inquiries</ThemedText>
      </View>

      {/* ── Status tabs ── */}
      <TabBar
        tabs={STATUS_TABS.map(t => ({ key: t, label: STATUS_META[t].label }))}
        activeKey={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      {/* ── Search ── */}
      <View style={{ paddingHorizontal: Spacing.screen, paddingTop: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or phone…" />
      </View>

      {/* ── List ── */}
      {isLoading ? (
        <View style={{ paddingHorizontal: Spacing.screen }}>
          {Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? `No results for "${search}"` : `No ${STATUS_META[activeTab].label.toLowerCase()} inquiries`}
          description={!search && activeTab === 'new' ? 'Tap + to log a new inquiry.' : ''}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: inq }) => (
            <View style={[styles.rowCard, { backgroundColor: colors.surface }, Shadow.sm]}>
              <ListItem
                title={inq.name}
                subtitle={[inq.nature_of_inquiry, inq.contact_phone].filter(Boolean).join(' · ')}
                caption={inq.date ? format(parseISO(inq.date), 'd MMM yyyy') : undefined}
                leading={
                  <IconChip
                    icon={<ThemedText style={{ color: STATUS_META[inq.status].color, fontSize: 16, fontWeight: '700' }}>{(inq.name ?? '?')[0].toUpperCase()}</ThemedText>}
                    bg={STATUS_META[inq.status].color + '18'}
                    size={44}
                    radius={22}
                  />
                }
                badge={{ label: STATUS_META[inq.status].label, preset: STATUS_META[inq.status].preset }}
                onPress={() => {
                  setSelectedInquiry(inq);
                  setDetailSheet(true);
                }}
              />
            </View>
          )}
        />
      )}

      <FAB
        icon={<Ionicons name="add" size={26} color="#fff" />}
        label="New Inquiry"
        onPress={() => setSheetVisible(true)}
      />

      {/* ── Create sheet ── */}
      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title="New Inquiry" snapHeight={580}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: Spacing.md }}>
            <FormField label="Full Name *" placeholder="Parent / Guardian name" value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} iconLeft="person-outline" autoFocus />
            <FormField label="Phone" placeholder="+260 97 000 0000" value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} iconLeft="call-outline" keyboardType="phone-pad" />
            <FormField label="Email" placeholder="example@mail.com" value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))} iconLeft="mail-outline" keyboardType="email-address" />
            <View>
              <ThemedText style={styles.fieldLabel}>Nature of Inquiry</ThemedText>
              <View style={styles.chipRow}>
                {NATURES.map(n => (
                  <Chip key={n} label={n} selected={form.nature === n} onPress={() => setForm(p => ({ ...p, nature: n }))} />
                ))}
              </View>
            </View>
            <FormField label="Notes" placeholder="Additional notes…" value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} textarea />
            <Button
              label={createInquiry.isPending ? 'Saving…' : 'Log Inquiry'}
              variant="primary"
              fullWidth
              loading={createInquiry.isPending}
              disabled={!form.name.trim()}
              onPress={() => createInquiry.mutate()}
            />
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>

      {/* ── Detail sheet ── */}
      <BottomSheet visible={detailSheet && !!selectedInquiry} onClose={() => setDetailSheet(false)} title={selectedInquiry?.name ?? 'Inquiry'} snapHeight={440}>
        {selectedInquiry && (
          <View style={{ gap: Spacing.md }}>
            {selectedInquiry.contact_phone && (
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                <ThemedText variant="body" style={{ marginLeft: Spacing.sm }}>{selectedInquiry.contact_phone}</ThemedText>
              </View>
            )}
            {selectedInquiry.contact_email && (
              <View style={styles.detailRow}>
                <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                <ThemedText variant="body" style={{ marginLeft: Spacing.sm }}>{selectedInquiry.contact_email}</ThemedText>
              </View>
            )}
            {selectedInquiry.nature_of_inquiry && (
              <View style={styles.detailRow}>
                <Ionicons name="help-circle-outline" size={16} color={colors.textMuted} />
                <ThemedText variant="body" style={{ marginLeft: Spacing.sm }}>{selectedInquiry.nature_of_inquiry}</ThemedText>
              </View>
            )}
            {selectedInquiry.notes && (
              <View style={[styles.notesBox, { backgroundColor: colors.surfaceSecondary }]}>
                <ThemedText style={styles.fieldLabel}>Notes</ThemedText>
                <ThemedText variant="bodySm">{selectedInquiry.notes}</ThemedText>
              </View>
            )}
            <ThemedText style={styles.fieldLabel}>Update Status</ThemedText>
            <View style={styles.chipRow}>
              {STATUS_TABS.filter(s => s !== selectedInquiry.status).map(s => (
                <Chip
                  key={s}
                  label={`→ ${STATUS_META[s].label}`}
                  selected={false}
                  onPress={() => updateStatus.mutate({ id: selectedInquiry.id, status: s })}
                />
              ))}
            </View>
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  topBar:    { paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  list:      { paddingHorizontal: Spacing.screen, paddingTop: Spacing.sm, paddingBottom: 120, gap: Spacing.sm },
  rowCard:   { borderRadius: Radius.lg, overflow: 'hidden' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.xs },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  notesBox:  { padding: Spacing.md, borderRadius: Radius.md },
});
