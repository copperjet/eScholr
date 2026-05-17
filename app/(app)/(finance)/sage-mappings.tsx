import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, BottomSheet,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../components/ui';
import {
  useSageAccountMappings,
  useUpsertSageMapping,
  DEFAULT_SAGE_KEYS,
  type SageAccountMapping,
} from '../../../hooks/useInvoices';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const KEY_DESCRIPTIONS: Record<string, string> = {
  'AR':                 'Accounts Receivable — student debtor control account',
  'Revenue:Tuition':    'Tuition fee revenue account',
  'Revenue:Transport':  'Transport fee revenue account',
  'Revenue:Uniform':    'Uniform fee revenue account',
  'Revenue:Lunch':      'Lunch/catering fee revenue account',
  'Revenue:Other':      'Other miscellaneous fee revenue',
  'Cash':               'Cash receipts bank/till account',
  'Bank':               'Bank account for EFT/bank transfers',
  'Discount':           'Fee discount / bursary contra account',
};

const BLANK_FORM = { internal_key: '', sage_account_code: '', sage_dimension: '' };

export default function SageMappingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: mappings = [], isLoading, isError, refetch } = useSageAccountMappings(schoolId);
  const upsert = useUpsertSageMapping(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [customKey, setCustomKey] = useState(false);

  // Index existing mappings by internal_key for quick lookup
  const mapped = Object.fromEntries(mappings.map((m) => [m.internal_key, m]));

  function openEdit(key: string) {
    const existing = mapped[key];
    setForm({
      internal_key:      existing?.internal_key      ?? key,
      sage_account_code: existing?.sage_account_code ?? '',
      sage_dimension:    existing?.sage_dimension     ?? '',
    });
    setCustomKey(false);
    setSheetVisible(true);
  }

  function openNew() {
    setForm(BLANK_FORM);
    setCustomKey(true);
    setSheetVisible(true);
  }

  function handleSave() {
    if (!form.internal_key.trim() || !form.sage_account_code.trim()) return;
    upsert.mutate(
      { internal_key: form.internal_key.trim(), sage_account_code: form.sage_account_code.trim(), sage_dimension: form.sage_dimension.trim() || null },
      {
        onSuccess: () => { haptics.success(); setSheetVisible(false); },
        onError:   () => haptics.error(),
      },
    );
  }

  const allKeys = [
    ...DEFAULT_SAGE_KEYS,
    ...mappings.filter((m) => !DEFAULT_SAGE_KEYS.includes(m.internal_key)).map((m) => m.internal_key),
  ];

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Sage Mappings" showBack />
        <ErrorState title="Could not load mappings" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Sage Account Mappings"
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
          <Ionicons name="link-outline" size={16} color={colors.brand.primary} />
          <ThemedText variant="caption" style={{ flex: 1, marginLeft: 6, color: colors.brand.primary }}>
            Map eScholr internal keys to your Sage chart-of-accounts codes. Used when generating CSV exports.
          </ThemedText>
        </View>

        {isLoading ? (
          Array.from({ length: 9 }).map((_, i) => <ListItemSkeleton key={i} />)
        ) : (
          <>
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>CHART OF ACCOUNTS</ThemedText>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {allKeys.map((key, i) => {
                const m = mapped[key];
                const isLast = i === allKeys.length - 1;
                const isMapped = !!m?.sage_account_code;
                return (
                  <Pressable
                    key={key}
                    onPress={() => openEdit(key)}
                    style={({ pressed }) => [
                      styles.mapRow,
                      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                        <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{key}</ThemedText>
                        {!isMapped && (
                          <View style={[styles.chip, { backgroundColor: Colors.semantic.warningLight }]}>
                            <ThemedText variant="caption" style={{ color: Colors.semantic.warning, fontSize: 10 }}>Unmapped</ThemedText>
                          </View>
                        )}
                      </View>
                      {KEY_DESCRIPTIONS[key] ? (
                        <ThemedText variant="caption" color="muted" numberOfLines={1}>{KEY_DESCRIPTIONS[key]}</ThemedText>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {isMapped ? (
                        <>
                          <ThemedText variant="bodySm" style={{ fontWeight: '700', color: colors.brand.primary }}>{m.sage_account_code}</ThemedText>
                          {m.sage_dimension ? <ThemedText variant="caption" color="muted">{m.sage_dimension}</ThemedText> : null}
                        </>
                      ) : (
                        <ThemedText variant="caption" color="muted">Tap to set</ThemedText>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.textMuted} style={{ marginLeft: 4 }} />
                  </Pressable>
                );
              })}
            </View>

            {allKeys.filter((k) => !mapped[k]?.sage_account_code).length > 0 && (
              <View style={[styles.warnBanner, { backgroundColor: Colors.semantic.warningLight, borderColor: Colors.semantic.warning + '40' }]}>
                <Ionicons name="warning-outline" size={14} color={Colors.semantic.warning} />
                <ThemedText variant="caption" style={{ flex: 1, marginLeft: 6, color: Colors.semantic.warning }}>
                  {allKeys.filter((k) => !mapped[k]?.sage_account_code).length} unmapped key{allKeys.filter((k) => !mapped[k]?.sage_account_code).length !== 1 ? 's' : ''}. CSV exports may omit account codes.
                </ThemedText>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Edit / Add Sheet ── */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={customKey ? 'New Mapping' : `Edit: ${form.internal_key}`}
        snapHeight={360}
      >
        <View style={{ gap: Spacing.md }}>
          {customKey && (
            <View style={styles.fieldGroup}>
              <ThemedText variant="label" color="muted">Internal Key</ThemedText>
              <TextInput
                value={form.internal_key}
                onChangeText={(v) => setForm((f) => ({ ...f, internal_key: v }))}
                placeholder="e.g. Revenue:Boarding"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">Sage Account Code *</ThemedText>
            <TextInput
              value={form.sage_account_code}
              onChangeText={(v) => setForm((f) => ({ ...f, sage_account_code: v }))}
              placeholder="e.g. 5000 or DEBTORS"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <ThemedText variant="caption" color="muted">Must match the account code in your Sage company file.</ThemedText>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText variant="label" color="muted">Dimension / Cost Centre (optional)</ThemedText>
            <TextInput
              value={form.sage_dimension}
              onChangeText={(v) => setForm((f) => ({ ...f, sage_dimension: v }))}
              placeholder="e.g. SCHOOL1"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <Button
            label={upsert.isPending ? 'Saving…' : 'Save Mapping'}
            variant="primary"
            fullWidth
            loading={upsert.isPending}
            disabled={!form.internal_key.trim() || !form.sage_account_code.trim()}
            onPress={handleSave}
          />
          <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheetVisible(false)} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { paddingHorizontal: Spacing.screen, paddingBottom: 60, gap: Spacing.md, paddingTop: Spacing.md },
  addBtn:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  infoBanner:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  sectionLabel:{ marginBottom: -4 },
  card:        { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  mapRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, gap: Spacing.md },
  chip:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  warnBanner:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  fieldGroup:  { gap: Spacing.xs },
  input:       { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15 },
});
