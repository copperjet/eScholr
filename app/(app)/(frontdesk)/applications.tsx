/**
 * Admissions Applications — /(app)/(frontdesk)/applications
 * Front desk reviews, updates status, and converts public admission applications.
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, RefreshControl,
  Alert, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, SearchBar, Badge, BottomSheet,
  ListItemSkeleton, EmptyState, ErrorState, TabBar,
  Card, Button, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const STATUS_TABS = ['submitted', 'reviewing', 'accepted', 'waitlisted', 'rejected', 'enrolled'] as const;
const STATUS_META: Record<string, { label: string; preset: any; color: string }> = {
  submitted:  { label: 'Submitted',  preset: 'info',    color: Colors.semantic.info },
  reviewing:  { label: 'Reviewing',  preset: 'warning', color: Colors.semantic.warning },
  accepted:   { label: 'Accepted',   preset: 'success', color: Colors.semantic.success },
  waitlisted: { label: 'Waitlisted', preset: 'warning', color: '#F59E0B' },
  rejected:   { label: 'Rejected',   preset: 'danger',  color: Colors.semantic.error },
  enrolled:   { label: 'Enrolled',   preset: 'success', color: Colors.semantic.success },
};

function useApplications(schoolId: string, status: string) {
  return useQuery({
    queryKey: ['admissions-applications', schoolId, status],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('admissions_applications')
        .select('*')
        .eq('school_id', schoolId)
        .eq('status', status)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export default function ApplicationsScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId   = user?.schoolId ?? '';
  const staffId    = user?.staffId ?? '';

  const [activeTab, setActiveTab] = useState<string>('submitted');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<any>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useApplications(schoolId, activeTab);

  // Filter by search
  const filtered = (data ?? []).filter((a: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return a.student_name?.toLowerCase().includes(s)
      || a.parent_name?.toLowerCase().includes(s)
      || a.parent_email?.toLowerCase().includes(s)
      || a.parent_phone?.includes(s)
      || a.grade_applying_for?.toLowerCase().includes(s);
  });

  // Status change mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await (supabase as any)
        .from('admissions_applications')
        .update({
          status: newStatus,
          reviewed_by: staffId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      setDetailVisible(false);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ['admissions-applications'] });
    },
    onError: (e: any) => { haptics.error(); Alert.alert('Error', e.message); },
  });

  const getNextStatuses = (current: string): string[] => {
    switch (current) {
      case 'submitted': return ['reviewing', 'accepted', 'rejected'];
      case 'reviewing': return ['accepted', 'waitlisted', 'rejected'];
      case 'accepted': return ['enrolled', 'rejected'];
      case 'waitlisted': return ['accepted', 'rejected'];
      default: return [];
    }
  };

  // ── Renderers ──

  const renderApplication = useCallback(({ item }: { item: any }) => {
    const meta = STATUS_META[item.status] ?? STATUS_META.submitted;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          haptics.selection();
          setSelected(item);
          setDetailVisible(true);
        }}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>{item.student_name}</ThemedText>
              <ThemedText variant="caption" color="muted">
                {item.grade_applying_for ? `Applying for: ${item.grade_applying_for}` : 'Grade not specified'}
              </ThemedText>
            </View>
            <Badge label={meta.label} preset={meta.preset} />
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={14} color={colors.textMuted} />
              <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>
                {item.parent_name}{item.parent_relationship !== 'parent' ? ` (${item.parent_relationship})` : ''}
              </ThemedText>
            </View>
            {item.parent_phone ? (
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>{item.parent_phone}</ThemedText>
              </View>
            ) : null}
            {item.parent_email ? (
              <View style={styles.detailRow}>
                <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>{item.parent_email}</ThemedText>
              </View>
            ) : null}
          </View>

          <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
            Submitted {format(parseISO(item.submitted_at), 'dd MMM yyyy')}
          </ThemedText>
        </Card>
      </TouchableOpacity>
    );
  }, [colors]);

  // ── Main render ──

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Applications" showBack />
        <ErrorState title="Could not load applications" description="Check your connection." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  // Count per tab
  const totalCount = (data ?? []).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Admissions" showBack />

      {/* Tabs */}
      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm }}>
        <TabBar
          tabs={STATUS_TABS.map((s) => ({ key: s, label: STATUS_META[s]?.label ?? s }))}
          activeTab={activeTab}
          onTabPress={setActiveTab}
        />
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search applicants..."
          style={{ marginTop: Spacing.sm }}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderApplication}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
        ListEmptyComponent={
          isLoading
            ? <View>{[1, 2, 3].map((i) => <ListItemSkeleton key={i} />)}</View>
            : <EmptyState title="No applications" description={`No ${activeTab} applications.`} icon="document-text-outline" />
        }
      />

      {/* Detail Sheet */}
      {selected && (
        <BottomSheet visible={detailVisible} onDismiss={() => { setDetailVisible(false); setSelected(null); }} title="Application Details">
          <View style={{ gap: Spacing.md }}>
            {/* Student info */}
            <View>
              <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>{selected.student_name}</ThemedText>
              <Badge label={STATUS_META[selected.status]?.label ?? selected.status} preset={STATUS_META[selected.status]?.preset ?? 'neutral'} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            </View>

            {selected.date_of_birth ? (
              <DetailRow icon="calendar-outline" label="Date of Birth" value={selected.date_of_birth} />
            ) : null}
            {selected.gender ? (
              <DetailRow icon="male-female-outline" label="Gender" value={selected.gender.charAt(0).toUpperCase() + selected.gender.slice(1)} />
            ) : null}
            {selected.nationality ? (
              <DetailRow icon="flag-outline" label="Nationality" value={selected.nationality} />
            ) : null}
            {selected.grade_applying_for ? (
              <DetailRow icon="school-outline" label="Grade" value={selected.grade_applying_for} />
            ) : null}
            {selected.previous_school ? (
              <DetailRow icon="business-outline" label="Previous School" value={selected.previous_school} />
            ) : null}

            {/* Separator */}
            <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 }} />

            {/* Parent info */}
            <ThemedText style={{ fontWeight: '600', fontSize: 14 }}>
              Parent / Guardian
            </ThemedText>
            <DetailRow icon="person-outline" label="Name" value={`${selected.parent_name} (${selected.parent_relationship})`} />
            {selected.parent_phone ? (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${selected.parent_phone}`)}>
                <DetailRow icon="call-outline" label="Phone" value={selected.parent_phone} tappable />
              </TouchableOpacity>
            ) : null}
            {selected.parent_email ? (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${selected.parent_email}`)}>
                <DetailRow icon="mail-outline" label="Email" value={selected.parent_email} tappable />
              </TouchableOpacity>
            ) : null}

            {selected.notes ? (
              <>
                <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 }} />
                <ThemedText style={{ fontWeight: '600', fontSize: 14 }}>Notes</ThemedText>
                <ThemedText variant="body" color="muted">{selected.notes}</ThemedText>
              </>
            ) : null}

            <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
              Submitted {format(parseISO(selected.submitted_at), 'dd MMM yyyy \'at\' HH:mm')}
              {selected.reviewed_at ? `\nReviewed ${format(parseISO(selected.reviewed_at), 'dd MMM yyyy \'at\' HH:mm')}` : ''}
            </ThemedText>

            {/* Action buttons */}
            {getNextStatuses(selected.status).length > 0 ? (
              <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
                <ThemedText style={{ fontWeight: '600', fontSize: 14 }}>Update Status</ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                  {getNextStatuses(selected.status).map((ns) => {
                    const meta = STATUS_META[ns];
                    return (
                      <Button
                        key={ns}
                        title={meta?.label ?? ns}
                        variant={ns === 'rejected' ? 'outline' : 'primary'}
                        size="sm"
                        onPress={() => {
                          Alert.alert(
                            `Mark as ${meta?.label}?`,
                            `Change ${selected.student_name}'s application status to ${meta?.label}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Confirm', onPress: () => updateStatus.mutate({ id: selected.id, newStatus: ns }) },
                            ],
                          );
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value, tappable }: { icon: string; label: string; value: string; tappable?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={icon as any} size={16} color={colors.textMuted} />
      <ThemedText variant="caption" color="muted" style={{ marginLeft: 8, width: 90 }}>{label}</ThemedText>
      <ThemedText variant="body" style={[{ flex: 1 }, tappable && { color: colors.brand.primary, textDecorationLine: 'underline' }]}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { marginBottom: Spacing.sm, padding: Spacing.md },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardDetails: { marginTop: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
