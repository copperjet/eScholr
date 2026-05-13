import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl, Pressable,
  Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, StatCard, Badge, Button,
  EmptyState, ErrorState, ListItemSkeleton, FastList, BottomSheet,
} from '../../../components/ui';
import {
  useSageSyncCounts,
  useSageSyncQueue,
  useFinanceExports,
  useRetrySageSync,
  useRetryAllFailed,
  useSkipSageRow,
  useGenerateCsvExport,
  type SageSyncRow,
  type SageSyncStatus,
} from '../../../hooks/useSageSync';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const STATUS_TABS: { key: SageSyncStatus | null; label: string }[] = [
  { key: null,       label: 'All'     },
  { key: 'pending',  label: 'Pending' },
  { key: 'failed',   label: 'Failed'  },
  { key: 'sent_csv', label: 'Sent'    },
  { key: 'skipped',  label: 'Skipped' },
];

function statusPreset(status: SageSyncStatus): 'warning' | 'error' | 'success' | 'info' | 'default' {
  switch (status) {
    case 'pending':  return 'warning';
    case 'failed':   return 'error';
    case 'sent_csv':
    case 'sent_api': return 'success';
    case 'skipped':  return 'default';
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function QueueRow({
  row, onRetry, onSkip, onPress,
}: {
  row: SageSyncRow;
  onRetry: () => void;
  onSkip: () => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.queueRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }, Shadow.sm]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <ThemedText variant="bodySm" style={{ fontWeight: '600' }} numberOfLines={1}>
            {row.event_type.replace(/_/g, ' ')}
          </ThemedText>
          <Badge label={row.status.replace(/_/g, ' ')} preset={statusPreset(row.status)} size="sm" />
        </View>
        <ThemedText variant="caption" color="muted" numberOfLines={1}>
          {row.entity_table} · {row.entity_id.slice(0, 8)}…
        </ThemedText>
        {row.last_error ? (
          <ThemedText variant="caption" style={{ color: Colors.semantic.error }} numberOfLines={2}>
            {row.last_error}
          </ThemedText>
        ) : null}
        <ThemedText variant="caption" color="muted">
          {fmtDate(row.created_at)} · attempt {row.attempts}
        </ThemedText>
      </View>
      <View style={{ gap: Spacing.xs }}>
        {(row.status === 'failed' || row.status === 'pending') && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); haptics.light(); onRetry(); }}
            style={[styles.rowBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name="refresh" size={12} color="#fff" />
          </Pressable>
        )}
        {row.status !== 'skipped' && row.status !== 'sent_csv' && row.status !== 'sent_api' && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); haptics.light(); onSkip(); }}
            style={[styles.rowBtn, { backgroundColor: colors.border }]}
          >
            <Ionicons name="close" size={12} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export default function SageSyncScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? '';

  const [activeTab, setActiveTab] = useState<SageSyncStatus | null>(null);
  const [detailRow, setDetailRow]   = useState<SageSyncRow | null>(null);
  const [exportSheet, setExportSheet] = useState(false);

  const counts     = useSageSyncCounts(schoolId);
  const queue      = useSageSyncQueue(schoolId, activeTab);
  const exports    = useFinanceExports(schoolId);
  const retry      = useRetrySageSync(schoolId);
  const retryAll   = useRetryAllFailed(schoolId);
  const skip       = useSkipSageRow(schoolId);
  const genCsv     = useGenerateCsvExport(schoolId);

  const rows = queue.data ?? [];
  const isRefreshing = queue.isRefetching || counts.isRefetching;

  function handleRefresh() {
    queue.refetch();
    counts.refetch();
    exports.refetch();
  }

  function handleRetryAll() {
    if (!counts.data?.failed) return;
    Alert.alert(
      'Retry All Failed',
      `Reset ${counts.data.failed} failed row${counts.data.failed !== 1 ? 's' : ''} to pending?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry All', onPress: () => { haptics.medium(); retryAll.mutate(); } },
      ],
    );
  }

  function handleGenerateCsv() {
    setExportSheet(false);
    genCsv.mutate(
      { staffId },
      {
        onSuccess: (result) => {
          haptics.success();
          Alert.alert(
            'CSV Ready',
            `${result.rows} row${result.rows !== 1 ? 's' : ''} exported.`,
            [
              { text: 'Open File', onPress: () => Linking.openURL(result.file_url) },
              { text: 'OK' },
            ],
          );
        },
        onError: (err: any) => {
          haptics.error();
          Alert.alert('Export Failed', err?.message ?? 'Unknown error.');
        },
      },
    );
  }

  if (queue.isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Sage Sync" showBack />
        <ErrorState title="Could not load queue" description="Check connection and try again." onRetry={handleRefresh} />
      </SafeAreaView>
    );
  }

  const c = counts.data;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Sage Sync"
        showBack
        rightElement={
          <Pressable
            onPress={() => setExportSheet(true)}
            style={[styles.exportBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 4 }}>Export CSV</ThemedText>
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />}
        stickyHeaderIndices={[1]}
      >
        {/* ── Stat cards ── */}
        <View style={styles.statsRow}>
          <StatCard label="Pending"  value={String(c?.pending  ?? '—')} icon="time-outline"         iconBg={Colors.semantic.warningLight}  iconColor={Colors.semantic.warning} style={{ flex: 1 }} />
          <StatCard label="Failed"   value={String(c?.failed   ?? '—')} icon="close-circle-outline" iconBg={Colors.semantic.errorLight}    iconColor={Colors.semantic.error}   style={{ flex: 1 }} />
          <StatCard label="Sent CSV" value={String(c?.sent_csv ?? '—')} icon="checkmark-circle-outline" iconBg={Colors.semantic.successLight} iconColor={Colors.semantic.success} style={{ flex: 1 }} />
        </View>

        {/* ── Retry-all banner ── */}
        {(c?.failed ?? 0) > 0 && (
          <View style={[styles.failBanner, { backgroundColor: Colors.semantic.errorLight, borderColor: Colors.semantic.error + '40', marginHorizontal: Spacing.screen }]}>
            <Ionicons name="warning-outline" size={16} color={Colors.semantic.error} />
            <ThemedText variant="bodySm" style={{ flex: 1, color: Colors.semantic.error, marginLeft: 6 }}>
              {c!.failed} row{c!.failed !== 1 ? 's' : ''} failed — need attention
            </ThemedText>
            <Pressable
              onPress={handleRetryAll}
              disabled={retryAll.isPending}
              style={[styles.retryAllBtn, { borderColor: Colors.semantic.error }]}
            >
              <ThemedText variant="caption" style={{ color: Colors.semantic.error, fontWeight: '700' }}>
                {retryAll.isPending ? 'Resetting…' : 'Retry All'}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* ── Tab bar ── */}
        <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {STATUS_TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <Pressable
                  key={String(t.key)}
                  onPress={() => { haptics.selection(); setActiveTab(t.key); }}
                  style={[
                    styles.tab,
                    { borderColor: active ? colors.brand.primary : colors.border, backgroundColor: active ? colors.brand.primarySoft : colors.surface },
                  ]}
                >
                  <ThemedText variant="caption" style={{ fontWeight: '600', color: active ? colors.brand.primary : colors.textSecondary }}>
                    {t.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Queue list ── */}
        {queue.isLoading ? (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm, marginTop: Spacing.sm }}>
            {Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)}
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No queue rows"
            description={activeTab ? `No ${activeTab} rows.` : 'Nothing in the sync queue.'}
            icon="checkmark-circle-outline"
          />
        ) : (
          <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm, marginTop: Spacing.sm }}>
            {rows.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                onRetry={() => retry.mutate(row.id)}
                onSkip={() => {
                  Alert.alert('Skip Row', 'Mark this row as skipped? It will not be exported.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Skip', style: 'destructive', onPress: () => skip.mutate(row.id) },
                  ]);
                }}
                onPress={() => setDetailRow(row)}
              />
            ))}
          </View>
        )}

        {/* ── Recent exports ── */}
        {!exports.isLoading && (exports.data ?? []).length > 0 && (
          <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing['2xl'] }}>
            <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>RECENT EXPORTS</ThemedText>
            <View style={[styles.exportsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {(exports.data ?? []).map((exp, i) => (
                <View
                  key={exp.id}
                  style={[
                    styles.exportRow,
                    i < (exports.data ?? []).length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>
                      {exp.export_type.toUpperCase()} export · {exp.rows_included} rows
                    </ThemedText>
                    <ThemedText variant="caption" color="muted">{fmtDate(exp.created_at)}</ThemedText>
                    {exp.error_message ? (
                      <ThemedText variant="caption" style={{ color: Colors.semantic.error }}>{exp.error_message}</ThemedText>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <Badge label={exp.status} preset={exp.status === 'success' ? 'success' : exp.status === 'partial' ? 'warning' : 'error'} size="sm" />
                    {exp.file_url ? (
                      <Pressable onPress={() => Linking.openURL(exp.file_url!)}>
                        <Ionicons name="download-outline" size={18} color={colors.brand.primary} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Detail sheet ── */}
      <BottomSheet
        visible={!!detailRow}
        onClose={() => setDetailRow(null)}
        title="Queue Row Detail"
        snapHeight={440}
      >
        {detailRow && (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ gap: Spacing.md }}>
              <DetailField label="Event" value={detailRow.event_type} />
              <DetailField label="Entity" value={`${detailRow.entity_table} / ${detailRow.entity_id}`} mono />
              <DetailField label="Status" value={detailRow.status} />
              <DetailField label="Attempts" value={String(detailRow.attempts)} />
              {detailRow.last_error && <DetailField label="Last Error" value={detailRow.last_error} error />}
              <DetailField label="Idempotency Key" value={detailRow.idempotency_key} mono />
              <DetailField label="Created" value={fmtDate(detailRow.created_at)} />
              {detailRow.sent_at && <DetailField label="Sent" value={fmtDate(detailRow.sent_at)} />}
              <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
                {(detailRow.status === 'failed' || detailRow.status === 'pending') && (
                  <Button
                    label="Retry This Row"
                    variant="primary"
                    fullWidth
                    onPress={() => { retry.mutate(detailRow.id); setDetailRow(null); }}
                  />
                )}
                {detailRow.status !== 'skipped' && detailRow.status !== 'sent_csv' && detailRow.status !== 'sent_api' && (
                  <Button
                    label="Skip Row"
                    variant="secondary"
                    fullWidth
                    onPress={() => {
                      setDetailRow(null);
                      Alert.alert('Skip Row', 'Mark this row as skipped?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Skip', style: 'destructive', onPress: () => skip.mutate(detailRow.id) },
                      ]);
                    }}
                  />
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* ── Export sheet ── */}
      <BottomSheet
        visible={exportSheet}
        onClose={() => setExportSheet(false)}
        title="Generate CSV Export"
        snapHeight={340}
      >
        <View style={{ gap: Spacing.md }}>
          <View style={[styles.infoBanner, { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primaryMuted }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.brand.primary} />
            <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: 6, color: colors.brand.primary }}>
              All pending rows will be exported to a Sage-compatible CSV bundle and marked as sent.
            </ThemedText>
          </View>
          <View style={{ gap: Spacing.xs }}>
            <ThemedText variant="bodySm" color="secondary">Pending rows: <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>{c?.pending ?? 0}</ThemedText></ThemedText>
            <ThemedText variant="caption" color="muted">The CSV file will be uploaded to secure storage and a download link provided.</ThemedText>
          </View>
          <Button
            label={genCsv.isPending ? 'Generating…' : `Export ${c?.pending ?? 0} Row${(c?.pending ?? 0) !== 1 ? 's' : ''}`}
            variant="primary"
            fullWidth
            loading={genCsv.isPending}
            disabled={!c?.pending || genCsv.isPending}
            onPress={handleGenerateCsv}
            iconLeft={<Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
          />
          <Button label="Cancel" variant="secondary" fullWidth onPress={() => setExportSheet(false)} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function DetailField({ label, value, mono, error }: { label: string; value: string; mono?: boolean; error?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 3 }}>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
      <ThemedText
        variant="bodySm"
        style={[
          mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
          error && { color: Colors.semantic.error },
          { color: error ? undefined : colors.textPrimary },
        ]}
        selectable
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  statsRow:    { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.screen, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  failBanner:  { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.sm, marginTop: Spacing.xs },
  retryAllBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.md, borderWidth: 1 },
  tabBar:      { paddingVertical: Spacing.sm, zIndex: 10 },
  tabScroll:   { paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  tab:         { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  queueRow:    { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  rowBtn:      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  exportsCard: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  exportRow:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  exportBtn:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  infoBanner:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
});
