import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  useLibraryBook, useCreateBook, useUpdateBook, useLibraryCollections,
} from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, FormField, Button, Card,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function BookFormScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { bookId, scannedIsbn } = useLocalSearchParams<{ bookId?: string; scannedIsbn?: string }>();
  const schoolId = user?.schoolId ?? '';
  const isEdit = !!bookId;
  const processedScan = useRef<string | null>(null);

  const { data: existing } = useLibraryBook(bookId ?? null);
  const { data: collections } = useLibraryCollections(schoolId);
  const createMut = useCreateBook(schoolId);
  const updateMut = useUpdateBook(schoolId);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [totalCopies, setTotalCopies] = useState('1');
  const [notes, setNotes] = useState('');
  const [isbnLoading, setIsbnLoading] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setTitle(existing.title);
      setAuthor(existing.author ?? '');
      setIsbn(existing.isbn ?? '');
      setPublisher(existing.publisher ?? '');
      setPublishYear(existing.publish_year ? String(existing.publish_year) : '');
      setCollectionId(existing.collection_id ?? '');
      setTotalCopies(String(existing.copies?.length ?? 1));
      setNotes(existing.notes ?? '');
    }
  }, [existing, isEdit]);

  useEffect(() => {
    if (scannedIsbn && processedScan.current !== scannedIsbn && !isEdit) {
      processedScan.current = scannedIsbn;
      const s = String(scannedIsbn).trim();
      setIsbn(s);
      lookupISBN(s);
    }
  }, [scannedIsbn, isEdit]);

  const lookupISBN = async (isbnToLookup?: string) => {
    const target = (isbnToLookup ?? isbn).trim();
    if (!target) return;
    setIsbnLoading(true);
    try {
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${target}&format=json&jscmd=data`);
      const json = await res.json();
      const entry = json[`ISBN:${target}`];
      if (!entry) {
        if (Platform.OS === 'web') {
          window.alert('No book found for this ISBN.');
        } else {
          Alert.alert('Not Found', 'No book found for this ISBN.');
        }
        return;
      }
      if (entry.title && !title) setTitle(entry.title);
      if (entry.authors?.[0]?.name && !author) setAuthor(entry.authors[0].name);
      if (entry.publishers?.[0]?.name && !publisher) setPublisher(entry.publishers[0].name);
      if (entry.publish_date && !publishYear) {
        const y = entry.publish_date.match(/\d{4}/);
        if (y) setPublishYear(y[0]);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Failed to look up ISBN. Check your connection.');
      } else {
        Alert.alert('Error', 'Failed to look up ISBN. Check your connection.');
      }
    } finally {
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
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          bookId: bookId!,
          title: title.trim(),
          author: author.trim() || undefined,
          isbn: isbn.trim() || undefined,
          publisher: publisher.trim() || undefined,
          publishYear: publishYear ? parseInt(publishYear, 10) : undefined,
          collectionId: collectionId || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await createMut.mutateAsync({
          title: title.trim(),
          author: author.trim() || undefined,
          isbn: isbn.trim() || undefined,
          publisher: publisher.trim() || undefined,
          publishYear: publishYear ? parseInt(publishYear, 10) : undefined,
          collectionId: collectionId || undefined,
          totalCopies: totalCopies ? parseInt(totalCopies, 10) : 1,
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
          {!isEdit && (
            <FormField label="Total Copies" value={totalCopies} onChangeText={setTotalCopies} placeholder="1" keyboardType="numeric" />
          )}

          {/* Collection picker */}
          {(collections ?? []).length > 0 && (
            <View>
              <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
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
          )}

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
