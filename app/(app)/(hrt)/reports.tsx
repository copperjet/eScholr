/**
 * HRT Reports Overview
 * Lists all student reports for the HRT's class.
 * Pipeline status visual + marks-complete warning.
 * Tap row → approve screen.
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Avatar, Badge, FAB, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  useHRTStreamReports, useMarksCompletionForStream,
  STATUS_META, type ReportStatus,
} from '../../../hooks/useReports';
import { ReportStatusPipeline } from '../../../components/modules/ReportStatusPipeline';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const FILTER_TABS: Array<'all' | ReportStatus> = ['all', 'draft', 'pending_approval', 'approved', 'released'];
const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  draft: 'Draft',
  pending_approval: 'Pending',
  approved: 'Approved',
  released: 'Released',
};

export default function HRTReportsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [activeFilter, setActiveFilter] = useState<'all' | ReportStatus>('all');

  const { data, isLoading, isError, refetch } = useHRTStreamReports(
    user?.staffId ?? null,
    user?.schoolId ?? '',
  );

  const { data: marksCompletion } = useMarksCompletionForStream(
    data?.streamId ?? null,
    data?.semesterId ?? null,
    user?.schoolId ?? '',
  );

  const incompleteSubjects = (marksCompletion ?? []).filter((s) => s.entered < s.total);

  const reports = data?.reports ?? [];
  const filtered = activeFilter === 'all'
    ? reports
    : reports.filter((r) => r.status === activeFilter);

  const draftCount = reports.filter((r) => r.status === 'draft').length;
  const releasedCount = reports.filter((r) => r.status === 'released').length;

  const counts = reports.reduce<Partial<Record<ReportStatus, number>>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load reports" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Report Cards"
        subtitle={`${data?.streamName ?? '—'} · ${releasedCount}/${reports.length} released`}
        showBack
      />

      {/* Pipeline */}
      {!isLoading && reports.length > 0 && (
        <ReportStatusPipeline counts={counts} financeGateEnabled={false} />
      )}

      {/* Incomplete marks warning */}
      {incompleteSubjects.length > 0 && (
        <View style={[styles.warnBanner, { backgroundColor: Colors.semantic.warningLight }]}>
          <Ionicons name="alert-circle" size={14} color={Colors.semantic.warning} />
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: 8, flex: 1 }}>
            {incompleteSubjects.length} subject{incompleteSubjects.length !== 1 ? 's' : ''} still have missing marks. Approval blocked until complete.
          </ThemedText>
        </View>
      )}

      {/* Filter tabs */}
      {!isLoading && reports.length > 0 && (
        <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
          {FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveFilter(tab)}
              style={[
                styles.filterTab,
                activeFilter === tab && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{
                  fontWeight: activeFilter === tab ? '700' : '500',
                  color: activeFilter === tab ? colors.brand.primary : colors.textMuted,
                }}
              >
                {FILTER_LABELS[tab]}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 6 }).map((_, i) => (
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
      ) : filtered.length === 0 ? (
        <EmptyState
          title={activeFilter === 'all' ? 'No reports yet' : `No ${FILTER_LABELS[activeFilter].toLowerCase()} reports`}
          description="Reports appear once generated for the active semester."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: report }) => {
            const meta = STATUS_META[report.status] ?? STATUS_META.draft;
            const canApprove = report.status === 'draft' && incompleteSubjects.length === 0;
            return (
              <TouchableOpacity
                onPress={() => {
                  haptics.selection();
                  router.push({
                    pathname: '/(app)/(hrt)/reports-approve' as any,
                    params: { reportId: report.id },
                  });
                }}
                activeOpacity={0.8}
                style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Avatar name={report.student.full_name} photoUrl={report.student.photo_url} size={40} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>{report.student.full_name}</ThemedText>
                  {report.overall_percentage !== null ? (
                    <ThemedText variant="caption" color="muted">
                      {report.overall_percentage.toFixed(1)}%
                      {report.class_position ? ` · #${report.class_position}` : ''}
                    </ThemedText>
                  ) : (
                    <ThemedText variant="caption" color="muted">{report.student.student_number}</ThemedText>
                  )}
                  {report.status === 'draft' && !report.hrt_comment && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <Ionicons name="alert-circle-outline" size={11} color={Colors.semantic.warning} />
                      <ThemedText variant="caption" style={{ color: Colors.semantic.warning, fontSize: 10 }}>
                        Comment required
                      </ThemedText>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge label={meta.label} preset={meta.preset} />
                  {canApprove && (
                    <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 10, fontWeight: '700' }}>
                      REVIEW →
                    </ThemedText>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {draftCount > 0 && incompleteSubjects.length === 0 && (
        <FAB
          icon={<Ionicons name="send-outline" size={20} color="#fff" />}
          label={`${draftCount} ready to submit`}
          onPress={() => {
            haptics.selection();
            const firstDraft = reports.find((r) => r.status === 'draft');
            if (firstDraft) {
              router.push({
                pathname: '/(app)/(hrt)/reports-approve' as any,
                params: { reportId: firstDraft.id },
              });
            }
          }}
          color={colors.brand.primary}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
});
