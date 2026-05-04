import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibraryBooks, useLibraryCollections, type BookFilters } from '../../../hooks/useLibrary';
import {
  SearchBar, FAB, EmptyState, ErrorState,
  FilterChipRow, ListItem, Skeleton, ScreenHeader,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import type { LibraryBookStatus } from '../../../types/database';

const STATUS_OPTIONS: Array<{ key: LibraryBookStatus | 'all'; label: string; color: string }> = [
  { key: 'all',         label: 'All',         color: '#6B7280' },
  { key: 'available',   label: 'Available',   color: Colors.semantic.success },
  { key: 'checked_out', label: 'Checked Out', color: Colors.semantic.warning },
  { key: 'lost',        label: 'Lost',        color: Colors.semantic.error },
  { key: 'damaged',     label: 'Damaged',     color: '#9333EA' },
];

export default function CatalogScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LibraryBookStatus | 'all'>('all');
  const [collectionFilter, setCollectionFilter] = useState<string | undefined>(undefined);

  const filters: BookFilters = {
    search: search.length >= 2 ? search : undefined,
    status: statusFilter,
    collectionId: collectionFilter,
  };

  const { data: books, isLoading, isError, refetch, isFetching } = useLibraryBooks(schoolId, filters);
  const { data: collections } = useLibraryCollections(schoolId);

  const statusLabels = STATUS_OPTIONS.map((s) => s.label);
  const collectionLabels = ['All Collections', ...(collections ?? []).map((c) => c.name)];

  const statusBadge = useCallback((status: string) => {
    const meta = STATUS_OPTIONS.find((s) => s.key === status);
    return meta ? { label: meta.label, preset: status === 'available' ? 'success' : status === 'checked_out' ? 'warning' : 'error' } : undefined;
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load catalog" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Catalog"
        right={
          <Pressable onPress={() => router.push('/(app)/(librarian)/scan' as any)} hitSlop={8}>
            <Ionicons name="barcode-outline" size={24} color={colors.brand.primary} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: Spacing.screen }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search title, author, ISBN, accession..."
        />
      </View>

      {/* Status filter */}
      <FilterChipRow
        options={statusLabels}
        selected={STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label ?? 'All'}
        onSelect={(label) => {
          const match = STATUS_OPTIONS.find((s) => s.label === label);
          setStatusFilter(match?.key ?? 'all');
        }}
      />

      {/* Collection filter */}
      {(collections ?? []).length > 0 && (
        <FilterChipRow
          options={collectionLabels}
          selected={
            collectionFilter
              ? (collections ?? []).find((c) => c.id === collectionFilter)?.name ?? 'All Collections'
              : 'All Collections'
          }
          onSelect={(label) => {
            if (label === 'All Collections') {
              setCollectionFilter(undefined);
            } else {
              const match = (collections ?? []).find((c) => c.name === label);
              setCollectionFilter(match?.id);
            }
          }}
        />
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={60} style={{ marginBottom: Spacing.sm, borderRadius: 12 }} />)}
          </View>
        ) : (books ?? []).length === 0 ? (
          <EmptyState
            title="No books found"
            description={search ? 'Try a different search term.' : 'Tap + to add your first book.'}
          />
        ) : (
          <View style={{ paddingBottom: TAB_BAR_HEIGHT }}>
            {(books ?? []).map((book) => (
              <ListItem
                key={book.id}
                title={book.title}
                subtitle={[book.author, book.accession_number].filter(Boolean).join(' · ')}
                caption={book.collection_name ?? undefined}
                badge={statusBadge(book.status)}
                showChevron
                onPress={() => router.push({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: book.id } })}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <FAB
        icon={<Ionicons name="add" size={26} color="#fff" />}
        label="Add Book"
        onPress={() => router.push('/(app)/(librarian)/book-form' as any)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
