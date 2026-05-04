import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibraryBook, useBookTransactions, useDeleteBook, useCheckInBook } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, Card, Badge, ListItem, EmptyState,
  ErrorState, Button, SectionHeader, Skeleton,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import Barcode from '../../../components/modules/Barcode';

const STATUS_COLORS: Record<string, string> = {
  available: Colors.semantic.success,
  checked_out: Colors.semantic.warning,
  lost: Colors.semantic.error,
  damaged: '#9333EA',
  reserved: Colors.semantic.info,
};

export default function BookDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: book, isLoading, isError, refetch, isFetching } = useLibraryBook(bookId ?? null);
  const { data: transactions } = useBookTransactions(bookId ?? null);
  const deleteMut = useDeleteBook(schoolId);
  const checkInMut = useCheckInBook(schoolId);

  const handleDelete = () => {
    Alert.alert('Delete Book', `Are you sure you want to delete "${book?.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteMut.mutateAsync(bookId!);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not delete book');
          }
        },
      },
    ]);
  };

  const [returningId, setReturningId] = useState<string | null>(null);

  const handleCheckIn = async (txId: string) => {
    setReturningId(txId);
    try {
      await checkInMut.mutateAsync({
        transactionId: txId,
        bookId: bookId!,
        staffId: user?.staffId ?? '',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Check-in failed');
    } finally {
      setReturningId(null);
    }
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Book Detail" showBack />
        <ErrorState title="Could not load book" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Book Detail"
        showBack
        right={
          <Pressable onPress={() => router.push({ pathname: '/(app)/(librarian)/book-form' as any, params: { bookId } })} hitSlop={8}>
            <Ionicons name="create-outline" size={22} color={colors.brand.primary} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            <Skeleton height={200} style={{ borderRadius: Radius.lg, marginBottom: Spacing.base }} />
          </View>
        ) : book ? (
          <>
            {/* ── Book info card ── */}
            <Card style={styles.card}>
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="h2">{book.title}</ThemedText>
                  {book.author && <ThemedText variant="body" color="muted">{book.author}</ThemedText>}
                </View>
                <Badge
                  label={book.status.replace('_', ' ')}
                  preset={book.status === 'available' ? 'success' : book.status === 'checked_out' ? 'warning' : 'error'}
                />
              </View>

              <View style={styles.metaGrid}>
                {book.isbn && <MetaItem label="ISBN" value={book.isbn} />}
                <MetaItem label="Accession #" value={book.accession_number} />
                {book.publisher && <MetaItem label="Publisher" value={book.publisher} />}
                {book.publish_year && <MetaItem label="Year" value={String(book.publish_year)} />}
                <MetaItem label="Total Copies" value={String(book.total_copies)} />
                <MetaItem label="Available" value={String(book.available_copies)} />
                {book.collection_name && <MetaItem label="Collection" value={book.collection_name} />}
              </View>

              {book.notes && (
                <View style={{ marginTop: Spacing.base }}>
                  <ThemedText variant="bodySm" color="muted">{book.notes}</ThemedText>
                </View>
              )}
            </Card>

            {/* ── Barcode ── */}
            {book.barcode && (
              <Card style={styles.card}>
                <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>Barcode</ThemedText>
                <View style={{ alignItems: 'center' }}>
                  <Barcode value={book.barcode} height={60} />
                  <ThemedText variant="mono" style={{ marginTop: Spacing.xs }}>{book.barcode}</ThemedText>
                </View>
              </Card>
            )}

            {/* ── Actions ── */}
            <View style={styles.actions}>
              {book.status === 'available' && (
                <Button
                  label="Check Out"
                  onPress={() => router.push({ pathname: '/(app)/(librarian)/checkout' as any, params: { bookId: book.id } })}
                  style={{ flex: 1 }}
                />
              )}
              <Button
                label="Delete"
                variant="danger"
                onPress={handleDelete}
                disabled={(transactions ?? []).some((t) => t.status === 'active' || t.status === 'overdue')}
                style={{ flex: 1 }}
              />
            </View>
            {(transactions ?? []).some((t) => t.status === 'active' || t.status === 'overdue') && (
              <ThemedText variant="caption" style={{ color: Colors.semantic.error, textAlign: 'center', marginTop: Spacing.xs, paddingHorizontal: Spacing.screen }}>
                Cannot delete — book has active loans. Return all copies first.
              </ThemedText>
            )}

            {/* ── Transaction history ── */}
            <SectionHeader title="Loan History" />
            {(transactions ?? []).length === 0 ? (
              <EmptyState title="No loan history" description="This book hasn't been checked out yet." />
            ) : (
              (transactions ?? []).map((tx) => (
                <ListItem
                  key={tx.id}
                  title={tx.borrower_name ?? '—'}
                  subtitle={`Out: ${format(new Date(tx.checked_out_at), 'dd MMM yyyy')} · Due: ${format(new Date(tx.due_date), 'dd MMM yyyy')}`}
                  caption={tx.checked_in_at ? `Returned ${format(new Date(tx.checked_in_at), 'dd MMM yyyy')}` : undefined}
                  badge={
                    tx.status === 'active'
                      ? { label: 'Active', preset: 'warning' }
                      : tx.status === 'returned'
                        ? { label: 'Returned', preset: 'success' }
                        : { label: tx.status, preset: 'error' }
                  }
                  trailing={
                    (tx.status === 'active' || tx.status === 'overdue') ? (
                      <Button label="Return" variant="tonal" size="sm" onPress={() => handleCheckIn(tx.id)} loading={returningId === tx.id} disabled={returningId !== null} />
                    ) : undefined
                  }
                />
              ))
            )}

            <View style={{ height: 48 }} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
      <ThemedText variant="bodySm">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  card:    { marginHorizontal: Spacing.screen, marginTop: Spacing.base, padding: Spacing.base, borderRadius: Radius.lg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.base, gap: Spacing.base },
  metaItem: { minWidth: '40%' },
  actions:  { flexDirection: 'row', paddingHorizontal: Spacing.screen, marginTop: Spacing.base, gap: Spacing.sm },
});
