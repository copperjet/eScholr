/**
 * compliance-notice.tsx
 * Shown once to admin on first Finance or HR/Payroll module activation.
 * Requires explicit checkbox acknowledgement before proceeding.
 * Acknowledgement stored in school_configs: 'compliance_notice_acknowledged'
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Button, ScreenHeader } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const NOTICE_POINTS = [
  {
    icon: 'business-outline' as const,
    title: 'Sage is the system of record',
    body: 'eScholr collects and organises operational data — fee tracking, invoice generation, staff records, and payroll inputs. The authoritative financial books, payroll computation, and statutory reporting are maintained in Sage.',
  },
  {
    icon: 'calculator-outline' as const,
    title: 'No tax calculations in eScholr',
    body: 'eScholr does not compute PAYE, NAPSA, NHIMA, VAT, or any other statutory deduction. These are computed by Sage using the inputs exported from eScholr. Schools must ensure Sage is configured with current statutory tables.',
  },
  {
    icon: 'document-text-outline' as const,
    title: 'No audit-ready financials',
    body: "eScholr reports are operational (collections, aging, pay inputs). They are not substitutes for a General Ledger, Trial Balance, P&L, or Balance Sheet. Do not submit eScholr reports to regulators or auditors — use Sage's output.",
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'School accountant responsibility',
    body: "The school's accountant is responsible for reviewing Sage imports, reconciling balances, filing ZRA returns, and ensuring statutory compliance. eScholr provides data inputs only.",
  },
  {
    icon: 'arrow-forward-circle-outline' as const,
    title: 'One-way data flow',
    body: 'Data flows eScholr → Sage only. Sage never writes back to eScholr. If there is a discrepancy, the school\'s accountant must reconcile in Sage.',
  },
];

export default function ComplianceNoticeScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? '';

  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleAccept() {
    if (!acknowledged) {
      Alert.alert('Please acknowledge', 'Check the acknowledgement box before proceeding.');
      return;
    }
    setSaving(true);
    try {
      // Store acknowledgement in school_configs
      await (supabase as any).from('school_configs').upsert(
        {
          school_id: schoolId,
          key:       'compliance_notice_acknowledged',
          value:     JSON.stringify({ acknowledged: true, by: staffId, at: new Date().toISOString() }),
        },
        { onConflict: 'school_id,key' },
      );
      haptics.success();
      if (redirect) {
        router.replace(redirect as any);
      } else {
        router.back();
      }
    } catch {
      setSaving(false);
      Alert.alert('Error', 'Could not save acknowledgement. Please try again.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Compliance Notice" showBack={false} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primaryMuted }]}>
          <Ionicons name="shield-outline" size={32} color={colors.brand.primary} style={{ marginBottom: Spacing.sm }} />
          <ThemedText variant="h3" style={{ textAlign: 'center', color: colors.brand.primary }}>
            Finance & Payroll Module
          </ThemedText>
          <ThemedText variant="bodySm" style={{ textAlign: 'center', color: colors.brand.primary, marginTop: Spacing.xs }}>
            Before activating these features, please read and acknowledge the following.
          </ThemedText>
        </View>

        {/* Notice points */}
        {NOTICE_POINTS.map((p, i) => (
          <View key={i} style={[styles.pointCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.pointIcon, { backgroundColor: colors.brand.primarySoft }]}>
              <Ionicons name={p.icon} size={20} color={colors.brand.primary} />
            </View>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>{p.title}</ThemedText>
              <ThemedText variant="caption" color="secondary">{p.body}</ThemedText>
            </View>
          </View>
        ))}

        {/* Legal note */}
        <View style={[styles.legalNote, { backgroundColor: Colors.semantic.warningLight, borderColor: Colors.semantic.warning + '50' }]}>
          <Ionicons name="warning-outline" size={16} color={Colors.semantic.warning} />
          <ThemedText variant="caption" style={{ flex: 1, marginLeft: 8, color: Colors.semantic.warning }}>
            This acknowledgement confirms your school understands the division of responsibility between eScholr (operational data) and Sage (financial records, tax, statutory compliance). It does not constitute legal or financial advice.
          </ThemedText>
        </View>

        {/* Checkbox */}
        <Pressable
          onPress={() => { haptics.selection(); setAcknowledged((v) => !v); }}
          style={[styles.checkRow, { borderColor: acknowledged ? colors.brand.primary : colors.border, backgroundColor: acknowledged ? colors.brand.primarySoft : colors.surface }]}
        >
          <View style={[styles.checkbox, { borderColor: acknowledged ? colors.brand.primary : colors.border, backgroundColor: acknowledged ? colors.brand.primary : 'transparent' }]}>
            {acknowledged && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <ThemedText variant="bodySm" style={{ flex: 1, color: acknowledged ? colors.brand.primary : colors.textPrimary }}>
            I understand that eScholr is an operational tool. Financial records, payroll computation, and statutory compliance are the responsibility of the school's accountant using Sage.
          </ThemedText>
        </Pressable>

        {/* Buttons */}
        <Button
          label={saving ? 'Saving…' : 'Accept & Continue'}
          variant="primary"
          fullWidth
          loading={saving}
          disabled={!acknowledged || saving}
          onPress={handleAccept}
          iconLeft={<Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
        />
        <Button
          label="Cancel"
          variant="secondary"
          fullWidth
          onPress={() => router.back()}
          style={{ marginTop: Spacing.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  scroll:     { paddingHorizontal: Spacing.screen, paddingBottom: 60, gap: Spacing.md, paddingTop: Spacing.md },
  headerCard: { borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', borderWidth: 1 },
  pointCard:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  pointIcon:  { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  legalNote:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  checkRow:   { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, gap: Spacing.md },
  checkbox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
