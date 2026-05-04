import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibraryBooks } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, ListItem, EmptyState, ErrorState, Skeleton,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';

export default function CollectionDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { collectionId, collectionName } = useLocalSearchParams<{ collectionId: string; collectionName: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: books, isLoading, isError, refetch, isFetching } = useLibraryBooks(schoolId, {
    collectionId: collectionId ?? undefined,
  });

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title={collectionName ?? 'Collection'} showBack />
        <ErrorState title="Could not load books" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={collectionName ?? 'Collection'} subtitle={`${(books ?? []).length} books`} showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={56} style={{ marginBottom: Spacing.sm, borderRadius: 12 }} />)}
          </View>
        ) : (books ?? []).length === 0 ? (
          <EmptyState title="No books in this collection" description="Add books and assign them to this collection." />
        ) : (
          (books ?? []).map((book) => (
            <ListItem
              key={book.id}
              title={book.title}
              subtitle={[book.author, book.accession_number].filter(Boolean).join(' · ')}
              badge={{ label: book.status.replace('_', ' '), preset: book.status === 'available' ? 'success' : book.status === 'checked_out' ? 'warning' : 'error' }}
              showChevron
              onPress={() => router.push({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: book.id } })}
            />
          ))
        )}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
