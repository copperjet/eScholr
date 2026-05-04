import React, { useState, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibraryTransactions, useCheckInBook, type TransactionFilters } from '../../../hooks/useLibrary';
import type { LibraryTransactionStatus } from '../../../types/database';
import {
  ScreenHeader, FilterChipRow, ListItem, EmptyState, ErrorState,
  Button, Skeleton, FastList,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const STATUS_LABELS = ['All', 'Active', 'Overdue', 'Returned', 'Lost'];
const STATUS_MAP: Record<string, LibraryTransactionStatus | 'all'> = {
  All: 'all', Active: 'active', Overdue: 'overdue', Returned: 'returned', Lost: 'lost',
};
const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_MAP).map(([k, v]) => [v, k])
);

export default function LoansScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [statusFilter, setStatusFilter] = useState<LibraryTransactionStatus | 'all'>('all');
  const filters: TransactionFilters = { status: statusFilter };

  const { data: transactions, isLoading, isError, refetch, isFetching } = useLibraryTransactions(schoolId, filters);
  const checkInMut = useCheckInBook(schoolId);
  const [returningId, setReturningId] = useState<string | null>(null);

  const handleCheckIn = useCallback(async (txId: string, bookId: string) => {
    setReturningId(txId);
    try {
      await checkInMut.mutateAsync({
        transactionId: txId,
        bookId,
        staffId: user?.staffId ?? '',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Check-in failed');
    } finally {
      setReturningId(null);
    }
  }, [checkInMut, user?.staffId]);

  const isOverdue = (dueDate: string, status: string) => {
    return (status === 'active' || status === 'overdue') && new Date(dueDate) < new Date();
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Loans" />
        <ErrorState title="Could not load loans" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const txList = transactions ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Loans"
        subtitle={isLoading ? undefined : `${txList.length} record${txList.length !== 1 ? 's' : ''}`}
      />

      <FilterChipRow
        options={STATUS_LABELS}
        selected={REVERSE_MAP[statusFilter] ?? 'All'}
        onSelect={(label) => setStatusFilter(STATUS_MAP[label] ?? 'all')}
      />

      {isLoading ? (
        <View style={{ padding: Spacing.screen, gap: Spacing.sm }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={60} style={{ borderRadius: 12 }} />)}
        </View>
      ) : txList.length === 0 ? (
        <EmptyState title="No loans found" description="Loans will appear here after books are checked out." />
      ) : (
        <FastList
          data={txList}
          keyExtractor={(tx: any) => tx.id}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: tx }: { item: any }) => {
            const overdue = isOverdue(tx.due_date, tx.status);
            return (
              <ListItem
                title={tx.book_title ?? '—'}
                subtitle={`${tx.borrower_name} · Due: ${format(new Date(tx.due_date), 'dd MMM yyyy')}`}
                caption={
                  tx.checked_in_at
                    ? `Returned ${format(new Date(tx.checked_in_at), 'dd MMM yyyy')}`
                    : overdue
                      ? `${Math.ceil((Date.now() - new Date(tx.due_date).getTime()) / 86400000)}d overdue`
                      : undefined
                }
                leading={
                  <Ionicons
                    name={tx.status === 'returned' ? 'checkmark-circle' : overdue ? 'alert-circle' : 'time'}
                    size={22}
                    color={tx.status === 'returned' ? Colors.semantic.success : overdue ? Colors.semantic.error : Colors.semantic.warning}
                  />
                }
                trailing={
                  (tx.status === 'active' || tx.status === 'overdue') ? (
                    <Button
                      label="Return"
                      variant="tonal"
                      size="sm"
                      onPress={() => handleCheckIn(tx.id, tx.book_id)}
                      loading={returningId === tx.id}
                      disabled={returningId !== null}
                    />
                  ) : undefined
                }
                onPress={() => router.push({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: tx.book_id } })}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
