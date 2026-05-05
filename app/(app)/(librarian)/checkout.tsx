import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  useLibraryBook, useCheckOutBook, usePatronSearch, useLibrarySettings,
} from '../../../hooks/useLibrary';
import type { PatronResult } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, Card, SearchBar, ListItem, Button, FormField, EmptyState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function CheckoutScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: book } = useLibraryBook(bookId ?? null);
  const { data: settings } = useLibrarySettings(schoolId);
  const checkOutMut = useCheckOutBook(schoolId);

  const [patronQuery, setPatronQuery] = useState('');
  const [patronType, setPatronType] = useState<'all' | 'staff' | 'student'>('all');
  const [selectedPatron, setSelectedPatron] = useState<PatronResult | null>(null);
  const [selectedCopyId, setSelectedCopyId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const defaultDays = settings?.default_loan_days ?? 14;
  const dueDate = useMemo(() => format(addDays(new Date(), defaultDays), 'yyyy-MM-dd'), [defaultDays]);
  const [customDueDate, setCustomDueDate] = useState('');
  const parsedCustom = customDueDate ? parseISO(customDueDate) : null;
  const isCustomValid = parsedCustom && isValid(parsedCustom);
  const effectiveDueDate = isCustomValid ? customDueDate : dueDate;

  const availableCopies = useMemo(
    () => (book?.copies ?? []).filter((c) => c.status === 'available'),
    [book]
  );
  const totalCount = book?.copies?.length ?? 0;
  const bookUnavailable = availableCopies.length < 1;
  const needsCopySelect = availableCopies.length > 1;

  const { data: patrons } = usePatronSearch(schoolId, patronQuery, patronType);

  const handleCheckout = async () => {
    if (!selectedPatron) {
      if (Platform.OS === 'web') {
        window.alert('Please select a borrower.');
      } else {
        Alert.alert('Required', 'Please select a borrower.');
      }
      return;
    }
    if (needsCopySelect && !selectedCopyId) {
      if (Platform.OS === 'web') {
        window.alert('Multiple copies available — select a copy by accession number.');
      } else {
        Alert.alert('Required', 'Multiple copies available — select a copy by accession number.');
      }
      return;
    }
    try {
      await checkOutMut.mutateAsync({
        bookId: bookId!,
        copyId: selectedCopyId ?? undefined,
        borrowerType: selectedPatron.type,
        borrowerId: selectedPatron.id,
        dueDate: effectiveDueDate,
        staffId: user?.staffId ?? '',
        notes: notes.trim() || undefined,
      });
      if (Platform.OS === 'web') {
        window.alert(`"${book?.title}" checked out to ${selectedPatron.full_name}.`);
        router.back();
      } else {
        Alert.alert('Checked Out', `"${book?.title}" checked out to ${selectedPatron.full_name}.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Checkout failed');
      } else {
        Alert.alert('Error', e.message ?? 'Checkout failed');
      }
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Check Out" showBack />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Book info */}
        {book && (
          <Card style={styles.card}>
            <ThemedText variant="h3">{book.title}</ThemedText>
            {book.author && <ThemedText variant="bodySm" color="muted">{book.author}</ThemedText>}
            <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
              Available: {availableCopies.length}/{totalCount} copies
            </ThemedText>
          </Card>
        )}

        {/* Copy selection — only shown when multiple copies available */}
        {!bookUnavailable && needsCopySelect && (
          <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
            <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>Select Copy</ThemedText>
            {availableCopies.map((copy) => (
              <ListItem
                key={copy.id}
                title={copy.accession_number}
                subtitle={copy.barcode && copy.barcode !== copy.accession_number ? `Barcode: ${copy.barcode}` : undefined}
                badge={selectedCopyId === copy.id ? { label: 'Selected', preset: 'success' } : undefined}
                leading={
                  <Ionicons
                    name={selectedCopyId === copy.id ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selectedCopyId === copy.id ? Colors.semantic.success : colors.textMuted}
                  />
                }
                onPress={() => setSelectedCopyId(copy.id)}
              />
            ))}
          </View>
        )}

        {/* Patron search */}
        <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
          <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>Select Borrower</ThemedText>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            {(['all', 'student', 'staff'] as const).map((t) => (
              <Button
                key={t}
                label={t === 'all' ? 'All' : t === 'student' ? 'Students' : 'Staff'}
                variant={patronType === t ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => setPatronType(t)}
              />
            ))}
          </View>

          <SearchBar
            value={patronQuery}
            onChangeText={setPatronQuery}
            placeholder="Search by name..."
          />
        </View>

        {/* Selected patron */}
        {selectedPatron && (
          <Card style={[styles.card, { borderColor: Colors.semantic.success, borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <ThemedText variant="h4">{selectedPatron.full_name}</ThemedText>
                <ThemedText variant="caption" color="muted">
                  {selectedPatron.type === 'staff' ? 'Staff' : 'Student'} · {selectedPatron.identifier}
                </ThemedText>
              </View>
              <Button label="Change" variant="ghost" size="sm" onPress={() => setSelectedPatron(null)} />
            </View>
          </Card>
        )}

        {/* Search results */}
        {!selectedPatron && patronQuery.length >= 2 && (
          <View style={{ marginTop: Spacing.sm }}>
            {(patrons ?? []).length === 0 ? (
              <EmptyState title="No matches" description="Try a different name." />
            ) : (
              (patrons ?? []).map((p) => (
                <ListItem
                  key={`${p.type}-${p.id}`}
                  title={p.full_name}
                  subtitle={`${p.type === 'staff' ? 'Staff' : 'Student'} · ${p.identifier}`}
                  leading={<Ionicons name={p.type === 'staff' ? 'person' : 'school'} size={20} color={colors.brand.primary} />}
                  onPress={() => { setSelectedPatron(p); setPatronQuery(''); }}
                />
              ))
            )}
          </View>
        )}

        {/* Due date */}
        <Card style={styles.card}>
          <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.xs }}>Due Date</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Ionicons name="calendar-outline" size={20} color={colors.brand.primary} />
            <ThemedText variant="h3">{format(parseISO(effectiveDueDate), 'dd MMM yyyy')}</ThemedText>
          </View>
          {customDueDate !== '' && !isCustomValid && (
            <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: Spacing.xs }}>
              Invalid date — use YYYY-MM-DD.
            </ThemedText>
          )}
          <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.xs }}>
            {defaultDays} day loan period from today
          </ThemedText>
          <FormField
            label="Override (YYYY-MM-DD)"
            value={customDueDate}
            onChangeText={setCustomDueDate}
            placeholder={dueDate}
          />
        </Card>

        {/* Notes */}
        <Card style={styles.card}>
          <FormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes about this loan..."
            textarea
          />
        </Card>

        {/* Action */}
        <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.lg }}>
          {bookUnavailable && (
            <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, textAlign: 'center', marginBottom: Spacing.sm }}>
              No copies available for checkout.
            </ThemedText>
          )}
          <Button
            label="Confirm Check Out"
            onPress={handleCheckout}
            loading={checkOutMut.isPending}
            disabled={!selectedPatron || checkOutMut.isPending || bookUnavailable || (needsCopySelect && !selectedCopyId)}
            fullWidth
          />
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { marginHorizontal: Spacing.screen, marginTop: Spacing.base, padding: Spacing.base, borderRadius: Radius.lg },
});
