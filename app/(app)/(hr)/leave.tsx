import React from 'react';
import { View, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  Badge, Button, ListItem, Skeleton, EmptyState, ErrorState,
  SectionHeader, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { useLeaveRequests } from '../../../hooks/useLeave';

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d; }
}

type ListRow =
  | { type: 'header'; label: string }
  | { type: 'item'; req: any; section: 'pending' | 'history' };

export default function HRLeave() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: requests, isLoading, isError, refetch, isRefetching } = useLeaveRequests(schoolId);

  const pending = (requests ?? []).filter((r: any) => r.status === 'pending');
  const history = (requests ?? []).filter((r: any) => r.status !== 'pending');

  const rows: ListRow[] = [];
  rows.push({ type: 'header', label: `Pending (${pending.length})` });
  if (pending.length === 0) rows.push({ type: 'header', label: '__empty_pending' });
  pending.forEach((r: any) => rows.push({ type: 'item', req: r, section: 'pending' }));
  rows.push({ type: 'header', label: 'History' });
  if (history.length === 0) rows.push({ type: 'header', label: '__empty_history' });
  history.forEach((r: any) => rows.push({ type: 'item', req: r, section: 'history' }));

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load leave requests" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Leave Requests"
        right={
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button label="Balances" variant="ghost" size="sm"
              onPress={() => router.push('/(app)/(hr)/leave-balances' as any)} />
            <Button label="Request" size="sm"
              onPress={() => router.push('/(app)/(hr)/leave-request' as any)} />
          </View>
        }
      />

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skRow}>
              <Skeleton width={42} height={42} radius={21} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="35%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FastList
          data={rows}
          keyExtractor={(row: any) => row.type === 'header' ? `hdr-${row.label}` : row.req.id}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: row }: { item: ListRow }) => {
            if (row.type === 'header') {
              if (row.label === '__empty_pending') {
                return <EmptyState title="No pending requests" description="All caught up!" icon="checkmark-circle-outline" />;
              }
              if (row.label === '__empty_history') {
                return <EmptyState title="No history" description="Approved/rejected requests appear here." />;
              }
              return <SectionHeader title={row.label} />;
            }
            const { req, section } = row;
            const isPending = section === 'pending';
            const subtitle = `${req.leave_type ?? '—'} · ${fmtDate(req.start_date)} – ${fmtDate(req.end_date)}`;
            return (
              <ListItem
                title={req.staff?.full_name ?? 'Staff'}
                subtitle={subtitle}
                avatarName={req.staff?.full_name ?? 'S'}
                separator
                trailing={
                  <Badge
                    label={isPending ? 'Pending' : req.status}
                    preset={req.status === 'approved' ? 'success' : req.status === 'pending' ? 'warning' : 'neutral'}
                  />
                }
                onPress={isPending
                  ? () => router.push({ pathname: '/(app)/(hr)/leave-approve' as any, params: { id: req.id } })
                  : undefined}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1 },
  skRow: { flexDirection: 'row', alignItems: 'center' },
});
