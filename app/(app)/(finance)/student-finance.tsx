/**
 * Finance — Student Detail
 * Route: /(app)/(finance)/student-finance?finance_record_id=&student_name=
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, BottomSheet,
  Skeleton, SkeletonRow, EmptyState, ErrorState,
} from '../../../components/ui';
import { Spacing, Radius, Typography } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

function useStudentFinance(financeRecordId: string, schoolId: string) {
  return useQuery({
    queryKey: ['student-finance', financeRecordId],
    enabled: !!financeRecordId && !!schoolId,
    queryFn: async () => {
      const [recordRes, txRes] = await Promise.all([
        supabase
          .from('finance_records')
          .select(`
            id, status, balance, updated_at,
            students (
              id, full_name, student_number, photo_url,
              grades ( name ), streams ( name )
            ),
            semesters ( id, name )
          `)
          .eq('id', financeRecordId)
          .single(),
        supabase
          .from('payment_transactions')
          .select('id, amount, paid_at, note, staff:recorded_by(full_name)')
          .eq('finance_record_id', financeRecordId)
          .order('paid_at', { ascending: false }),
      ]);

      if (recordRes.error) throw recordRes.error;
      return {
        record: recordRes.data as any,
        transactions: (txRes.data ?? []) as any[],
      };
    },
  });
}

export default function StudentFinanceScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ finance_record_id: string; student_name: string }>();
  const { finance_record_id, student_name } = params;

  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [amountError, setAmountError] = useState('');

  const { data, isLoading, isError, refetch, isRefetching } = useStudentFinance(
    finance_record_id ?? '', user?.schoolId ?? ''
  );

  const record = data?.record;
  const txs    = data?.transactions ?? [];
  const student = record?.students;
  const semester = record?.semesters;
  const isPaid  = record?.status === 'paid';
  const balance = Number(record?.balance ?? 0);

  // Optimistic mark-paid
  const markPaid = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('finance_records')
        .update({ status: 'paid', balance: 0, updated_by: user?.staffId, updated_at: new Date().toISOString() })
        .eq('id', finance_record_id);
      if (error) throw error;
      (supabase as any).from('audit_logs').insert({
        school_id: user?.schoolId,
        event_type: 'finance_status_changed',
        actor_id: user?.staffId,
        student_id: student?.id,
        data: { action: 'mark_paid', finance_record_id },
      } as any).then(() => {});
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['student-finance', finance_record_id] });
      queryClient.invalidateQueries({ queryKey: ['finance-records'] });
    },
    onError: () => haptics.error(),
  });

  // Record payment transaction
  const recordPayment = useMutation({
    mutationFn: async ({ amount, note }: { amount: number; note: string }) => {
      // Insert transaction
      const { error: txErr } = await (supabase as any)
        .from('payment_transactions')
        .insert({
          school_id: user?.schoolId,
          finance_record_id,
          amount,
          recorded_by: user?.staffId,
          note: note.trim() || null,
          paid_at: new Date().toISOString(),
        } as any);
      if (txErr) throw txErr;

      // Update balance
      const newBalance = Math.max(0, balance - amount);
      const newStatus  = newBalance === 0 ? 'paid' : 'unpaid';
      const { error: frErr } = await (supabase as any)
        .from('finance_records')
        .update({ balance: newBalance, status: newStatus, updated_by: user?.staffId, updated_at: new Date().toISOString() })
        .eq('id', finance_record_id);
      if (frErr) throw frErr;

      (supabase as any).from('audit_logs').insert({
        school_id: user?.schoolId,
        event_type: 'finance_status_changed',
        actor_id: user?.staffId,
        student_id: student?.id,
        data: { action: 'payment_recorded', amount, new_balance: newBalance, finance_record_id },
      } as any).then(() => {});
    },
    onSuccess: () => {
      haptics.success();
      setPaymentSheetVisible(false);
      setAmountInput('');
      setNoteInput('');
      setAmountError('');
      queryClient.invalidateQueries({ queryKey: ['student-finance', finance_record_id] });
      queryClient.invalidateQueries({ queryKey: ['finance-records'] });
    },
    onError: () => haptics.error(),
  });

  // Generate receipt PDF
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  const handleGenerateReceipt = async () => {
    setGeneratingReceipt(true);
    haptics.medium();
    try {
      const { data, error } = await (supabase as any).functions.invoke('generate-receipt', {
        body: { finance_record_id },
      });
      if (error || !data?.receipt_url) throw new Error('Receipt generation failed');
      haptics.success();
      // Offer share + open
      const result = await Share.share({ message: `Receipt: ${data.receipt_url}`, url: data.receipt_url }).catch(() => null);
      if (!result || result.action === Share.dismissedAction) {
        await WebBrowser.openBrowserAsync(data.receipt_url);
      }
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not generate receipt. Try again.');
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const handleRecordPayment = () => {
    setAmountError('');
    const parsed = parseFloat(amountInput);
    if (!amountInput || isNaN(parsed) || parsed <= 0) {
      setAmountError('Enter a valid amount greater than 0.');
      haptics.error();
      return;
    }
    if (parsed > balance && balance > 0) {
      setAmountError(`Amount exceeds outstanding balance (${formatAmount(balance)}).`);
      haptics.error();
      return;
    }
    recordPayment.mutate({ amount: parsed, note: noteInput });
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <BackHeader student_name={student_name} colors={colors} />
        <ErrorState title="Could not load" description="Check your connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <BackHeader student_name={student_name} colors={colors} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* Student header */}
        {isLoading ? (
          <Card style={styles.card}><SkeletonRow lines={2} /></Card>
        ) : (
          <Card style={styles.card}>
            <View style={styles.studentRow}>
              <Avatar name={student?.full_name ?? '?'} photoUrl={student?.photo_url} size={52} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="h4">{student?.full_name}</ThemedText>
                <ThemedText variant="bodySm" color="muted">
                  {student?.student_number} · {student?.grades?.name} {student?.streams?.name}
                </ThemedText>
                <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
                  {semester?.name}
                </ThemedText>
              </View>
            </View>
          </Card>
        )}

        {/* Fee status */}
        {isLoading ? (
          <Card style={styles.card}><SkeletonRow lines={2} /></Card>
        ) : (
          <Card
            accentColor={isPaid ? Colors.semantic.success : Colors.semantic.error}
            style={styles.card}
          >
            <View style={styles.feeRow}>
              <View>
                <ThemedText variant="label" color="muted">FEE STATUS</ThemedText>
                <ThemedText variant="h2" style={{ color: isPaid ? Colors.semantic.success : Colors.semantic.error }}>
                  {isPaid ? 'Paid' : 'Unpaid'}
                </ThemedText>
                {!isPaid && balance > 0 && (
                  <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, marginTop: 2 }}>
                    Balance: {formatAmount(balance)}
                  </ThemedText>
                )}
              </View>
              <View style={[styles.feeIcon, { backgroundColor: (isPaid ? Colors.semantic.success : Colors.semantic.error) + '18' }]}>
                <Ionicons
                  name={isPaid ? 'checkmark-circle' : 'close-circle'}
                  size={32}
                  color={isPaid ? Colors.semantic.success : Colors.semantic.error}
                />
              </View>
            </View>

            {/* Action buttons */}
            {/* Receipt button — always visible when record exists */}
            {record && (
              <TouchableOpacity
                onPress={handleGenerateReceipt}
                disabled={generatingReceipt}
                style={[styles.receiptBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, opacity: generatingReceipt ? 0.6 : 1 }]}
              >
                <Ionicons name={generatingReceipt ? 'hourglass-outline' : 'receipt-outline'} size={16} color={colors.brand.primary} />
                <ThemedText variant="bodySm" style={{ color: colors.brand.primary, fontWeight: '600', marginLeft: 6 }}>
                  {generatingReceipt ? 'Generating…' : 'Download Receipt'}
                </ThemedText>
              </TouchableOpacity>
            )}

            {!isPaid && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => markPaid.mutate()}
                  disabled={markPaid.isPending}
                  style={[styles.actionBtn, { backgroundColor: Colors.semantic.success, opacity: markPaid.isPending ? 0.7 : 1, flex: 1 }]}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>
                    {markPaid.isPending ? 'Saving…' : 'Mark Full Payment'}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPaymentSheetVisible(true)}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
                >
                  <Ionicons name="cash-outline" size={18} color={colors.brand.primary} />
                  <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600', marginLeft: 6 }}>
                    Record Partial
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* Payment history */}
        <ThemedText variant="label" color="muted" style={styles.sectionLabel}>PAYMENT HISTORY</ThemedText>

        {isLoading ? (
          <Card style={styles.card}><SkeletonRow lines={3} /></Card>
        ) : txs.length === 0 ? (
          <EmptyState title="No payments yet" description="Payment transactions will appear here once recorded." />
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {txs.map((tx: any) => (
              <Card key={tx.id} style={styles.card}>
                <View style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: Colors.semantic.success + '18' }]}>
                    <Ionicons name="cash" size={18} color={Colors.semantic.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={{ fontWeight: '700', color: Colors.semantic.success }}>
                      + {formatAmount(Number(tx.amount))}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {format(new Date(tx.paid_at), 'd MMM yyyy, HH:mm')} · {tx.staff?.full_name ?? 'Staff'}
                    </ThemedText>
                    {tx.note && (
                      <ThemedText variant="bodySm" color="secondary" style={{ marginTop: 2 }}>
                        {tx.note}
                      </ThemedText>
                    )}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>

      {/* Record Payment Sheet */}
      <BottomSheet
        visible={paymentSheetVisible}
        onClose={() => { setPaymentSheetVisible(false); setAmountInput(''); setNoteInput(''); setAmountError(''); }}
        title="Record Payment"
        snapHeight={400}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: Spacing.md }}>
            <View>
              <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>
                AMOUNT {balance > 0 ? `(outstanding: ${formatAmount(balance)})` : ''}
              </ThemedText>
              <TextInput
                value={amountInput}
                onChangeText={v => { setAmountInput(v); setAmountError(''); }}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={[
                  styles.amountInput,
                  Typography.h2,
                  {
                    color: colors.textPrimary,
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: amountError ? Colors.semantic.error : colors.border,
                  },
                ]}
              />
              {amountError ? (
                <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: 4 }}>
                  {amountError}
                </ThemedText>
              ) : null}
            </View>

            <View>
              <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>NOTE (OPTIONAL)</ThemedText>
              <TextInput
                value={noteInput}
                onChangeText={setNoteInput}
                placeholder="e.g. Cash, bank transfer ref…"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.noteInput,
                  { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
                maxLength={200}
              />
            </View>

            <TouchableOpacity
              onPress={handleRecordPayment}
              disabled={recordPayment.isPending}
              style={[styles.recordBtn, { backgroundColor: colors.brand.primary, opacity: recordPayment.isPending ? 0.7 : 1 }]}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700', marginLeft: Spacing.sm }}>
                {recordPayment.isPending ? 'Saving…' : 'Record Payment'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function BackHeader({ student_name, colors }: { student_name?: string; colors: any }) {
  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
      </TouchableOpacity>
      <ThemedText variant="h4" style={{ flex: 1, marginLeft: Spacing.sm }} numberOfLines={1}>
        {student_name ?? 'Student Finance'}
      </ThemedText>
    </View>
  );
}

function formatAmount(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  card: { marginBottom: Spacing.sm },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  feeIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.sm },
  sectionLabel: { marginTop: Spacing.sm, marginBottom: Spacing.sm },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  amountInput: { borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, textAlign: 'center' },
  noteInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 14 },
  recordBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
});
