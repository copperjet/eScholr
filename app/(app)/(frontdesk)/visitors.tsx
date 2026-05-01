/**
 * Visitor Log — /(app)/(frontdesk)/visitors
 * Front desk staff sign visitors in/out, with badge numbers and purposes.
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, RefreshControl,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, SearchBar, Badge, BottomSheet, FAB,
  ListItemSkeleton, EmptyState, ErrorState, TabBar,
  Card, Button, FormField, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// ── Hooks ────────────────────────────────────────────────────

function useVisitors(schoolId: string, filter: 'today' | 'active' | 'all') {
  return useQuery({
    queryKey: ['visitor-log', schoolId, filter],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      let q = (supabase as any)
        .from('visitor_log')
        .select('*')
        .eq('school_id', schoolId)
        .order('sign_in_at', { ascending: false });

      if (filter === 'today') {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        q = q.gte('sign_in_at', `${todayStr}T00:00:00`);
      } else if (filter === 'active') {
        q = q.is('sign_out_at', null);
      }

      q = q.limit(200);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ── Main Screen ──────────────────────────────────────────────

export default function VisitorLogScreen() {
  const { colors } = useTheme();
  const { user }   = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId   = user?.schoolId ?? '';
  const staffId    = user?.staffId ?? '';

  const [activeTab, setActiveTab] = useState<string>('today');
  const [search, setSearch]       = useState('');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [signOutId, setSignOutId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    visitorName: '', purpose: '', contactPhone: '',
    idNumber: '', visiting: '', vehicleReg: '', badgeNumber: '', notes: '',
  });

  const { data, isLoading, isError, refetch, isFetching } = useVisitors(schoolId, activeTab as any);

  // Filter by search
  const filtered = (data ?? []).filter((v: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return v.visitor_name?.toLowerCase().includes(s)
      || v.purpose?.toLowerCase().includes(s)
      || v.visiting?.toLowerCase().includes(s)
      || v.contact_phone?.includes(s);
  });

  // ── Mutations ──

  const signIn = useMutation({
    mutationFn: async () => {
      if (!form.visitorName.trim()) throw new Error('Visitor name is required');
      const { error } = await (supabase as any)
        .from('visitor_log')
        .insert({
          school_id: schoolId,
          visitor_name: form.visitorName.trim(),
          purpose: form.purpose.trim() || null,
          contact_phone: form.contactPhone.trim() || null,
          id_number: form.idNumber.trim() || null,
          visiting: form.visiting.trim() || null,
          vehicle_reg: form.vehicleReg.trim() || null,
          badge_number: form.badgeNumber.trim() || null,
          notes: form.notes.trim() || null,
          recorded_by: staffId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      setSheetVisible(false);
      setForm({ visitorName: '', purpose: '', contactPhone: '', idNumber: '', visiting: '', vehicleReg: '', badgeNumber: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['visitor-log'] });
    },
    onError: (e: any) => { haptics.error(); Alert.alert('Error', e.message); },
  });

  const signOut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('visitor_log')
        .update({ sign_out_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      setSignOutId(null);
      queryClient.invalidateQueries({ queryKey: ['visitor-log'] });
    },
    onError: (e: any) => { haptics.error(); Alert.alert('Error', e.message); },
  });

  // ── Renderers ──

  const formatTime = (iso: string) => {
    const d = parseISO(iso);
    if (isToday(d)) return `Today ${format(d, 'HH:mm')}`;
    if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
    return format(d, 'dd/MM HH:mm');
  };

  const renderVisitor = useCallback(({ item }: { item: any }) => {
    const isActive = !item.sign_out_at;
    return (
      <Card style={[styles.card, { borderLeftWidth: 3, borderLeftColor: isActive ? Colors.semantic.success : colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: '700', fontSize: 15 }}>{item.visitor_name}</ThemedText>
            {item.purpose ? <ThemedText variant="caption" color="muted">{item.purpose}</ThemedText> : null}
          </View>
          <Badge label={isActive ? 'In' : 'Out'} preset={isActive ? 'success' : 'neutral'} />
        </View>

        <View style={styles.cardDetails}>
          {item.visiting ? (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={14} color={colors.textMuted} />
              <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>Visiting: {item.visiting}</ThemedText>
            </View>
          ) : null}
          {item.contact_phone ? (
            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={14} color={colors.textMuted} />
              <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>{item.contact_phone}</ThemedText>
            </View>
          ) : null}
          {item.badge_number ? (
            <View style={styles.detailRow}>
              <Ionicons name="id-card-outline" size={14} color={colors.textMuted} />
              <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>Badge #{item.badge_number}</ThemedText>
            </View>
          ) : null}
          {item.vehicle_reg ? (
            <View style={styles.detailRow}>
              <Ionicons name="car-outline" size={14} color={colors.textMuted} />
              <ThemedText variant="caption" color="muted" style={{ marginLeft: 6 }}>{item.vehicle_reg}</ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <ThemedText variant="caption" color="muted">
            In: {formatTime(item.sign_in_at)}
            {item.sign_out_at ? `  •  Out: ${formatTime(item.sign_out_at)}` : ''}
          </ThemedText>
          {isActive ? (
            <Button
              label="Sign Out"
              variant="outline"
              size="sm"
              onPress={() => {
                haptics.medium();
                Alert.alert(
                  'Sign Out Visitor',
                  `Sign out ${item.visitor_name}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', onPress: () => signOut.mutate(item.id) },
                  ],
                );
              }}
            />
          ) : null}
        </View>
      </Card>
    );
  }, [colors, signOut]);

  // ── Main render ──

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Visitor Log" showBack />
        <ErrorState title="Could not load visitors" description="Check your connection." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const activeCount = (data ?? []).filter((v: any) => !v.sign_out_at).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Visitor Log" showBack />

      {/* Stats bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.stat}>
          <ThemedText style={{ fontWeight: '700', fontSize: 18, color: Colors.semantic.success }}>{activeCount}</ThemedText>
          <ThemedText variant="caption" color="muted">Currently In</ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText style={{ fontWeight: '700', fontSize: 18 }}>{(data ?? []).length}</ThemedText>
          <ThemedText variant="caption" color="muted">{activeTab === 'today' ? 'Today' : activeTab === 'active' ? 'Active' : 'Total'}</ThemedText>
        </View>
      </View>

      {/* Tabs + Search */}
      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm }}>
        <TabBar
          tabs={[
            { key: 'today', label: 'Today' },
            { key: 'active', label: 'Still In' },
            { key: 'all', label: 'All' },
          ]}
          activeTab={activeTab}
          onTabPress={setActiveTab}
        />
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search visitors..."
          style={{ marginTop: Spacing.sm }}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderVisitor}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
        ListEmptyComponent={
          isLoading
            ? <View>{[1, 2, 3].map((i) => <ListItemSkeleton key={i} />)}</View>
            : <EmptyState title="No visitors" description={activeTab === 'active' ? 'No visitors currently signed in.' : 'No visitor records yet.'} icon="people-outline" />
        }
      />

      {/* FAB */}
      <FAB
        icon="add"
        onPress={() => { haptics.medium(); setSheetVisible(true); }}
        style={{ bottom: TAB_BAR_HEIGHT + 8 }}
      />

      {/* Sign-In Sheet */}
      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title="Sign In Visitor">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FormField label="Visitor Name *" value={form.visitorName} onChangeText={(v: string) => setForm(f => ({ ...f, visitorName: v }))} placeholder="Full name" autoCapitalize="words" />
          <FormField label="Purpose" value={form.purpose} onChangeText={(v: string) => setForm(f => ({ ...f, purpose: v }))} placeholder="e.g. Parent meeting, Delivery" />
          <FormField label="Visiting (Person/Dept)" value={form.visiting} onChangeText={(v: string) => setForm(f => ({ ...f, visiting: v }))} placeholder="e.g. Mr. Smith, Admin Office" />
          <FormField label="Phone Number" value={form.contactPhone} onChangeText={(v: string) => setForm(f => ({ ...f, contactPhone: v }))} placeholder="+260..." keyboardType="phone-pad" />
          <FormField label="ID / Passport Number" value={form.idNumber} onChangeText={(v: string) => setForm(f => ({ ...f, idNumber: v }))} placeholder="National ID or passport" />
          <FormField label="Vehicle Registration" value={form.vehicleReg} onChangeText={(v: string) => setForm(f => ({ ...f, vehicleReg: v }))} placeholder="e.g. ABX 1234" autoCapitalize="characters" />
          <FormField label="Badge Number" value={form.badgeNumber} onChangeText={(v: string) => setForm(f => ({ ...f, badgeNumber: v }))} placeholder="Issued badge #" />
          <FormField label="Notes" value={form.notes} onChangeText={(v: string) => setForm(f => ({ ...f, notes: v }))} placeholder="Additional notes" multiline />

          <Button
            label={signIn.isPending ? 'Signing In...' : 'Sign In Visitor'}
            onPress={() => signIn.mutate()}
            disabled={signIn.isPending}
            style={{ marginTop: Spacing.lg }}
          />
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center' },
  card: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardDetails: { marginTop: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
});
