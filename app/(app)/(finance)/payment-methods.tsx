import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, BottomSheet,
  EmptyState, ErrorState, ListItemSkeleton, Badge,
} from '../../../components/ui';
import {
  usePaymentMethods,
  useUpsertPaymentMethod,
  type PaymentMethod,
} from '../../../hooks/useInvoices';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const METHOD_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  cash:            'cash-outline',
  bank_transfer:   'business-outline',
  mobile_money:    'phone-portrait-outline',
  mpesa:           'phone-portrait-outline',
  airtel_money:    'phone-portrait-outline',
  cheque:          'document-text-outline',
  other:           'ellipsis-horizontal-circle-outline',
};

const BLANK_FORM = {
  code:               '',
  label:              '',
  sage_account_code:  '',
  is_active:          true,
  sort_order:         0,
};

export default function PaymentMethodsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: methods = [], isLoading, isError, refetch } = usePaymentMethods(schoolId);
  const upsert = useUpsertPaymentMethod(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  function openEdit(m: PaymentMethod) {
    setEditing(m);
    setForm({
      code:              m.code,
      label:             m.label,
      sage_account_code: m.sage_account_code ?? '',
      is_active:         m.is_active,
      sort_order:        m.sort_order ?? 0,
    });
    setSheetVisible(true);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK_FORM, sort_order: methods.length });
    setSheetVisible(true);
  }

  function handleSave() {
    if (!form.code.trim() || !form.label.trim()) return;
    upsert.mutate(
      {
        id:                editing?.id,
        code:              form.code.trim().toLowerCase().replace(/\s+/g, '_'),
        label:             form.label.trim(),
        sage_account_code: form.sage_account_code.trim() || null,
        is_active:         form.is_active,
        sort_order:        form.sort_order,
      },
      {
        onSuccess: () => { haptics.success(); setSheetVisible(false); },
        onError:   () => haptics.error(),
      },
    );
  }

  const active   = methods.filter((m) => m.is_active);
  const inactive = methods.filter((m) => !m.is_active);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Payment Methods" showBack />
        <ErrorState title="Could not load payment methods" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Payment Methods"
        showBack
        rightElement={
          <Pressable onPress={openNew} style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={[styles.infoBanner, { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primaryMuted }]}>
          <Ionicons name="card-outline" size={16} color={colors.brand.primary} />
          <ThemedText variant="caption" style={{ flex: 1, marginLeft: 6, color: colors.brand.primary }}>
            Active methods appear in payment recording. Set Sage account codes to enable CSV bank allocation.
          </ThemedText>
        </View>

        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <ListItemSkeleton key={i} />)
        ) : methods.length === 0 ? (
          <EmptyState
            title="No payment methods"
            description="Add payment methods used by your school."
            icon="card-outline"
          />
        ) : (
          <>
            {active.length > 0 && (
              <>
                <ThemedText variant="label" color="muted" style={styles.sectionLabel}>ACTIVE</ThemedText>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {active.map((m, i) => (
                    <MethodRow
                      key={m.id}
                      method={m}
                      last={i === active.length - 1}
                      onPress={() => openEdit(m)}
                      colors={colors}
                    />
                  ))}
                </View>
              </>
            )}

            {inactive.length > 0 && (
              <>
                <ThemedText variant="label" color="muted" style={styles.sectionLabel}>INACTIVE</ThemedText>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {inactive.map((m, i) => (
                    <MethodRow
                      key={m.id}
                      method={m}
                      last={i === inactive.length - 1}
                      onPress={() => openEdit(m)}
                      colors={colors}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Edit / Add Sheet ── */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editing ? `Edit: ${editing.label}` : 'New Payment Method'}
        snapHeight={460}
      >
        <View style={{ gap: Spacing.md }}>
          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">Label *</ThemedText>
            <TextInput
              value={form.label}
              onChangeText={(v) => setForm((f) => ({ ...f, label: v }))}
              placeholder="e.g. Bank Transfer"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          {!editing && (
            <View style={styles.fieldGroup}>
              <ThemedText variant="label" color="muted">Code *</ThemedText>
              <TextInput
                value={form.code}
                onChangeText={(v) => setForm((f) => ({ ...f, code: v }))}
                placeholder="e.g. bank_transfer (no spaces)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ThemedText variant="caption" color="muted">Unique code. Used internally — cannot change after creation.</ThemedText>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">Sage Account Code (optional)</ThemedText>
            <TextInput
              value={form.sage_account_code}
              onChangeText={(v) => setForm((f) => ({ ...f, sage_account_code: v }))}
              placeholder="e.g. BANK-STD or 1200"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <ThemedText variant="caption" color="muted">Maps receipts to this bank/cash GL account in Sage.</ThemedText>
          </View>

          <View style={[styles.fieldGroup, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View style={{ gap: 2 }}>
              <ThemedText variant="label" color="muted">Active</ThemedText>
              <ThemedText variant="caption" color="muted">Show in payment recording</ThemedText>
            </View>
            <Switch
              value={form.is_active}
              onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              trackColor={{ false: colors.border, true: colors.brand.primary }}
              thumbColor="#fff"
            />
          </View>

          <Button
            label={upsert.isPending ? 'Saving…' : 'Save Method'}
            variant="primary"
            fullWidth
            loading={upsert.isPending}
            disabled={!form.code.trim() || !form.label.trim()}
            onPress={handleSave}
          />
          <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheetVisible(false)} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function MethodRow({ method, last, onPress, colors }: { method: PaymentMethod; last: boolean; onPress: () => void; colors: any }) {
  const icon = METHOD_ICONS[method.code] ?? 'card-outline';
  return (
    <Pressable
      onPress={() => { haptics.light(); onPress(); }}
      style={({ pressed }) => [
        styles.methodRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: method.is_active ? colors.brand.primarySoft : colors.surfaceAlt ?? colors.border }]}>
        <Ionicons name={icon} size={18} color={method.is_active ? colors.brand.primary : colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="body" style={{ fontWeight: '600' }}>{method.label}</ThemedText>
        <ThemedText variant="caption" color="muted">{method.code}</ThemedText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {method.sage_account_code ? (
          <View style={[styles.codeChip, { backgroundColor: colors.brand.primarySoft }]}>
            <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '700' }}>{method.sage_account_code}</ThemedText>
          </View>
        ) : (
          <ThemedText variant="caption" color="muted">No GL code</ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { paddingHorizontal: Spacing.screen, paddingBottom: 60, gap: Spacing.md, paddingTop: Spacing.md },
  addBtn:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  infoBanner:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  sectionLabel:{ marginBottom: -4 },
  card:        { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  methodRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, gap: Spacing.md },
  iconWrap:    { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  codeChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm },
  fieldGroup:  { gap: Spacing.xs },
  input:       { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15 },
});
