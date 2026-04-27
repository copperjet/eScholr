/**
 * Admin Reports Overview
 * School-wide view: pipeline counts + per-report list.
 * Approve pending + bulk release approved reports.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Avatar, Badge, BottomSheet, Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import {
  useAdminReports, useAdminReportCounts, useAdminApproveReport, useReleaseReports,
  useReportAuditLog,
  STATUS_META, type ReportStatus, type ReportSummary,
} from '../../../hooks/useReports';
import { ReportStatusPipeline } from '../../../components/modules/ReportStatusPipeline';
import { format } from 'date-fns';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const FILTER_TABS: Array<ReportStatus | 'all'> = ['all', 'pending_approval', 'approved', 'finance_pending', 'released'];
const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  pending_approval: 'Pending',
  approved: 'Approved',
  finance_pending: 'Finance',
  released: 'Released',
};

export default function AdminReportsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [activeTab, setActiveTab] = useState<ReportStatus | 'all'>('pending_approval');
  const [sheetReport, setSheetReport] = useState<ReportSummary | null>(null);

  const { data: reports = [], isLoading, isError, refetch } = useAdminReports(schoolId, activeTab);
  const { data: counts = {} as Partial<Record<ReportStatus, number>> } = useAdminReportCounts(schoolId);
  const approveMutation = useAdminApproveReport(schoolId);
  const releaseMutation = useReleaseReports(schoolId);
  const { data: auditLog = [], isLoading: auditLoading } = useReportAuditLog(sheetReport?.id ?? null, schoolId, sheetReport?.student.id);

  const handleApprove = useCallback(async (report: ReportSummary) => {
    haptics.medium();
    try {
      await approveMutation.mutateAsync({ reportId: report.id, staffId: user!.staffId! });
      haptics.success();
      setSheetReport(null);
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not approve. Try again.');
    }
  }, [approveMutation, user]);

  const handleBulkRelease = useCallback(async () => {
    const approvedReports = (reports as ReportSummary[]).filter(
      (r) => r.status === 'approved' || r.status === 'finance_pending',
    );
    if (approvedReports.length === 0) return;
    const semesterId = approvedReports[0].semester?.id;
    if (!semesterId) return;

    Alert.alert(
      'Bulk Release',
      `Release ${approvedReports.length} approved report${approvedReports.length !== 1 ? 's' : ''} to parents?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          onPress: async () => {
            haptics.medium();
            try {
              await releaseMutation.mutateAsync({
                student_ids: approvedReports.map((r) => r.student.id),
                semester_id: semesterId,
              });
              haptics.success();
              Alert.alert('Released', `${approvedReports.length} reports sent to parents.`);
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not release reports. Try again.');
            }
          },
        },
      ],
    );
  }, [reports, releaseMutation]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load reports" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const approvedCount = (counts['approved'] ?? 0) + (counts['finance_pending'] ?? 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Reports"
        showBack
        right={
          approvedCount > 0 ? (
            <TouchableOpacity
              onPress={handleBulkRelease}
              disabled={releaseMutation.isPending}
              style={[styles.releaseBtn, { backgroundColor: colors.brand.primary }]}
            >
              <Ionicons name="send" size={13} color="#fff" />
              <ThemedText variant="label" style={{ color: '#fff', marginLeft: 4, fontSize: 11 }}>
                RELEASE {approvedCount}
              </ThemedText>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Pipeline */}
      <ReportStatusPipeline counts={counts} financeGateEnabled={false} />

      {/* Filter tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tab,
              activeTab === tab && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 },
            ]}
          >
            <ThemedText
              variant="caption"
              style={{
                fontWeight: activeTab === tab ? '700' : '500',
                color: activeTab === tab ? colors.brand.primary : colors.textMuted,
                fontSize: 11,
              }}
            >
              {FILTER_LABELS[tab]}{counts[tab as ReportStatus] ? ` (${counts[tab as ReportStatus]})` : ''}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="30%" height={11} />
              </View>
              <Skeleton width={70} height={24} radius={Radius.full} />
            </View>
          ))}
        </View>
      ) : reports.length === 0 ? (
        <EmptyState
          title={`No ${FILTER_LABELS[activeTab]?.toLowerCase() ?? ''} reports`}
          description="No reports in this status."
        />
      ) : (
        <FastList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: report }) => {
            const meta = STATUS_META[report.status] ?? STATUS_META.draft;
            return (
              <TouchableOpacity
                onPress={() => { haptics.selection(); setSheetReport(report); }}
                activeOpacity={0.8}
                style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Avatar name={report.student.full_name} photoUrl={report.student.photo_url} size={40} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>{report.student.full_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {report.semester?.name ?? '—'}
                    {report.overall_percentage !== null ? ` · ${report.overall_percentage.toFixed(1)}%` : ''}
                    {report.class_position ? ` · #${report.class_position}` : ''}
                  </ThemedText>
                </View>
                <Badge label={meta.label} preset={meta.preset} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Report action sheet */}
      <BottomSheet
        visible={!!sheetReport}
        onClose={() => setSheetReport(null)}
        title={sheetReport?.student.full_name ?? 'Report'}
        snapHeight={560}
      >
        {sheetReport && (
          <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: Spacing.base, paddingBottom: Spacing.xl }}>

            {/* Approval audit trail */}
            {(auditLoading || auditLog.length > 0) && (
              <View style={{ gap: Spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
                  <ThemedText variant="label" color="muted" style={{ fontSize: 10, letterSpacing: 0.6 }}>APPROVAL HISTORY</ThemedText>
                </View>
                {auditLoading ? (
                  <View style={{ gap: 6 }}>
                    {[0, 1].map(i => (
                      <View key={i} style={[styles.auditRow, { backgroundColor: colors.surfaceSecondary }]}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={{ width: '45%', height: 11, backgroundColor: colors.border, borderRadius: 4 }} />
                          <View style={{ width: '25%', height: 9, backgroundColor: colors.border, borderRadius: 4 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    {auditLog.map(entry => (
                      <View key={entry.id} style={[styles.auditRow, { backgroundColor: colors.surfaceSecondary }]}>
                        <View style={[styles.auditDot, { backgroundColor:
                          entry.event_type === 'report_released' ? Colors.semantic.success :
                          entry.event_type === 'report_approved' ? Colors.semantic.info :
                          colors.brand.primary }]} />
                        <View style={{ flex: 1 }}>
                          <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>
                            {entry.event_type === 'report_released' ? 'Released to parent' :
                             entry.event_type === 'report_approved' ? 'Approved' :
                             entry.event_type.replace(/_/g, ' ')}
                          </ThemedText>
                          <ThemedText variant="caption" color="muted">
                            {entry.actor_name ?? 'System'} · {format(new Date(entry.created_at), 'd MMM, HH:mm')}
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            <View style={[styles.statRow, { backgroundColor: colors.surfaceSecondary, borderRadius: Radius.md }]}>
              <View style={styles.statItem}>
                <ThemedText variant="h3" style={{ color: colors.brand.primary }}>
                  {sheetReport.overall_percentage !== null
                    ? `${sheetReport.overall_percentage.toFixed(1)}%`
                    : '—'}
                </ThemedText>
                <ThemedText variant="caption" color="muted">Average</ThemedText>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <ThemedText variant="h3" style={{ color: colors.brand.primary }}>
                  {sheetReport.class_position !== null ? `#${sheetReport.class_position}` : '—'}
                </ThemedText>
                <ThemedText variant="caption" color="muted">Position</ThemedText>
              </View>
            </View>

            {sheetReport.hrt_comment ? (
              <View style={[styles.commentBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <ThemedText variant="label" color="muted" style={{ marginBottom: 4, fontSize: 10 }}>HRT COMMENT</ThemedText>
                <ThemedText variant="bodySm">{sheetReport.hrt_comment}</ThemedText>
              </View>
            ) : (
              <View style={[styles.commentBox, { backgroundColor: Colors.semantic.warningLight, borderColor: Colors.semantic.warning + '40' }]}>
                <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning }}>⚠ No HRT comment</ThemedText>
              </View>
            )}

            <View style={{ gap: Spacing.sm }}>
              {sheetReport.status === 'pending_approval' && (
                <TouchableOpacity
                  onPress={() => handleApprove(sheetReport)}
                  disabled={approveMutation.isPending}
                  style={[styles.actionBtn, { backgroundColor: Colors.semantic.success }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                    {approveMutation.isPending ? 'Approving…' : 'Approve Report'}
                  </ThemedText>
                </TouchableOpacity>
              )}
              {(sheetReport.status === 'approved' || sheetReport.status === 'finance_pending') && (
                <TouchableOpacity
                  onPress={async () => {
                    if (!sheetReport.semester?.id) return;
                    haptics.medium();
                    try {
                      await releaseMutation.mutateAsync({
                        student_ids: [sheetReport.student.id],
                        semester_id: sheetReport.semester.id,
                      });
                      haptics.success();
                      setSheetReport(null);
                    } catch {
                      haptics.error();
                    }
                  }}
                  disabled={releaseMutation.isPending}
                  style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}
                >
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                    {releaseMutation.isPending ? 'Releasing…' : 'Release to Parent'}
                  </ThemedText>
                </TouchableOpacity>
              )}
              {sheetReport.pdf_url && (
                <TouchableOpacity
                  onPress={() => {
                    setSheetReport(null);
                    router.push({
                      pathname: '/(app)/report-viewer' as any,
                      params: {
                        report_id: sheetReport.id,
                        pdf_url: sheetReport.pdf_url!,
                        student_name: sheetReport.student.full_name,
                        is_draft: sheetReport.status !== 'released' ? 'true' : 'false',
                      },
                    });
                  }}
                  style={[styles.outlineBtn, { borderColor: colors.brand.primary }]}
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.brand.primary} />
                  <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600', marginLeft: 6 }}>
                    View PDF
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
          </ScrollView>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  releaseBtn: {
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: Radius.full,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  statRow: { flexDirection: 'row', padding: Spacing.base },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  commentBox: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
});
