/**
 * Finance Pending Reports
 * Shows reports held at `finance_pending` status. Finance officer can clear them to `approved`.
 */
import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Avatar, Badge, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { useFinancePendingReports, useClearFinanceReport } from '../../../hooks/useFinance';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

export default function FinanceReportsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: reports = [], isLoading, isError, refetch } = useFinancePendingReports(schoolId);
  const clearMutation = useClearFinanceReport(schoolId);

  const handleClear = useCallback((report: any) => {
    const name = report.students?.full_name ?? 'student';
    Alert.alert(
      'Clear Finance Hold',
      `Mark ${name}'s report as finance-cleared? It will move to Approved status and can be released to parents.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            haptics.medium();
            try {
              await clearMutation.mutateAsync(report.id);
              haptics.success();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not clear this report. Try again.');
            }
          },
        },
      ],
    );
  }, [clearMutation]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load reports" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Finance Pending" showBack />

      {/* Summary banner */}
      {!isLoading && reports.length > 0 && (
        <View style={[styles.banner, { backgroundColor: Colors.semantic.warning + '18', borderColor: Colors.semantic.warning + '40' }]}>
          <Ionicons name="time-outline" size={16} color={Colors.semantic.warning} />
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.warning, marginLeft: 6 }}>
            {reports.length} report{reports.length !== 1 ? 's' : ''} awaiting finance clearance
          </ThemedText>
        </View>
      )}

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="30%" height={11} />
              </View>
              <Skeleton width={80} height={32} radius={Radius.lg} />
            </View>
          ))}
        </View>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No pending reports"
          description="All reports have been finance-cleared."
          icon="checkmark-circle-outline"
        />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r: any) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: report }: { item: any }) => (
            <View style={[styles.reportRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Avatar
                name={report.students?.full_name ?? '?'}
                photoUrl={report.students?.photo_url ?? null}
                size={42}
              />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {report.students?.full_name ?? '—'}
                </ThemedText>
                <ThemedText variant="caption" color="muted">
                  {report.students?.streams?.grades?.name ?? ''}{' '}
                  {report.students?.streams?.name ?? ''} ·{' '}
                  {report.semesters?.name ?? ''}
                </ThemedText>
                <ThemedText variant="caption" color="muted">
                  Held since {format(parseISO(report.updated_at), 'dd MMM yyyy')}
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={() => handleClear(report)}
                disabled={clearMutation.isPending}
                style={[styles.clearBtn, { backgroundColor: Colors.semantic.success }]}
              >
                <Ionicons name="checkmark" size={14} color="#fff" />
                <ThemedText variant="caption" style={{ color: '#fff', fontWeight: '700', marginLeft: 3 }}>
                  Clear
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
});
