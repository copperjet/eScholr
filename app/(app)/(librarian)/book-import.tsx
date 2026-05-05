import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useImportBooks } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, Card, Button, EmptyState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

interface ParsedRow {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  publishYear: string;
}

function parseCSV(raw: string): ParsedRow[] {
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''));

  const colIdx = (names: string[]) => {
    for (const n of names) {
      const idx = header.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const titleIdx     = colIdx(['title']);
  const authorIdx    = colIdx(['author']);
  const isbnIdx      = colIdx(['isbn']);
  const publisherIdx = colIdx(['publisher']);
  const yearIdx      = colIdx(['year', 'publish_year', 'publishyear', 'publish year']);

  if (titleIdx < 0) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      title:           cols[titleIdx] ?? '',
      author:          authorIdx >= 0 ? cols[authorIdx] ?? '' : '',
      isbn:            isbnIdx >= 0 ? cols[isbnIdx] ?? '' : '',
      publisher:       publisherIdx >= 0 ? cols[publisherIdx] ?? '' : '',
      publishYear:     yearIdx >= 0 ? cols[yearIdx] ?? '' : '',
    };
  }).filter((r) => r.title);
}

export default function BookImportScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const importMut = useImportBooks(schoolId);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setFileName(asset.name);
      let content: string;
      if (Platform.OS === 'web') {
        content = await fetch(asset.uri).then((r) => r.text());
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri);
      }
      const parsed = parseCSV(content);
      if (parsed.length === 0) {
        if (Platform.OS === 'web') {
          window.alert('CSV must have at least a "title" column.');
        } else {
          Alert.alert('Invalid CSV', 'CSV must have at least a "title" column.');
        }
        return;
      }
      setRows(parsed);
      setResult(null);
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Could not read file');
      } else {
        Alert.alert('Error', e.message ?? 'Could not read file');
      }
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    try {
      const payload = rows.map((r) => ({
        title: r.title,
        author: r.author || undefined,
        isbn: r.isbn || undefined,
        publisher: r.publisher || undefined,
        publishYear: r.publishYear ? parseInt(r.publishYear, 10) : undefined,
        staffId: user?.staffId ?? '',
      }));
      const res = await importMut.mutateAsync(payload);
      setResult({ success: res.count, errors: 0 });
      setRows([]);
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Import failed.');
      } else {
        Alert.alert('Import Error', e.message ?? 'Import failed.');
      }
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Import Books" showBack />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Instructions */}
        <Card style={styles.card}>
          <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>CSV Format</ThemedText>
          <ThemedText variant="bodySm" color="muted">
            Your CSV must include a <ThemedText variant="mono">title</ThemedText> column.
          </ThemedText>
          <ThemedText variant="bodySm" color="muted" style={{ marginTop: Spacing.xs }}>
            Optional columns: author, isbn, publisher, year. Accession numbers and barcodes are auto-generated.
          </ThemedText>
        </Card>

        {/* Pick file */}
        <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
          <Button
            label={fileName ? `Selected: ${fileName}` : 'Choose CSV File'}
            variant="secondary"
            onPress={pickFile}
            fullWidth
            iconLeft={<Ionicons name="document-outline" size={18} color={colors.brand.primary} />}
          />
        </View>

        {/* Preview */}
        {rows.length > 0 && (
          <>
            <Card style={styles.card}>
              <ThemedText variant="h4">{rows.length} books ready to import</ThemedText>
              <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
                Preview (first 5):
              </ThemedText>
              {rows.slice(0, 5).map((r, i) => (
                <View key={i} style={styles.previewRow}>
                  <ThemedText variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>{r.title}</ThemedText>
                  {r.author ? <ThemedText variant="caption" color="muted">{r.author}</ThemedText> : null}
                </View>
              ))}
              {rows.length > 5 && (
                <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
                  ...and {rows.length - 5} more
                </ThemedText>
              )}
            </Card>

            <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
              <Button
                label={`Import ${rows.length} Books`}
                onPress={handleImport}
                loading={importMut.isPending}
                disabled={importMut.isPending}
                fullWidth
              />
            </View>
          </>
        )}

        {/* Result */}
        {result && (
          <Card style={[styles.card, { borderColor: Colors.semantic.success, borderWidth: 1 }]}>
            <ThemedText variant="h4" style={{ color: Colors.semantic.success }}>
              Import Complete
            </ThemedText>
            <ThemedText variant="body">{result.success} books imported successfully.</ThemedText>
            <Button
              label="Go to Catalog"
              variant="tonal"
              onPress={() => router.replace('/(app)/(librarian)/catalog' as any)}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  card:       { marginHorizontal: Spacing.screen, marginTop: Spacing.base, padding: Spacing.base, borderRadius: Radius.lg },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs, gap: Spacing.sm },
});
