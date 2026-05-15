import React, { useCallback, useEffect, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, Pressable, Alert, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, ErrorState, Badge, Avatar, Button,
} from '../../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../../constants/Typography';
import { Colors } from '../../../../constants/Colors';
import { haptics } from '../../../../lib/haptics';
import { useInvoiceDetail } from '../../../../hooks/useInvoices';
import { useEnqueuePdf, usePdfStatus, isInFlight } from '../../../../hooks/usePdf';

function statusPreset(s: string) {
  switch (s) {
    case 'paid': return 'success';
    case 'partial': return 'warning';
    case 'unpaid': return 'error';
    default: return 'neutral';
  }
}

function formatK(v: number) {
  return `K${Number(v).toLocaleString('en', { minimumFractionDigits: 2 })}`;
}

export default function InvoiceDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: invoice, isLoading, isError, refetch } = useInvoiceDetail(id ?? null, schoolId);

  const enqueueInvoice = useEnqueuePdf('invoice');
  const pdfStatus      = usePdfStatus('invoice', invoice?.id ?? '');
  const [awaitingVersion, setAwaitingVersion] = useState<number | null>(null);
  const generatingPdf  = enqueueInvoice.isPending || isInFlight(pdfStatus.data?.status);

  const handleGeneratePdf = useCallback(async () => {
    if (!invoice) return;
    haptics.medium();
    const baseline = pdfStatus.data?.versionNumber ?? 0;
    try {
      await enqueueInvoice.mutateAsync({ docId: invoice.id });
      setAwaitingVersion(baseline);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message ?? 'Could not start PDF generation.');
    }
  }, [invoice, enqueueInvoice, pdfStatus.data?.versionNumber]);

  useEffect(() => {
    if (awaitingVersion === null) return;
    const s = pdfStatus.data;
    if (!s) return;

    if (s.status === 'success' && (s.versionNumber ?? 0) > awaitingVersion && s.pdfUrl) {
      const url = s.pdfUrl;
      setAwaitingVersion(null);
      haptics.success();
      refetch();
      Alert.alert(
        'PDF Ready',
        'Invoice PDF generated.',
        [
          { text: 'Open', onPress: () => Linking.openURL(url) },
          { text: 'OK' },
        ],
      );
    } else if (s.status === 'failed') {
      setAwaitingVersion(null);
      haptics.error();
      Alert.alert('Error', s.lastError ?? 'PDF generation failed.');
    }
  }, [awaitingVersion, pdfStatus.data, refetch]);

  const handleOpenPdf = useCallback(() => {
    const url = pdfStatus.data?.pdfUrl ?? invoice?.pdf_url;
    if (url) Linking.openURL(url);
  }, [pdfStatus.data?.pdfUrl, invoice?.pdf_url]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Invoice" showBack />
        <ErrorState title="Could not load invoice" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (isLoading || !invoice) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Invoice" showBack />
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="100%" height={100} />
          <Skeleton width="100%" height={60} />
        </View>
      </SafeAreaView>
    );
  }

  const student = invoice.students;
  const isOverdue = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date && new Date() > parseISO(invoice.due_date);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={invoice.invoice_number} showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Status + student */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <View style={styles.studentRow}>
            <Avatar name={student?.full_name ?? '?'} photoUrl={student?.photo_url} size={48} />
            <View style={{ flex: 1, gap: 3 }}>
              <ThemedText variant="h3">{student?.full_name ?? '—'}</ThemedText>
              <ThemedText variant="caption" color="muted">{student?.student_number ?? ''}</ThemedText>
            </View>
          </View>
          <View style={[styles.divider, { borderTopColor: colors.border }]} />
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <ThemedText variant="caption" color="muted">Invoice</ThemedText>
              <ThemedText variant="h4">{invoice.invoice_number}</ThemedText>
            </View>
            <View style={styles.metaCell}>
              <ThemedText variant="caption" color="muted">Issued</ThemedText>
              <ThemedText variant="h4">{format(parseISO(invoice.issue_date), 'dd/MM/yyyy')}</ThemedText>
            </View>
            <View style={styles.metaCell}>
              <ThemedText variant="caption" color="muted">Due</ThemedText>
              <ThemedText variant="h4" style={isOverdue ? { color: Colors.semantic.error } : undefined}>
                {invoice.due_date ? format(parseISO(invoice.due_date), 'dd/MM/yyyy') : '—'}
              </ThemedText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
            <Badge label={invoice.status.toUpperCase()} preset={statusPreset(invoice.status)} />
            {isOverdue && <Badge label="OVERDUE" preset="error" />}
            {invoice.sage_exported && (
              <Badge label="SAGE ✓" preset="success" />
            )}
          </View>
        </View>

        {/* Line items */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.md }}>LINE ITEMS</ThemedText>
          {(invoice.invoice_items ?? []).length === 0 ? (
            <ThemedText variant="caption" color="muted">No line items</ThemedText>
          ) : (
            (invoice.invoice_items ?? []).map((item) => (
              <View key={item.id} style={styles.lineRow}>
                <ThemedText variant="body" style={{ flex: 1 }}>
                  {item.fee_categories?.name ?? item.description ?? 'Fee'}
                </ThemedText>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>{formatK(item.amount)}</ThemedText>
              </View>
            ))
          )}
          <View style={[styles.divider, { borderTopColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <ThemedText variant="body" style={{ fontWeight: '700' }}>Total</ThemedText>
            <ThemedText variant="h3" style={{ color: colors.brand.primary }}>{formatK(invoice.total_amount)}</ThemedText>
          </View>
          {invoice.paid_amount > 0 && (
            <View style={styles.summaryRow}>
              <ThemedText variant="body" color="muted">Paid</ThemedText>
              <ThemedText variant="body" color="muted" style={{ fontWeight: '600' }}>{formatK(invoice.paid_amount)}</ThemedText>
            </View>
          )}
          {invoice.status !== 'paid' && Number(invoice.balance) > 0 && (
            <View style={styles.summaryRow}>
              <ThemedText variant="body" style={{ fontWeight: '700', color: Colors.semantic.error }}>Balance</ThemedText>
              <ThemedText variant="h4" style={{ color: Colors.semantic.error }}>{formatK(invoice.balance)}</ThemedText>
            </View>
          )}
        </View>

        {/* Notes */}
        {invoice.notes ? (
          <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
            <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>NOTES</ThemedText>
            <ThemedText variant="body" color="secondary">{invoice.notes}</ThemedText>
          </View>
        ) : null}

        {/* Actions */}
        <View style={{ gap: Spacing.sm }}>
          {invoice.pdf_url ? (
            <Button
              label="View PDF"
              variant="secondary"
              fullWidth
              onPress={handleOpenPdf}
              iconLeft={<Ionicons name="document-text-outline" size={18} color={colors.brand.primary} />}
            />
          ) : (
            <Button
              label={generatingPdf ? 'Generating PDF…' : 'Generate Invoice PDF'}
              variant="secondary"
              fullWidth
              loading={generatingPdf}
              onPress={handleGeneratePdf}
              iconLeft={<Ionicons name="print-outline" size={18} color={colors.brand.primary} />}
            />
          )}
          {invoice.pdf_url && (
            <Button
              label={generatingPdf ? 'Regenerating…' : 'Regenerate PDF'}
              variant="ghost"
              fullWidth
              loading={generatingPdf}
              onPress={handleGeneratePdf}
            />
          )}
        </View>

        {/* Metadata */}
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
          <ThemedText variant="caption" color="muted">
            Semester: {invoice.semesters?.name ?? '—'} · Currency: {invoice.currency ?? 'ZMW'}
          </ThemedText>
          {invoice.sent_to_parent_at && (
            <ThemedText variant="caption" color="muted">
              Sent to parent: {format(parseISO(invoice.sent_to_parent_at), 'dd/MM/yyyy HH:mm')}
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 60 },
  card: { borderRadius: Radius.lg, padding: Spacing.md },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: Spacing.md },
  metaRow: { flexDirection: 'row', gap: Spacing.md },
  metaCell: { flex: 1, gap: 3 },
  lineRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
});
