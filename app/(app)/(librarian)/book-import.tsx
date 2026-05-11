import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useImportBooks, useLibraryCollections } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, Card, Button,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

interface ParsedRow {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  publishYear: string;
  copies: string;
  collection: string;
  accessionNumbers: string;
  _row: number;
  _error?: string;
  _accessionList?: string[];
}

const TEMPLATE = `title,author,isbn,publisher,year,copies,collection,accession_numbers
"To Kill a Mockingbird","Harper Lee","9780061120084","HarperCollins","1960","2","Fiction",""
"A Brief History of Time","Stephen Hawking","9780553380163","Bantam","1988","1","Science",""
"Example Manual","Some Author","","","2024","","Reference","2024-001;2024-002"
`;

// RFC 4180 minimal CSV parser — handles quoted fields, embedded commas, escaped quotes, CRLF.
function parseCSVText(raw: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function parseCSV(raw: string): { rows: ParsedRow[]; missingTitle: boolean } {
  const matrix = parseCSVText(raw);
  if (matrix.length < 2) return { rows: [], missingTitle: true };
  const header = matrix[0].map((h) => h.trim().toLowerCase());

  const idxOf = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const titleIdx     = idxOf(['title']);
  const authorIdx    = idxOf(['author']);
  const isbnIdx      = idxOf(['isbn']);
  const publisherIdx = idxOf(['publisher']);
  const yearIdx      = idxOf(['year', 'publish_year', 'publishyear', 'publish year']);
  const copiesIdx    = idxOf(['copies', 'total_copies', 'totalcopies', 'quantity', 'qty']);
  const collectionIdx= idxOf(['collection', 'category']);
  const accessionIdx = idxOf(['accession_numbers', 'accessions', 'accession_number', 'accession']);

  if (titleIdx < 0) return { rows: [], missingTitle: true };

  const rows: ParsedRow[] = matrix.slice(1).map((cols, i) => {
    const get = (idx: number) => (idx >= 0 ? (cols[idx] ?? '').trim() : '');
    const accRaw = get(accessionIdx);
    const accList = accRaw
      ? accRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const r: ParsedRow = {
      title:       get(titleIdx),
      author:      get(authorIdx),
      isbn:        get(isbnIdx),
      publisher:   get(publisherIdx),
      publishYear: get(yearIdx),
      copies:      get(copiesIdx),
      collection:  get(collectionIdx),
      accessionNumbers: accRaw,
      _accessionList: accList,
      _row: i + 2,
    };
    if (!r.title) r._error = 'Missing title';
    if (r.publishYear && !/^\d{1,4}$/.test(r.publishYear)) r._error = 'Invalid year';
    if (r.copies && (!/^\d+$/.test(r.copies) || parseInt(r.copies, 10) < 1)) r._error = 'Invalid copies';
    if (accList.length > 0) {
      const counts = new Map<string, number>();
      accList.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
      const dup = [...counts.entries()].find(([, n]) => n > 1)?.[0];
      if (dup) r._error = `Duplicate accession in row: "${dup}"`;
    }
    return r;
  });
  return { rows, missingTitle: false };
}

export default function BookImportScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const importMut = useImportBooks(schoolId);
  const { data: collections } = useLibraryCollections(schoolId, 'collection');

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<{ success: number; errors: { row: number; reason: string }[] } | null>(null);

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);

  const downloadTemplate = async () => {
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([TEMPLATE], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'books-template.csv';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } else {
        const path = `${FileSystem.cacheDirectory}books-template.csv`;
        await FileSystem.writeAsStringAsync(path, TEMPLATE);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'text/csv' });
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Could not save template';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '.csv'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setFileName(asset.name);
      setResult(null);
      const content = Platform.OS === 'web'
        ? await fetch(asset.uri).then((r) => r.text())
        : await FileSystem.readAsStringAsync(asset.uri);
      const { rows: parsed, missingTitle } = parseCSV(content);
      if (missingTitle) {
        const msg = 'CSV must have a "title" column. Tap "Download Template" for the correct format.';
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Invalid CSV', msg);
        setRows([]);
        return;
      }
      if (parsed.length === 0) {
        const msg = 'No data rows found in CSV.';
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Empty CSV', msg);
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch (e: any) {
      const msg = e?.message ?? 'Could not read file';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Error', msg);
    }
  };

  const collectionIdByName = (name: string): string | undefined => {
    if (!name) return undefined;
    const lower = name.trim().toLowerCase();
    return (collections ?? []).find((c) => c.name.toLowerCase() === lower)?.id;
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    const errors: { row: number; reason: string }[] = [];
    let success = 0;
    for (const r of validRows) {
      try {
        const accList = r._accessionList ?? [];
        await importMut.mutateAsync([{
          title: r.title,
          author: r.author || undefined,
          isbn: r.isbn || undefined,
          publisher: r.publisher || undefined,
          publishYear: r.publishYear ? parseInt(r.publishYear, 10) : undefined,
          totalCopies: accList.length > 0 ? accList.length : (r.copies ? parseInt(r.copies, 10) : 1),
          accessionNumbers: accList.length > 0 ? accList : undefined,
          collectionId: collectionIdByName(r.collection),
          staffId: user?.staffId ?? '',
        }]);
        success++;
      } catch (e: any) {
        errors.push({ row: r._row, reason: e?.message ?? 'Insert failed' });
      }
    }
    setResult({ success, errors });
    setRows([]);
    setFileName('');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Import Books" showBack />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Instructions */}
        <Card style={styles.card}>
          <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>How it works</ThemedText>
          <ThemedText variant="bodySm" color="muted">
            1. Download the template CSV.
          </ThemedText>
          <ThemedText variant="bodySm" color="muted" style={{ marginTop: 2 }}>
            2. Fill in your books (only <ThemedText variant="mono">title</ThemedText> is required).
          </ThemedText>
          <ThemedText variant="bodySm" color="muted" style={{ marginTop: 2 }}>
            3. Upload it here. Accession numbers and barcodes are auto-generated.
          </ThemedText>
          <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>
            Columns: title, author, isbn, publisher, year, copies, collection
          </ThemedText>
          <Button
            label="Download Template"
            variant="tonal"
            onPress={downloadTemplate}
            iconLeft={<Ionicons name="download-outline" size={16} color={colors.brand.primary} />}
            style={{ marginTop: Spacing.base, alignSelf: 'flex-start' }}
          />
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
              <ThemedText variant="h4">
                {validRows.length} ready · {invalidRows.length > 0 ? `${invalidRows.length} skipped` : 'no errors'}
              </ThemedText>
              <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
                Preview (first 8):
              </ThemedText>
              {rows.slice(0, 8).map((r, i) => (
                <View key={i} style={styles.previewRow}>
                  <ThemedText variant="bodySm" numberOfLines={1} style={{ flex: 1, color: r._error ? Colors.semantic.danger : colors.textPrimary }}>
                    {r._error ? `Row ${r._row}: ${r._error}` : r.title}
                  </ThemedText>
                  {!r._error && r.author ? <ThemedText variant="caption" color="muted">{r.author}</ThemedText> : null}
                  {!r._error && r.copies && r.copies !== '1' ? (
                    <ThemedText variant="caption" color="muted">×{r.copies}</ThemedText>
                  ) : null}
                </View>
              ))}
              {rows.length > 8 && (
                <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
                  ...and {rows.length - 8} more
                </ThemedText>
              )}
            </Card>

            <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
              <Button
                label={importMut.isPending ? 'Importing...' : `Import ${validRows.length} Book${validRows.length === 1 ? '' : 's'}`}
                onPress={handleImport}
                loading={importMut.isPending}
                disabled={importMut.isPending || validRows.length === 0}
                fullWidth
              />
            </View>
          </>
        )}

        {/* Result */}
        {result && (
          <Card style={[
            styles.card,
            { borderColor: result.errors.length === 0 ? Colors.semantic.success : Colors.semantic.warning, borderWidth: 1 },
          ]}>
            <ThemedText variant="h4" style={{ color: result.errors.length === 0 ? Colors.semantic.success : Colors.semantic.warning }}>
              {result.errors.length === 0 ? 'Import Complete' : 'Import Finished With Errors'}
            </ThemedText>
            <ThemedText variant="body">{result.success} books imported.</ThemedText>
            {result.errors.length > 0 && (
              <>
                <ThemedText variant="bodySm" color="muted" style={{ marginTop: Spacing.sm }}>
                  {result.errors.length} failed:
                </ThemedText>
                {result.errors.slice(0, 10).map((e, i) => (
                  <ThemedText key={i} variant="caption" color="muted">• Row {e.row}: {e.reason}</ThemedText>
                ))}
                {result.errors.length > 10 && (
                  <ThemedText variant="caption" color="muted">...and {result.errors.length - 10} more</ThemedText>
                )}
              </>
            )}
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
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs, gap: Spacing.sm, alignItems: 'center' },
});
