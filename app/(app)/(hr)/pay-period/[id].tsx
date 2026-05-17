import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Button, Badge,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../../components/ui';
import {
  usePayPeriods,
  useLockPayPeriod,
  useReopenPayPeriod,
  useExportPayrollCsv,
  useValidatePayPeriod,
  type PayPeriod,
} from '../../../../hooks/usePayroll';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../../constants/Typography';
import { Colors } from '../../../../constants/Colors';
import { haptics } from '../../../../lib/haptics';

type Tab = 'overview' | 'hours' | 'adjustments' | 'preview' | 'export';
const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'overview',     label: 'Overview',     icon: 'information-circle-outline' },
  { key: 'hours',        label: 'Hours',         icon: 'time-outline'              },
  { key: 'adjustments',  label: 'Adjustments',   icon: 'add-circle-outline'        },
  { key: 'preview',      label: 'Preview',       icon: 'eye-outline'               },
  { key: 'export',       label: 'Export',        icon: 'cloud-upload-outline'      },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

export default function PayPeriodDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? '';

  const [tab, setTab] = useState<Tab>('overview');

  const { data: periods = [], isLoading } = usePayPeriods(schoolId);
  const period = periods.find((p) => p.id === id);

  const lock     = useLockPayPeriod(schoolId);
  const reopen   = useReopenPayPeriod(schoolId);
  const doExport = useExportPayrollCsv(schoolId);

  const validate = useValidatePayPeriod(schoolId, id ?? '');

  function handleLock() {
    Alert.alert(
      'Lock Pay Period',
      `Lock "${period?.period_label}"? No further changes can be made until reopened.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock', onPress: () => { haptics.medium(); lock.mutate({ periodId: id!, staffId }); } },
      ],
    );
  }

  function handleReopen() {
    Alert.alert(
      'Reopen Pay Period',
      'Reopen this period for editing?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', onPress: () => { haptics.medium(); reopen.mutate(id!); } },
      ],
    );
  }

  function handleExport() {
    const issues = validate.data ?? [];
    if (issues.length > 0) {
      Alert.alert(
        'Validation Issues',
        `${issues.length} staff member${issues.length !== 1 ? 's' : ''} have missing data:\n\n${issues.slice(0, 5).map((i) => `• ${i.staff_name}: ${i.issues.join(', ')}`).join('\n')}${issues.length > 5 ? `\n…and ${issues.length - 5} more` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Export Anyway',
            onPress: () => runExport(),
          },
        ],
      );
      return;
    }
    runExport();
  }

  function runExport() {
    doExport.mutate(
      { periodId: id!, staffId },
      {
        onSuccess: (result) => {
          haptics.success();
          Alert.alert(
            'Export Complete',
            `${result.staff_count} staff exported.`,
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

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Pay Period" showBack />
        <View style={{ padding: Spacing.screen, gap: Spacing.sm }}>
          {Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (!period) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Pay Period" showBack />
        <ErrorState title="Period not found" description="This pay period no longer exists." onRetry={() => router.back()} />
      </SafeAreaView>
    );
  }

  const isOpen     = period.status === 'open';
  const isLocked   = period.status === 'locked';
  const isExported = period.status === 'exported';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={period.period_label}
        showBack
        rightElement={
          <Badge
            label={period.status}
            preset={isOpen ? 'info' : isLocked ? 'warning' : 'success'}
          />
        }
      />

      {/* ── Period info strip ── */}
      <View style={[styles.infoStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.infoItem}>
          <ThemedText variant="caption" color="muted">Start</ThemedText>
          <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{fmtDate(period.start_date)}</ThemedText>
        </View>
        <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
        <View style={styles.infoItem}>
          <ThemedText variant="caption" color="muted">End</ThemedText>
          <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{fmtDate(period.end_date)}</ThemedText>
        </View>
        {period.locked_at && (
          <>
            <View style={[styles.infoSep, { backgroundColor: colors.border }]} />
            <View style={styles.infoItem}>
              <ThemedText variant="caption" color="muted">Locked</ThemedText>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{fmtDate(period.locked_at)}</ThemedText>
            </View>
          </>
        )}
      </View>

      {/* ── Tab bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
        style={{ maxHeight: 46, flexGrow: 0 }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => { haptics.selection(); setTab(t.key); }}
              style={[
                styles.tab,
                { borderColor: active ? colors.brand.primary : colors.border, backgroundColor: active ? colors.brand.primarySoft : colors.surface },
              ]}
            >
              <Ionicons name={t.icon} size={13} color={active ? colors.brand.primary : colors.textMuted} />
              <ThemedText variant="caption" style={{ fontWeight: '600', color: active ? colors.brand.primary : colors.textSecondary, marginLeft: 4 }}>
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Tab content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT, paddingTop: Spacing.md, gap: Spacing.md }}
      >
        {tab === 'overview' && (
          <OverviewTab
            period={period}
            onLock={handleLock}
            onReopen={handleReopen}
            isLockPending={lock.isPending}
            isReopenPending={reopen.isPending}
            colors={colors}
          />
        )}
        {tab === 'hours' && (
          <HoursTabLink periodId={id!} isLocked={isLocked || isExported} colors={colors} />
        )}
        {tab === 'adjustments' && (
          <AdjustmentsTabLink periodId={id!} isLocked={isLocked || isExported} colors={colors} />
        )}
        {tab === 'preview' && (
          <PreviewTabLink periodId={id!} schoolId={schoolId} colors={colors} />
        )}
        {tab === 'export' && (
          <ExportTab
            period={period}
            onExport={handleExport}
            isExporting={doExport.isPending}
            validationIssues={validate.data ?? []}
            colors={colors}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-tab components ─────────────────────────────────────────────────────────

function OverviewTab({ period, onLock, onReopen, isLockPending, isReopenPending, colors }: any) {
  return (
    <View style={{ gap: Spacing.md }}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, gap: Spacing.sm }]}>
        <InfoRow label="Period Label" value={period.period_label} />
        <InfoRow label="Start Date"   value={fmtDate(period.start_date)} />
        <InfoRow label="End Date"     value={fmtDate(period.end_date)} />
        <InfoRow label="Status"       value={period.status} />
        {period.locked_at  && <InfoRow label="Locked At"   value={fmtDate(period.locked_at)} />}
        {period.exported_at && <InfoRow label="Exported At" value={fmtDate(period.exported_at)} />}
        {period.export_url  && (
          <Pressable onPress={() => Linking.openURL(period.export_url!)} style={styles.linkRow}>
            <Ionicons name="download-outline" size={16} color={colors.brand.primary} />
            <ThemedText variant="bodySm" style={{ color: colors.brand.primary, marginLeft: 6 }}>Download Last Export</ThemedText>
          </Pressable>
        )}
      </View>
      {period.status === 'open' && (
        <Button label={isLockPending ? 'Locking…' : 'Lock Period'} variant="secondary" fullWidth loading={isLockPending} onPress={onLock}
          iconLeft={<Ionicons name="lock-closed-outline" size={17} color={colors.textPrimary} />}
        />
      )}
      {period.status === 'locked' && (
        <Button label={isReopenPending ? 'Reopening…' : 'Reopen for Editing'} variant="secondary" fullWidth loading={isReopenPending} onPress={onReopen}
          iconLeft={<Ionicons name="lock-open-outline" size={17} color={colors.textPrimary} />}
        />
      )}
    </View>
  );
}

function HoursTabLink({ periodId, isLocked, colors }: { periodId: string; isLocked: boolean; colors: any }) {
  return (
    <View style={{ gap: Spacing.md }}>
      <ThemedText variant="body" color="secondary">
        Enter hours worked and overtime for hourly staff this period.
        {isLocked ? ' (Period is locked — read-only.)' : ''}
      </ThemedText>
      <Button
        label="Open Hours Entry"
        variant="primary"
        fullWidth
        onPress={() => router.push({ pathname: '/(app)/(hr)/pay-period/[id]/hours', params: { id: periodId } } as any)}
        iconLeft={<Ionicons name="time-outline" size={17} color="#fff" />}
      />
    </View>
  );
}

function AdjustmentsTabLink({ periodId, isLocked, colors }: { periodId: string; isLocked: boolean; colors: any }) {
  return (
    <View style={{ gap: Spacing.md }}>
      <ThemedText variant="body" color="secondary">
        Add bonuses, deductions, advances, and reimbursements for this period.
        {isLocked ? ' (Period is locked — read-only.)' : ''}
      </ThemedText>
      <Button
        label="Open Adjustments"
        variant="primary"
        fullWidth
        onPress={() => router.push({ pathname: '/(app)/(hr)/pay-period/[id]/adjustments', params: { id: periodId } } as any)}
        iconLeft={<Ionicons name="add-circle-outline" size={17} color="#fff" />}
      />
    </View>
  );
}

function PreviewTabLink({ periodId, schoolId, colors }: { periodId: string; schoolId: string; colors: any }) {
  return (
    <View style={{ gap: Spacing.md }}>
      <ThemedText variant="body" color="secondary">
        Review gross pay per staff member before exporting to Sage.
      </ThemedText>
      <Button
        label="Open Preview"
        variant="primary"
        fullWidth
        onPress={() => router.push({ pathname: '/(app)/(hr)/pay-period/[id]/preview', params: { id: periodId } } as any)}
        iconLeft={<Ionicons name="eye-outline" size={17} color="#fff" />}
      />
    </View>
  );
}

function ExportTab({ period, onExport, isExporting, validationIssues, colors }: any) {
  const isReady = period.status === 'locked' || period.status === 'exported';
  return (
    <View style={{ gap: Spacing.md }}>
      {!isReady && (
        <View style={[styles.warnBanner, { backgroundColor: Colors.semantic.warningLight, borderColor: Colors.semantic.warning + '40' }]}>
          <Ionicons name="warning-outline" size={16} color={Colors.semantic.warning} />
          <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: 6, color: Colors.semantic.warning }}>
            Lock the period before exporting to prevent last-minute changes.
          </ThemedText>
        </View>
      )}
      {validationIssues.length > 0 && (
        <View style={[styles.warnBanner, { backgroundColor: Colors.semantic.errorLight, borderColor: Colors.semantic.error + '40' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.semantic.error} />
          <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: 6, color: Colors.semantic.error }}>
            {validationIssues.length} staff have missing bank details or tax ID.
          </ThemedText>
        </View>
      )}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, gap: Spacing.sm }]}>
        <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>What gets exported</ThemedText>
        <ThemedText variant="caption" color="secondary">• Staff code, name, period label</ThemedText>
        <ThemedText variant="caption" color="secondary">• Base salary / hourly rate × hours</ThemedText>
        <ThemedText variant="caption" color="secondary">• Stipends + bonuses − deductions</ThemedText>
        <ThemedText variant="caption" color="secondary">• Bank details + Tax ID (for Sage Payroll import)</ThemedText>
        <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
          Net pay, PAYE, NAPSA, NHIMA — computed by Sage, not eScholr.
        </ThemedText>
      </View>
      <Button
        label={isExporting ? 'Exporting…' : 'Export Payroll CSV'}
        variant="primary"
        fullWidth
        loading={isExporting}
        onPress={onExport}
        iconLeft={<Ionicons name="cloud-upload-outline" size={17} color="#fff" />}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
      <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  infoStrip:  { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.md },
  infoItem:   { flex: 1, alignItems: 'center', gap: 2 },
  infoSep:    { width: StyleSheet.hairlineWidth },
  tabScroll:  { paddingHorizontal: Spacing.screen, gap: Spacing.sm, alignItems: 'center', paddingVertical: 8 },
  tab:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  card:       { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.md, overflow: 'hidden' },
  warnBanner: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  linkRow:    { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.sm },
});
