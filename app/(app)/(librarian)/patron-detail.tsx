import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { usePatronLoans } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, ListItem, EmptyState, Card, Skeleton,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function PatronDetailScreen() {
  const { colors } = useTheme();
  const { patronId, patronType, patronName } = useLocalSearchParams<{
    patronId: string; patronType: 'staff' | 'student'; patronName: string;
  }>();

  const { data: loans, isLoading, refetch, isFetching } = usePatronLoans(
    patronId ?? null,
    (patronType as 'staff' | 'student') ?? 'student',
  );

  const activeLoans = (loans ?? []).filter((l) => l.status === 'active' || l.status === 'overdue');
  const pastLoans = (loans ?? []).filter((l) => l.status !== 'active' && l.status !== 'overdue');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={patronName ?? 'Patron'} subtitle={patronType === 'staff' ? 'Staff' : 'Student'} showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* Summary card */}
        <Card style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <ThemedText variant="caption" color="muted">Active Loans</ThemedText>
              <ThemedText variant="h2">{activeLoans.length}</ThemedText>
            </View>
            <View>
              <ThemedText variant="caption" color="muted">Total Loans</ThemedText>
              <ThemedText variant="h2">{(loans ?? []).length}</ThemedText>
            </View>
          </View>
        </Card>

        {isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={56} style={{ marginBottom: Spacing.sm, borderRadius: 12 }} />)}
          </View>
        ) : (loans ?? []).length === 0 ? (
          <EmptyState title="No loan history" description="This patron hasn't borrowed any books." />
        ) : (
          <>
            {activeLoans.length > 0 && (
              <View>
                <ThemedText variant="label" style={styles.sectionLabel}>Active Loans</ThemedText>
                {activeLoans.map((tx) => {
                  const overdue = tx.status === 'overdue' || new Date(tx.due_date) < new Date();
                  return (
                    <ListItem
                      key={tx.id}
                      title={tx.book_title ?? '—'}
                      subtitle={`Due: ${format(new Date(tx.due_date), 'dd MMM yyyy')}${overdue ? ' · OVERDUE' : ''}`}
                      leading={<Ionicons name={overdue ? 'alert-circle' : 'book'} size={20} color={overdue ? Colors.semantic.error : Colors.semantic.warning} />}
                      showChevron
                      onPress={() => router.push({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: tx.book_id } })}
                    />
                  );
                })}
              </View>
            )}

            {pastLoans.length > 0 && (
              <View>
                <ThemedText variant="label" style={styles.sectionLabel}>Past Loans</ThemedText>
                {pastLoans.map((tx) => (
                  <ListItem
                    key={tx.id}
                    title={tx.book_title ?? '—'}
                    subtitle={`Out: ${format(new Date(tx.checked_out_at), 'dd MMM')} → ${tx.checked_in_at ? format(new Date(tx.checked_in_at), 'dd MMM yyyy') : '—'}`}
                    leading={<Ionicons name="checkmark-circle" size={20} color={Colors.semantic.success} />}
                    onPress={() => router.push({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: tx.book_id } })}
                  />
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  card:         { marginHorizontal: Spacing.screen, marginTop: Spacing.base, padding: Spacing.base, borderRadius: Radius.lg },
  sectionLabel: { paddingHorizontal: Spacing.screen, marginTop: Spacing.lg, marginBottom: Spacing.xs },
});
