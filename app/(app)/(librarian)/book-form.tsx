import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  useLibraryBook, useCreateBook, useUpdateBook, useLibraryCollections, useLibrarySettings,
} from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, FormField, Button, Card,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function BookFormScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { bookId, scannedIsbn, scannedAccession, accessionCopyIndex } = useLocalSearchParams<{
    bookId?: string;
    scannedIsbn?: string;
    scannedAccession?: string;
    accessionCopyIndex?: string;
  }>();
  const schoolId = user?.schoolId ?? '';
  const isEdit = !!bookId;
  const processedScan = useRef<string | null>(null);

  const { data: existing } = useLibraryBook(bookId ?? null);
  const { data: collections } = useLibraryCollections(schoolId, 'collection');
  const { data: genres } = useLibraryCollections(schoolId, 'genre');
  const { data: settings } = useLibrarySettings(schoolId);
  const createMut = useCreateBook(schoolId);
  const updateMut = useUpdateBook(schoolId);
  const accessionMode = settings?.accession_mode ?? 'auto';

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [genreId, setGenreId] = useState<string>('');
  const [totalCopies, setTotalCopies] = useState('1');
  const [copyAccessions, setCopyAccessions] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [isbnLoading, setIsbnLoading] = useState(false);
  const processedAccessionScan = useRef<string | null>(null);

  useEffect(() => {
    if (existing && isEdit) {
      setTitle(existing.title);
      setAuthor(existing.author ?? '');
      setIsbn(existing.isbn ?? '');
      setPublisher(existing.publisher ?? '');
      setPublishYear(existing.publish_year ? String(existing.publish_year) : '');
      setCollectionId(existing.collection_id ?? '');
      setGenreId(existing.genre_id ?? '');
      setTotalCopies(String(existing.copies?.length ?? 1));
      setNotes(existing.notes ?? '');
    }
  }, [existing, isEdit]);

  useEffect(() => {
    if (scannedIsbn && processedScan.current !== scannedIsbn && !isEdit) {
      processedScan.current = String(scannedIsbn);
      const s = String(scannedIsbn).trim();
      setIsbn(s);
      lookupISBN(s);
      router.setParams({ scannedIsbn: undefined as any });
    }
  }, [scannedIsbn, isEdit]);

  useEffect(() => {
    const nonce = `${scannedAccession}-${accessionCopyIndex}`;
    if (scannedAccession && processedAccessionScan.current !== nonce) {
      processedAccessionScan.current = nonce;
      const idx = parseInt(accessionCopyIndex ?? '0', 10);
      setCopyAccessions((prev) => {
        const next = [...prev];
        next[idx] = String(scannedAccession).trim();
        return next;
      });
      router.setParams({ scannedAccession: undefined as any, accessionCopyIndex: undefined as any });
    }
  }, [scannedAccession, accessionCopyIndex]);

  const updateCopyAccession = (idx: number, value: string) => {
    setCopyAccessions((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const addCopyRow = () => setCopyAccessions((prev) => [...prev, '']);

  const removeCopyRow = (idx: number) =>
    setCopyAccessions((prev) => prev.filter((_, i) => i !== idx));

  const lookupISBN = async (isbnToLookup?: string) => {
    const target = (isbnToLookup ?? isbn).trim();
    if (!target) return;
    setIsbnLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(target)}&format=json&jscmd=data`,
        { signal: ctrl.signal },
      );
      const json = await res.json();
      const entry = json[`ISBN:${target}`];
      if (!entry) {
        const msg = `No book found for ISBN ${target}. Fill the fields manually.`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Not Found', msg);
        return;
      }
      if (entry.title && !title) setTitle(entry.title);
      if (entry.authors?.[0]?.name && !author) setAuthor(entry.authors[0].name);
      if (entry.publishers?.[0]?.name && !publisher) setPublisher(entry.publishers[0].name);
      if (entry.publish_date && !publishYear) {
        const y = entry.publish_date.match(/\d{4}/);
        if (y) setPublishYear(y[0]);
      }
    } catch (e: any) {
      const msg = e?.name === 'AbortError'
        ? 'Lookup timed out. Fill the fields manually.'
        : 'Failed to look up ISBN. Check your connection or fill manually.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      clearTimeout(timer);
      setIsbnLoading(false);
    }
  };

  const handleScanIsbn = () => {
    router.push({
      pathname: '/(app)/(librarian)/scan' as any,
      params: { returnTo: 'book-form' },
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Title is required.');
      } else {
        Alert.alert('Required', 'Title is required.');
      }
      return;
    }

    // Manual mode validation: require at least one accession number + no dupes
    if (!isEdit && accessionMode === 'manual') {
      const filled = copyAccessions.map((a) => a.trim()).filter(Boolean);
      if (filled.length === 0) {
        const msg = 'Manual mode requires at least one accession number. Enter the number printed on each book.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Required', msg);
        return;
      }
      const counts = new Map<string, number>();
      filled.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
      const firstDup = [...counts.entries()].find(([, n]) => n > 1)?.[0];
      if (firstDup) {
        const msg = `Duplicate accession number: "${firstDup}". Each copy must be unique.`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Duplicate', msg);
        return;
      }
    }

    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          bookId: bookId!,
          title: title.trim(),
          author: author.trim() || null,
          isbn: isbn.trim() || null,
          publisher: publisher.trim() || null,
          publishYear: publishYear ? parseInt(publishYear, 10) : null,
          collectionId: collectionId || null,
          genreId: genreId || null,
          notes: notes.trim() || null,
        });
      } else {
        const filledAccessions = copyAccessions.map((a) => a.trim()).filter(Boolean);
        await createMut.mutateAsync({
          title: title.trim(),
          author: author.trim() || undefined,
          isbn: isbn.trim() || undefined,
          publisher: publisher.trim() || undefined,
          publishYear: publishYear ? parseInt(publishYear, 10) : undefined,
          collectionId: collectionId || undefined,
          genreId: genreId || undefined,
          totalCopies: accessionMode === 'manual' ? filledAccessions.length || 1 : (totalCopies ? parseInt(totalCopies, 10) : 1),
          accessionNumbers: accessionMode === 'manual' && filledAccessions.length > 0 ? filledAccessions : undefined,
          staffId: user?.staffId ?? '',
          notes: notes.trim() || undefined,
        });
      }
      router.back();
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Could not save book');
      } else {
        Alert.alert('Error', e.message ?? 'Could not save book');
      }
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title={isEdit ? 'Edit Book' : 'Add Book'} showBack />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          {/* ISBN + Scan + Lookup */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <FormField label="ISBN" value={isbn} onChangeText={setIsbn} placeholder="e.g. 978-0-13-468599-1" />
            </View>
            <Button
              label="Scan"
              variant="secondary"
              size="sm"
              onPress={handleScanIsbn}
              iconLeft={<Ionicons name="scan-outline" size={16} color={colors.brand.primary} />}
              style={{ marginBottom: Spacing.sm }}
            />
            <Button
              label={isbnLoading ? '...' : 'Lookup'}
              variant="tonal"
              size="sm"
              onPress={() => lookupISBN()}
              disabled={isbnLoading || !isbn.trim()}
              style={{ marginBottom: Spacing.sm }}
            />
          </View>

          <FormField label="Title *" value={title} onChangeText={setTitle} placeholder="Book title" />
          <FormField label="Author" value={author} onChangeText={setAuthor} placeholder="Author name" />
          <FormField label="Publisher" value={publisher} onChangeText={setPublisher} placeholder="Publisher" />
          <FormField label="Publish Year" value={publishYear} onChangeText={setPublishYear} placeholder="e.g. 2023" keyboardType="numeric" />
          {!isEdit && accessionMode === 'auto' && (
            <FormField label="Total Copies" value={totalCopies} onChangeText={setTotalCopies} placeholder="1" keyboardType="numeric" />
          )}

          {!isEdit && accessionMode === 'manual' && (
            <View style={{ marginTop: Spacing.sm }}>
              <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.xs }}>
                Copy Accession Numbers
              </ThemedText>
              {copyAccessions.map((acc, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.xs }}>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label={`Copy ${idx + 1}`}
                      value={acc}
                      onChangeText={(v) => updateCopyAccession(idx, v)}
                      placeholder="e.g. 2024-001"
                      autoCapitalize="characters"
                    />
                  </View>
                  <Button
                    label="Scan"
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push({
                      pathname: '/(app)/(librarian)/scan' as any,
                      params: { returnTo: 'book-form', scanTarget: 'accession', accessionCopyIndex: String(idx) },
                    })}
                    iconLeft={<Ionicons name="scan-outline" size={16} color={colors.brand.primary} />}
                    style={{ marginBottom: Spacing.sm }}
                  />
                  {copyAccessions.length > 1 && (
                    <Button
                      label="✕"
                      variant="ghost"
                      size="sm"
                      onPress={() => removeCopyRow(idx)}
                      style={{ marginBottom: Spacing.sm }}
                    />
                  )}
                </View>
              ))}
              <Button
                label="+ Add Copy"
                variant="secondary"
                size="sm"
                onPress={addCopyRow}
              />
            </View>
          )}

          {/* Collection picker */}
          <View style={{ marginTop: Spacing.sm }}>
            <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.xs }}>
              Collection
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs }}>
                <CollectionChip
                  label="None"
                  selected={!collectionId}
                  onPress={() => setCollectionId('')}
                  color={colors.textMuted}
                />
                {(collections ?? []).map((c) => (
                  <CollectionChip
                    key={c.id}
                    label={c.name}
                    selected={collectionId === c.id}
                    onPress={() => setCollectionId(c.id)}
                    color={c.color}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Genre picker */}
          <View style={{ marginTop: Spacing.sm }}>
            <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.xs }}>
              Genre
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs }}>
                <CollectionChip
                  label="None"
                  selected={!genreId}
                  onPress={() => setGenreId('')}
                  color={colors.textMuted}
                />
                {(genres ?? []).map((g) => (
                  <CollectionChip
                    key={g.id}
                    label={g.name}
                    selected={genreId === g.id}
                    onPress={() => setGenreId(g.id)}
                    color={g.color}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" textarea />
        </Card>

        <View style={styles.actions}>
          <Button
            label={isEdit ? 'Save Changes' : 'Add Book'}
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving}
            fullWidth
          />
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CollectionChip({ label, selected, onPress, color }: {
  label: string; selected: boolean; onPress: () => void; color: string;
}) {
  const { colors } = useTheme();
  return (
    <Button
      label={label}
      variant={selected ? 'primary' : 'secondary'}
      size="sm"
      onPress={onPress}
      iconLeft={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />}
    />
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  card:    { marginHorizontal: Spacing.screen, marginTop: Spacing.base, padding: Spacing.base, borderRadius: Radius.lg },
  actions: { paddingHorizontal: Spacing.screen, marginTop: Spacing.lg },
});
