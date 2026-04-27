import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, Badge, StatCard, SectionHeader,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

interface ChildRow {
  id: string; full_name: string; photo_url: string | null;
  student_number: string; stream_id: string;
  grades: { name: string } | null; streams: { name: string } | null;
}

interface InvoiceItem {
  id: string;
  description: string;
  amount: number;
  fee_categories?: { name: string } | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'cancelled';
  pdf_url: string | null;
  invoice_items: InvoiceItem[];
}

interface FeesData {
  semester: { id: string; name: string } | null;
  invoices: Invoice[];
  totalOutstanding: number;
  totalPaid: number;
  totalBilled: number;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-children', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, student_number, stream_id, grades(name), streams(name))')
        .eq('parent_id', parentId!).eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.students).filter(Boolean) as ChildRow[];
    },
  });
}

function useChildFees(child: ChildRow | null, schoolId: string) {
  return useQuery<FeesData>({
    queryKey: ['parent-child-fees', child?.id, schoolId],
    enabled: !!child && !!schoolId,
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const { data: sem } = await (supabase as any)
        .from('semesters').select('id, name')
        .eq('school_id', schoolId).eq('is_active', true).limit(1).single();
      const semesterId = sem?.id;
      if (!semesterId) {
        return { semester: null, invoices: [], totalOutstanding: 0, totalPaid: 0, totalBilled: 0 };
      }
      const { data: invoicesRaw, error } = await (supabase as any)
        .from('invoices')
        .select(`
          id, invoice_number, issue_date, due_date,
          total_amount, paid_amount, balance, status, pdf_url,
          invoice_items(id, description, amount, fee_categories(name))
        `)
        .eq('school_id', schoolId)
        .eq('student_id', child!.id)
        .eq('semester_id', semesterId)
        .order('issue_date', { ascending: false });
      if (error) throw error;
      const invoices: Invoice[] = (invoicesRaw ?? []).map((inv: any) => ({
        ...inv,
        invoice_items: (inv.invoice_items ?? []).map((it: any) => ({
          id: it.id,
          description: it.description,
          amount: it.amount,
          fee_categories: it.fee_categories,
        })),
      }));
      const totalOutstanding = invoices.reduce((s, i) => s + (i.status !== 'paid' && i.status !== 'cancelled' ? Number(i.balance) : 0), 0);
      const totalPaid = invoices.reduce((s, i) => s + Number(i.paid_amount), 0);
      const totalBilled = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
      return { semester: sem, invoices, totalOutstanding, totalPaid, totalBilled };
    },
  });
}

function formatK(v: number) {
  return `K${Math.round(v).toLocaleString()}`;
}

function statusPreset(st: Invoice['status']) {
  switch (st) {
    case 'paid': return 'success';
    case 'partial': return 'warning';
    case 'unpaid': return 'error';
    default: return 'neutral';
  }
}

export default function ParentFees() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: children, isLoading: childrenLoading, isError: childrenError, refetch: refetchChildren } =
    useChildren(user?.parentId ?? null, user?.schoolId ?? '');

  const activeChild = children?.[selectedIdx] ?? null;
  const { data, isLoading, isError, refetch, isRefetching } =
    useChildFees(activeChild, user?.schoolId ?? '');

  if (childrenError || isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load fees" description="Check your connection and try again." onRetry={refetchChildren} />
      </SafeAreaView>
    );
  }

  if (!childrenLoading && (!children || children.length === 0)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <EmptyState title="No children linked" description="Your account is not yet linked to a student. Contact the school front desk." />
      </SafeAreaView>
    );
  }

  const invoices = data?.invoices ?? [];
  const semester = data?.semester;
  const outstanding = data?.totalOutstanding ?? 0;
  const paid = data?.totalPaid ?? 0;
  const billed = data?.totalBilled ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <View>
            <ThemedText variant="caption" color="muted">{semester?.name ?? 'Active Term'}</ThemedText>
            <ThemedText variant="h2">Fees</ThemedText>
          </View>
        </View>

        {/* Child selector chips */}
        {childrenLoading ? (
          <View style={styles.childRow}>
            <View style={[styles.childChip, { backgroundColor: colors.surfaceSecondary }]}>
              <ThemedText>Loading…</ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.childRow}>
            {children!.map((c, i) => {
              const active = i === selectedIdx;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedIdx(i)}
                  style={[styles.childChip, {
                    backgroundColor: active ? colors.brand.primarySoft : colors.surfaceSecondary,
                    borderColor: active ? colors.brand.primary : colors.border,
                  }]}
                >
                  <Avatar name={c.full_name} photoUrl={c.photo_url} size={28} />
                  <ThemedText style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? colors.brand.primary : colors.textPrimary }}>
                    {c.full_name.split(' ')[0]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Summary stats */}
        <View style={styles.statsRow}>
          <StatCard
            label="Billed"
            value={formatK(billed)}
            icon="document-text"
            iconBg={colors.surfaceSecondary}
            iconColor={colors.brand.primary}
            style={styles.statCell}
          />
          <StatCard
            label="Paid"
            value={formatK(paid)}
            icon="checkmark-circle"
            iconBg={Colors.semantic.successLight}
            iconColor={Colors.semantic.success}
            style={styles.statCell}
          />
          <StatCard
            label="Outstanding"
            value={formatK(outstanding)}
            icon="alert-circle"
            iconBg={outstanding > 0 ? Colors.semantic.errorLight : Colors.semantic.successLight}
            iconColor={outstanding > 0 ? Colors.semantic.error : Colors.semantic.success}
            style={styles.statCell}
          />
        </View>

        {/* Bank payment notice */}
        <Card variant="tinted" style={styles.noticeCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brand.primary} />
            <ThemedText variant="caption" color="secondary" style={{ flex: 1 }}>
              Payments are made at the bank. Please quote your child's student number and invoice number.
            </ThemedText>
          </View>
        </Card>

        {/* Invoices list */}
        <SectionHeader title="Invoices" />
        {isLoading ? (
          <View style={{ gap: Spacing.sm }}>
            <ListItemSkeleton />
            <ListItemSkeleton />
          </View>
        ) : invoices.length === 0 ? (
          <EmptyState title="No invoices" description="No fee invoices for this term." icon="document-text-outline" />
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {invoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} colors={colors} />
            ))}
          </View>
        )}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InvoiceCard({ invoice, colors }: { invoice: Invoice; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const status = invoice.status;
  const preset = statusPreset(status);
  const isOverdue = status !== 'paid' && status !== 'cancelled' && invoice.due_date && new Date() > parseISO(invoice.due_date);

  return (
    <Card variant="elevated" style={styles.invoiceCard}>
      {/* Header row */}
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.invoiceHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <ThemedText variant="h4">{invoice.invoice_number}</ThemedText>
            <Badge label={status.toUpperCase()} preset={preset} />
            {isOverdue && <Badge label="OVERDUE" preset="error" />}
          </View>
          <ThemedText variant="caption" color="muted">
            Issued {format(parseISO(invoice.issue_date), 'd MMM yyyy')}
            {invoice.due_date ? ` · Due ${format(parseISO(invoice.due_date), 'd MMM yyyy')}` : ''}
          </ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText variant="h3" style={{ color: status === 'paid' ? Colors.semantic.success : colors.textPrimary }}>
            {formatK(invoice.total_amount)}
          </ThemedText>
          {status !== 'paid' && invoice.balance > 0 && (
            <ThemedText variant="caption" color="muted">Balance {formatK(invoice.balance)}</ThemedText>
          )}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} style={{ marginLeft: Spacing.sm }} />
      </Pressable>

      {/* Expanded line items */}
      {expanded && (
        <View style={[styles.lineItems, { borderTopColor: colors.border }]}>
          {(invoice.invoice_items ?? []).length === 0 ? (
            <ThemedText variant="caption" color="muted">No line items</ThemedText>
          ) : (
            (invoice.invoice_items ?? []).map((it) => (
              <View key={it.id} style={styles.lineRow}>
                <ThemedText variant="bodySm" style={{ flex: 1 }}>
                  {it.fee_categories?.name ?? it.description ?? 'Fee'}
                </ThemedText>
                <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>
                  {formatK(it.amount)}
                </ThemedText>
              </View>
            ))
          )}
          <View style={[styles.lineTotal, { borderTopColor: colors.border }]}>
            <ThemedText variant="body" style={{ fontWeight: '700' }}>Total</ThemedText>
            <ThemedText variant="body" style={{ fontWeight: '700' }}>{formatK(invoice.total_amount)}</ThemedText>
          </View>
          {invoice.paid_amount > 0 && (
            <View style={styles.lineTotal}>
              <ThemedText variant="bodySm" color="muted">Paid</ThemedText>
              <ThemedText variant="bodySm" color="muted">{formatK(invoice.paid_amount)}</ThemedText>
            </View>
          )}
          {invoice.balance > 0 && status !== 'paid' && (
            <View style={styles.lineTotal}>
              <ThemedText variant="body" style={{ fontWeight: '700', color: Colors.semantic.error }}>Balance</ThemedText>
              <ThemedText variant="body" style={{ fontWeight: '700', color: Colors.semantic.error }}>{formatK(invoice.balance)}</ThemedText>
            </View>
          )}
          {invoice.pdf_url && (
            <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
              PDF receipt available
            </ThemedText>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base,
  },
  childRow: {
    flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingBottom: Spacing.base,
  },
  childChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  statCell: { flex: 1 },
  noticeCard: {
    marginHorizontal: Spacing.screen, marginBottom: Spacing.lg, padding: Spacing.md,
  },
  invoiceCard: {
    marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md,
  },
  invoiceHeader: {
    flexDirection: 'row', alignItems: 'center',
  },
  lineItems: {
    marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  lineRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  lineTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
  },
});
