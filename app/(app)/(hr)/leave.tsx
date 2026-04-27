import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Card, Badge, Button, EmptyState, ErrorState, SectionHeader } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { useLeaveRequests } from '../../../hooks/useLeave';

export default function HRLeave() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: requests, isLoading, isError, refetch, isRefetching } = useLeaveRequests(schoolId);

  const pending = (requests ?? []).filter((r: any) => r.status === 'pending');
  const history = (requests ?? []).filter((r: any) => r.status !== 'pending');

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load leave requests" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.header}>
          <ThemedText variant="h4">Leave Requests</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button
              label="Balances"
              variant="ghost"
              onPress={() => router.push('/(app)/(hr)/leave-balances' as any)}
              size="sm"
            />
            <Button
              label="Request Leave"
              onPress={() => router.push('/(app)/(hr)/leave-request' as any)}
              size="sm"
            />
          </View>
        </View>

        {/* Pending */}
        <SectionHeader title={`Pending (${pending.length})`} />
        {isLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : pending.length === 0 ? (
          <EmptyState title="No pending requests" description="All caught up!" icon="checkmark-circle-outline" />
        ) : (
          pending.map((req: any) => (
            <Pressable
              key={req.id}
              onPress={() => router.push({ pathname: '/(app)/(hr)/leave-approve' as any, params: { id: req.id } })}
            >
              <Card style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <ThemedText style={{ fontWeight: '600' }}>{req.staff?.full_name ?? 'Staff'}</ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {req.leave_type} · {req.start_date} to {req.end_date}
                    </ThemedText>
                  </View>
                  <Badge label="Pending" preset="warning" />
                </View>
              </Card>
            </Pressable>
          ))
        )}

        {/* History */}
        <SectionHeader title="History" />
        {history.length === 0 ? (
          <EmptyState title="No history" description="Approved/rejected requests appear here." />
        ) : (
          history.map((req: any) => (
            <Card key={req.id} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md, opacity: 0.8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <ThemedText style={{ fontWeight: '600' }}>{req.staff?.full_name ?? 'Staff'}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {req.leave_type} · {req.start_date} to {req.end_date}
                  </ThemedText>
                </View>
                <Badge
                  label={req.status}
                  preset={req.status === 'approved' ? 'success' : 'neutral'}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
});
