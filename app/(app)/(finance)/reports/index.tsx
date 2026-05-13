import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, Linking, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import { supabase } from '../../../../lib/supabase';
import {
  ThemedText, ScreenHeader, StatCard, Badge,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../../constants/Typography';
import { Colors } from '../../../../constants/Colors';
import { haptics } from '../../../../lib/haptics';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ReportTab = 'collections' | 'aging' | 'by_category' | 'by_grade';

interface CollectionRow {
  id: string;
  student_name: string;
  student_number: string;
  grade_name: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'cancelled';
  due_date: string | null;
  semester_name: string;
}

interface AgingBucket {
  student_name: string;
  student_number: string;
  grade_name: string;
  current: number;   // not yet due
  days30: number;    // 1-30 days overdue
  days60: number;    // 31-60
  days90: number;    // 61-90
  over90: number;    // 90+
  total: number;
}

interface ByCategoryRow {
  category_name: string;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  invoice_count: number;
}

interface ByGradeRow {
  grade_name: string;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  student_count: number;
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useSemesters(schoolId: string) {
  return useQuery<{ id: string; name: string; is_active: boolean }[]>({
    queryKey: ['semesters', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('semesters').select('id, name, is_active')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCollectionsReport(schoolId: string, semesterId: string | null) {
  return useQuery<CollectionRow[]>({
    queryKey: ['report-collections', schoolId, semesterId],
    enabled: !!schoolId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select(`
          id, invoice_number, total_amount, paid_amount, balance, status, due_date,
          students(full_name, student_number, grades(name)),
          semesters(name)
        `)
        .eq('school_id', schoolId)
        .eq('semester_id', semesterId)
        .neq('status', 'cancelled')
        .order('balance', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id:             r.id,
        student_name:   r.students?.full_name ?? '—',
        student_number: r.students?.student_number ?? '—',
        grade_name:     r.students?.grades?.name ?? '—',
        invoice_number: r.invoice_number,
        total_amount:   Number(r.total_amount),
        paid_amount:    Number(r.paid_amount),
        balance:        Number(r.balance),
        status:         r.status,
        due_date:       r.due_date,
        semester_name:  r.semesters?.name ?? '—',
      })) as CollectionRow[];
    },
  });
}

function useAgingReport(schoolId: string, semesterId: string | null) {
  return useQuery<AgingBucket[]>({
    queryKey: ['report-aging', schoolId, semesterId],
    enabled: !!schoolId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('balance, due_date, students(full_name, student_number, grades(name))')
        .eq('school_id', schoolId)
        .eq('semester_id', semesterId)
        .in('status', ['unpaid', 'partial'])
        .gt('balance', 0);
      if (error) throw error;

      const byStudent: Record<string, AgingBucket> = {};
      for (const r of (data ?? []) as any[]) {
        const key = r.students?.student_number ?? r.students?.full_name ?? 'unknown';
        if (!byStudent[key]) {
          byStudent[key] = {
            student_name:   r.students?.full_name ?? '—',
            student_number: r.students?.student_number ?? '—',
            grade_name:     r.students?.grades?.name ?? '—',
            current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0,
          };
        }
        const bal = Number(r.balance);
        byStudent[key].total += bal;
        if (!r.due_date) { byStudent[key].current += bal; continue; }
        const due = new Date(r.due_date);
        const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
        if (daysOverdue <= 0)       byStudent[key].current += bal;
        else if (daysOverdue <= 30) byStudent[key].days30  += bal;
        else if (daysOverdue <= 60) byStudent[key].days60  += bal;
        else if (daysOverdue <= 90) byStudent[key].days90  += bal;
        else                        byStudent[key].over90  += bal;
      }
      return Object.values(byStudent).sort((a, b) => b.total - a.total);
    },
  });
}

function useByCategoryReport(schoolId: string, semesterId: string | null) {
  return useQuery<ByCategoryRow[]>({
    queryKey: ['report-by-category', schoolId, semesterId],
    enabled: !!schoolId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('invoice_items')
        .select('amount, invoices!inner(school_id, semester_id, paid_amount, balance, status), fee_categories(name)')
        .eq('invoices.school_id', schoolId)
        .eq('invoices.semester_id', semesterId)
        .neq('invoices.status', 'cancelled');
      if (error) throw error;

      const byCategory: Record<string, ByCategoryRow> = {};
      for (const r of (data ?? []) as any[]) {
        const cat = r.fee_categories?.name ?? 'Other';
        if (!byCategory[cat]) byCategory[cat] = { category_name: cat, total_invoiced: 0, total_paid: 0, total_outstanding: 0, invoice_count: 0 };
        const amt = Number(r.amount);
        byCategory[cat].total_invoiced += amt;
        byCategory[cat].invoice_count  += 1;
      }
      // Get actual paid/outstanding from invoice level — simplified: use invoice totals approach
      return Object.values(byCategory).sort((a, b) => b.total_invoiced - a.total_invoiced);
    },
  });
}

function useByGradeReport(schoolId: string, semesterId: string | null) {
  return useQuery<ByGradeRow[]>({
    queryKey: ['report-by-grade', schoolId, semesterId],
    enabled: !!schoolId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('total_amount, paid_amount, balance, student_id, students(grades(name))')
        .eq('school_id', schoolId)
        .eq('semester_id', semesterId)
        .neq('status', 'cancelled');
      if (error) throw error;

      const byGrade: Record<string, ByGradeRow> = {};
      const seenStudents: Record<string, Set<string>> = {};
      for (const r of (data ?? []) as any[]) {
        const grade = r.students?.grades?.name ?? 'No Grade';
        if (!byGrade[grade]) { byGrade[grade] = { grade_name: grade, total_invoiced: 0, total_paid: 0, total_outstanding: 0, student_count: 0 }; seenStudents[grade] = new Set(); }
        byGrade[grade].total_invoiced   += Number(r.total_amount);
        byGrade[grade].total_paid       += Number(r.paid_amount);
        byGrade[grade].total_outstanding += Number(r.balance);
        seenStudents[grade].add(r.student_id);
        byGrade[grade].student_count = seenStudents[grade].size;
      }
      return Object.values(byGrade).sort((a, b) => b.total_outstanding - a.total_outstanding);
    },
  });
}

// ─── CSV helpers ───────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: unknown[]) { return cells.map(esc).join(','); }

function collectionsToCSV(rows: CollectionRow[]): string {
  const header = csvRow(['InvoiceNumber', 'StudentNumber', 'StudentName', 'Grade', 'TotalAmount', 'PaidAmount', 'Balance', 'Status', 'DueDate', 'Semester']);
  const lines = rows.map((r) => csvRow([r.invoice_number, r.student_number, r.student_name, r.grade_name, r.total_amount.toFixed(2), r.paid_amount.toFixed(2), r.balance.toFixed(2), r.status, r.due_date ?? '', r.semester_name]));
  return [header, ...lines].join('\n');
}

function agingToCSV(rows: AgingBucket[]): string {
  const header = csvRow(['StudentNumber', 'StudentName', 'Grade', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total']);
  const lines = rows.map((r) => csvRow([r.student_number, r.student_name, r.grade_name, r.current.toFixed(2), r.days30.toFixed(2), r.days60.toFixed(2), r.days90.toFixed(2), r.over90.toFixed(2), r.total.toFixed(2)]));
  return [header, ...lines].join('\n');
}

function categoryToCSV(rows: ByCategoryRow[]): string {
  const header = csvRow(['Category', 'TotalInvoiced', 'InvoiceCount']);
  const lines = rows.map((r) => csvRow([r.category_name, r.total_invoiced.toFixed(2), r.invoice_count]));
  return [header, ...lines].join('\n');
}

function gradeToCSV(rows: ByGradeRow[]): string {
  const header = csvRow(['Grade', 'Students', 'TotalInvoiced', 'TotalPaid', 'Outstanding']);
  const lines = rows.map((r) => csvRow([r.grade_name, r.student_count, r.total_invoiced.toFixed(2), r.total_paid.toFixed(2), r.total_outstanding.toFixed(2)]));
  return [header, ...lines].join('\n');
}

async function shareCSV(csv: string, filename: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return;
  }
  try {
    await Share.share({ message: csv, title: filename });
  } catch {
    // dismissed
  }
}

// ─── Screen ────────────────────────────────────────────────────────────────────

const TABS: { key: ReportTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'collections', label: 'Collections',  icon: 'list-outline'      },
  { key: 'aging',       label: 'Aging',         icon: 'time-outline'      },
  { key: 'by_category', label: 'By Category',   icon: 'pricetag-outline'  },
  { key: 'by_grade',    label: 'By Grade',      icon: 'school-outline'    },
];

function fmtK(v: number) {
  if (v >= 1000000) return `K${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `K${(v/1000).toFixed(1)}k`;
  return `K${v.toFixed(2)}`;
}

export default function FinanceReportsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [tab, setTab]             = useState<ReportTab>('collections');
  const [semesterId, setSemesterId] = useState<string | null>(null);

  const semesters = useSemesters(schoolId);
  const activeSemId = semesterId ?? semesters.data?.find((s) => s.is_active)?.id ?? semesters.data?.[0]?.id ?? null;

  const collections = useCollectionsReport(schoolId, activeSemId);
  const aging       = useAgingReport(schoolId, activeSemId);
  const byCategory  = useByCategoryReport(schoolId, activeSemId);
  const byGrade     = useByGradeReport(schoolId, activeSemId);

  const activeQuery = tab === 'collections' ? collections : tab === 'aging' ? aging : tab === 'by_category' ? byCategory : byGrade;

  function handleRefresh() { activeQuery.refetch(); }

  // Summary for collections tab
  const collSummary = useMemo(() => {
    const rows = collections.data ?? [];
    return {
      total:       rows.reduce((s, r) => s + r.total_amount, 0),
      paid:        rows.reduce((s, r) => s + r.paid_amount, 0),
      outstanding: rows.reduce((s, r) => s + r.balance, 0),
      paidCount:   rows.filter((r) => r.status === 'paid').length,
      total_count: rows.length,
    };
  }, [collections.data]);

  function handleExport() {
    const semName = semesters.data?.find((s) => s.id === activeSemId)?.name ?? 'export';
    switch (tab) {
      case 'collections': shareCSV(collectionsToCSV(collections.data ?? []), `collections_${semName}.csv`); break;
      case 'aging':       shareCSV(agingToCSV(aging.data ?? []),             `aging_${semName}.csv`); break;
      case 'by_category': shareCSV(categoryToCSV(byCategory.data ?? []),     `by_category_${semName}.csv`); break;
      case 'by_grade':    shareCSV(gradeToCSV(byGrade.data ?? []),           `by_grade_${semName}.csv`); break;
    }
  }

  const semesterName = semesters.data?.find((s) => s.id === activeSemId)?.name ?? '—';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Finance Reports"
        showBack
        rightElement={
          <Pressable
            onPress={handleExport}
            style={[styles.exportBtn, { backgroundColor: colors.brand.primary }]}
            disabled={activeQuery.isLoading || !activeQuery.data?.length}
          >
            <Ionicons name="download-outline" size={15} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 4 }}>CSV</ThemedText>
          </Pressable>
        }
      />

      {/* ── Semester picker ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.semesterRow}
        style={{ maxHeight: 46, flexGrow: 0 }}
      >
        {(semesters.data ?? []).map((s) => {
          const active = activeSemId === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => { haptics.selection(); setSemesterId(s.id); }}
              style={[
                styles.semChip,
                { borderColor: active ? colors.brand.primary : colors.border, backgroundColor: active ? colors.brand.primarySoft : colors.surface },
              ]}
            >
              <ThemedText variant="caption" style={{ fontWeight: '600', color: active ? colors.brand.primary : colors.textSecondary }}>
                {s.name}{s.is_active ? ' ●' : ''}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Summary banner (collections only) ── */}
      {tab === 'collections' && !collections.isLoading && (collections.data ?? []).length > 0 && (
        <View style={styles.summaryRow}>
          <StatCard label="Invoiced"    value={fmtK(collSummary.total)}       icon="document-text-outline"    iconBg={colors.brand.primarySoft}       iconColor={colors.brand.primary}       style={{ flex: 1 }} />
          <StatCard label="Collected"   value={fmtK(collSummary.paid)}        icon="checkmark-circle-outline" iconBg={Colors.semantic.successLight}    iconColor={Colors.semantic.success}    style={{ flex: 1 }} />
          <StatCard label="Outstanding" value={fmtK(collSummary.outstanding)} icon="alert-circle-outline"     iconBg={Colors.semantic.warningLight}    iconColor={Colors.semantic.warning}    style={{ flex: 1 }} />
        </View>
      )}

      {/* ── Tab bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll} style={{ maxHeight: 44, flexGrow: 0 }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => { haptics.selection(); setTab(t.key); }}
              style={[styles.tab, { borderBottomWidth: active ? 2 : 0, borderBottomColor: colors.brand.primary }]}
            >
              <Ionicons name={t.icon} size={14} color={active ? colors.brand.primary : colors.textMuted} />
              <ThemedText variant="caption" style={{ fontWeight: '600', color: active ? colors.brand.primary : colors.textSecondary, marginLeft: 4 }}>
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 20, paddingHorizontal: Spacing.screen, paddingTop: Spacing.sm }}
        refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={handleRefresh} tintColor={colors.brand.primary} />}
      >
        {activeQuery.isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <ListItemSkeleton key={i} />)
        ) : activeQuery.isError ? (
          <ErrorState title="Could not load report" description="Try again." onRetry={handleRefresh} />
        ) : tab === 'collections' ? (
          <CollectionsTab rows={collections.data ?? []} colors={colors} />
        ) : tab === 'aging' ? (
          <AgingTab rows={aging.data ?? []} colors={colors} />
        ) : tab === 'by_category' ? (
          <ByCategoryTab rows={byCategory.data ?? []} colors={colors} />
        ) : (
          <ByGradeTab rows={byGrade.data ?? []} colors={colors} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Tab sub-components ────────────────────────────────────────────────────────

function CollectionsTab({ rows, colors }: { rows: CollectionRow[]; colors: any }) {
  if (!rows.length) return <EmptyState title="No invoices" description="No invoices for this semester." icon="document-text-outline" />;
  return (
    <View style={{ gap: Spacing.sm }}>
      {rows.map((r) => (
        <View key={r.id} style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText variant="bodySm" style={{ fontWeight: '600' }} numberOfLines={1}>{r.student_name}</ThemedText>
            <ThemedText variant="caption" color="muted">{r.student_number} · {r.grade_name}</ThemedText>
            <ThemedText variant="caption" color="muted">{r.invoice_number}</ThemedText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {r.balance > 0 && (
              <ThemedText style={{ fontWeight: '700', color: Colors.semantic.error, fontSize: 13 }}>
                K{r.balance.toFixed(2)}
              </ThemedText>
            )}
            <Badge
              label={r.status}
              preset={r.status === 'paid' ? 'success' : r.status === 'partial' ? 'warning' : 'error'}
              size="sm"
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function AgingTab({ rows, colors }: { rows: AgingBucket[]; colors: any }) {
  if (!rows.length) return <EmptyState title="No overdue balances" description="All students are current." icon="checkmark-circle-outline" />;
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={[styles.agingHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {['Current', '1-30', '31-60', '61-90', '90+'].map((h) => (
          <ThemedText key={h} variant="caption" style={{ fontWeight: '700', flex: 1, textAlign: 'right', fontSize: 10 }} color="muted">{h}</ThemedText>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.agingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ width: 120 }}>
            <ThemedText variant="caption" style={{ fontWeight: '600' }} numberOfLines={1}>{r.student_name}</ThemedText>
            <ThemedText variant="caption" color="muted" numberOfLines={1}>{r.grade_name}</ThemedText>
          </View>
          {[r.current, r.days30, r.days60, r.days90, r.over90].map((v, j) => (
            <ThemedText key={j} variant="caption" style={{ flex: 1, textAlign: 'right', fontWeight: v > 0 ? '700' : '400', color: j === 0 ? colors.textPrimary : j === 1 ? Colors.semantic.warning : Colors.semantic.error }}>
              {v > 0 ? fmtK(v) : '—'}
            </ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
}

function ByCategoryTab({ rows, colors }: { rows: ByCategoryRow[]; colors: any }) {
  if (!rows.length) return <EmptyState title="No data" description="No invoice items for this semester." icon="pricetag-outline" />;
  const total = rows.reduce((s, r) => s + r.total_invoiced, 0);
  return (
    <View style={{ gap: Spacing.sm }}>
      {rows.map((r, i) => {
        const pct = total > 0 ? (r.total_invoiced / total) * 100 : 0;
        return (
          <View key={i} style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{r.category_name}</ThemedText>
              <ThemedText variant="caption" color="muted">{r.invoice_count} item{r.invoice_count !== 1 ? 's' : ''}</ThemedText>
              <View style={[styles.barBg, { backgroundColor: colors.border }]}>
                <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: colors.brand.primary }]} />
              </View>
            </View>
            <ThemedText variant="bodySm" style={{ fontWeight: '700', color: colors.brand.primary }}>
              {fmtK(r.total_invoiced)}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function ByGradeTab({ rows, colors }: { rows: ByGradeRow[]; colors: any }) {
  if (!rows.length) return <EmptyState title="No data" description="No invoices for this semester." icon="school-outline" />;
  return (
    <View style={{ gap: Spacing.sm }}>
      {rows.map((r, i) => (
        <View key={i} style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{r.grade_name}</ThemedText>
            <ThemedText variant="caption" color="muted">{r.student_count} student{r.student_count !== 1 ? 's' : ''}</ThemedText>
            <ThemedText variant="caption" color="muted">Invoiced: {fmtK(r.total_invoiced)} · Paid: {fmtK(r.total_paid)}</ThemedText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            {r.total_outstanding > 0 ? (
              <ThemedText style={{ fontWeight: '700', color: Colors.semantic.error, fontSize: 13 }}>
                {fmtK(r.total_outstanding)}
              </ThemedText>
            ) : (
              <Ionicons name="checkmark-circle" size={18} color={Colors.semantic.success} />
            )}
            <ThemedText variant="caption" color="muted">outstanding</ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

function fmtK(v: number) {
  if (v >= 1000000) return `K${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `K${(v/1000).toFixed(1)}k`;
  return `K${v.toFixed(2)}`;
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  semesterRow: { paddingHorizontal: Spacing.screen, gap: Spacing.sm, alignItems: 'center', paddingVertical: 6 },
  semChip:     { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  summaryRow:  { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm },
  tabScroll:   { paddingHorizontal: Spacing.screen, gap: Spacing.xs, alignItems: 'center' },
  tab:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8 },
  exportBtn:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  reportRow:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  agingHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, paddingLeft: 132, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.xs },
  agingRow:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.xs },
  barBg:       { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:     { height: 4, borderRadius: 2 },
});
