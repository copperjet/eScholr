import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibraryBooks, useLibraryCollections, type BookFilters } from '../../../hooks/useLibrary';
import type { LibraryBook, LibraryCollection } from '../../../types/database';
import {
  SearchBar, FAB, EmptyState, ErrorState,
  FilterChipRow, ListItem, Skeleton, ScreenHeader,
} from '../../../components/ui';
import { Spacing, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

// ── CSV helpers ───────────────────────────────────────────────

function escapeCSV(v: any): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function generateCSV(books: LibraryBook[], genres: LibraryCollection[]): string {
  const headers = [
    'Title', 'Author', 'ISBN', 'Publisher', 'Year',
    'Collection', 'Genre', 'Accession Number', 'Barcode', 'Copy Status', 'Notes',
  ];
  const rows: string[] = [headers.join(',')];

  for (const book of books) {
    const genreName = genres.find((g) => g.id === book.genre_id)?.name ?? '';
    const copies = book.copies ?? [];
    if (copies.length === 0) {
      rows.push([
        escapeCSV(book.title), escapeCSV(book.author), escapeCSV(book.isbn),
        escapeCSV(book.publisher), escapeCSV(book.publish_year),
        escapeCSV(book.collection_name), escapeCSV(genreName),
        '', '', '', escapeCSV(book.notes),
      ].join(','));
    } else {
      for (const copy of copies) {
        rows.push([
          escapeCSV(book.title), escapeCSV(book.author), escapeCSV(book.isbn),
          escapeCSV(book.publisher), escapeCSV(book.publish_year),
          escapeCSV(book.collection_name), escapeCSV(genreName),
          escapeCSV(copy.accession_number), escapeCSV(copy.barcode),
          escapeCSV(copy.status), escapeCSV(book.notes),
        ].join(','));
      }
    }
  }

  return '﻿' + rows.join('\r\n'); // BOM + CRLF — Excel-safe
}

const STATUS_OPTIONS: Array<{ key: string; label: string; color: string }> = [
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
  const [collectionFilter, setCollectionFilter] = useState<string | undefined>(undefined);
  const [genreFilter, setGenreFilter] = useState<string | undefined>(undefined);

  const filters: BookFilters = {
    search: search.length >= 2 ? search : undefined,
    collectionId: collectionFilter,
    genreId: genreFilter,
  };

  const { data: books, isLoading, isError, refetch, isFetching } = useLibraryBooks(schoolId, filters);
  const { data: collections } = useLibraryCollections(schoolId, 'collection');
  const { data: genres } = useLibraryCollections(schoolId, 'genre');

  const [exporting, setExporting] = useState(false);

  const collectionLabels = ['All Collections', ...(collections ?? []).map((c) => c.name)];
  const genreLabels = ['All Genres', ...(genres ?? []).map((g) => g.name)];

  const handleExport = useCallback(async () => {
    const list = books ?? [];
    if (!list.length) {
      if (Platform.OS === 'web') {
        window.alert('No books in current view to export.');
      } else {
        Alert.alert('Nothing to Export', 'No books in current view.');
      }
      return;
    }
    setExporting(true);
    try {
      const csv = generateCSV(list, genres ?? []);
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const filename = `library-catalog-${date}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const FileSystem = require('expo-file-system');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Sharing = require('expo-sharing');
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Library Catalog',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Saved', `Catalog saved to:\n${path}`);
        }
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Export failed.');
      } else {
        Alert.alert('Export Failed', e.message ?? 'Could not export catalog.');
      }
    } finally {
      setExporting(false);
    }
  }, [books, genres]);

  const statusBadge = useCallback((book: any) => {
    const copies = book.copies ?? [];
    const avail = copies.filter((c: any) => c.status === 'available').length;
    const total = copies.length;
    const status = avail > 0 ? 'available' : total > 0 ? 'checked_out' : 'lost';
    const meta = STATUS_OPTIONS.find((s) => s.key === status);
    return meta ? { label: `${avail}/${total} avail`, preset: status === 'available' ? 'success' : status === 'checked_out' ? 'warning' : 'error' } : undefined;
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.base }}>
            <Pressable onPress={handleExport} hitSlop={8} disabled={exporting || isLoading}>
              {exporting
                ? <ActivityIndicator size="small" color={colors.brand.primary} />
                : <Ionicons name="download-outline" size={24} color={(exporting || isLoading) ? colors.textMuted : colors.brand.primary} />}
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/(librarian)/scan' as any)} hitSlop={8}>
              <Ionicons name="barcode-outline" size={24} color={colors.brand.primary} />
            </Pressable>
          </View>
        }
      />

      <View style={{ paddingHorizontal: Spacing.screen }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search title, author, ISBN, accession number..."
        />
      </View>

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

      {/* Genre filter */}
      {(genres ?? []).length > 0 && (
        <FilterChipRow
          options={genreLabels}
          selected={
            genreFilter
              ? (genres ?? []).find((g) => g.id === genreFilter)?.name ?? 'All Genres'
              : 'All Genres'
          }
          onSelect={(label) => {
            if (label === 'All Genres') {
              setGenreFilter(undefined);
            } else {
              const match = (genres ?? []).find((g) => g.name === label);
              setGenreFilter(match?.id);
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
                subtitle={book.author ?? undefined}
                caption={book.collection_name ?? undefined}
                badge={statusBadge(book)}
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
