import React, { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format, addDays, parseISO, isValid, startOfDay } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  useLibraryBook, useBatchCheckOut, usePatronSearch, useLibrarySettings,
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
  const { bookId, scannedCode } = useLocalSearchParams<{ bookId: string; scannedCode?: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: book } = useLibraryBook(bookId ?? null);
  const { data: settings } = useLibrarySettings(schoolId);
  const batchCheckOut = useBatchCheckOut(schoolId);

  const [patronQuery, setPatronQuery] = useState('');
  const [patronType, setPatronType] = useState<'all' | 'staff' | 'student'>('all');
  const [selectedPatron, setSelectedPatron] = useState<PatronResult | null>(null);
  const [selectedCopyIds, setSelectedCopyIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');

  const defaultDays = settings?.default_loan_days ?? 14;
  const dueDate = useMemo(() => format(addDays(new Date(), defaultDays), 'yyyy-MM-dd'), [defaultDays]);
  const [customDueDate, setCustomDueDate] = useState('');
  const parsedCustom = customDueDate ? parseISO(customDueDate) : null;
  const isCustomValid = parsedCustom
    && isValid(parsedCustom)
    && startOfDay(parsedCustom) >= startOfDay(new Date());
  const effectiveDueDate = isCustomValid ? customDueDate : dueDate;

  const availableCopies = useMemo(
    () => (book?.copies ?? [])
      .filter((c) => c.status === 'available')
      .sort((a, b) => a.accession_number.localeCompare(b.accession_number)),
    [book]
  );
  const totalCount = book?.copies?.length ?? 0;
  const bookUnavailable = availableCopies.length === 0;

  // Auto-select: prefer scanned copy, else first available
  useEffect(() => {
    if (availableCopies.length > 0 && selectedCopyIds.size === 0) {
      if (scannedCode) {
        const matched = availableCopies.find(
          (c) => c.accession_number === scannedCode || c.barcode === scannedCode
        );
        if (matched) {
          setSelectedCopyIds(new Set([matched.id]));
          return;
        }
      }
      setSelectedCopyIds(new Set([availableCopies[0].id]));
    }
  }, [availableCopies]);

  const toggleCopy = (id: string) => {
    setSelectedCopyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: patrons } = usePatronSearch(schoolId, patronQuery, patronType);

  const handleCheckout = async () => {
    if (!selectedPatron) {
      if (Platform.OS === 'web') window.alert('Please select a borrower.');
      else Alert.alert('Required', 'Please select a borrower.');
      return;
    }
    if (selectedCopyIds.size === 0) {
      if (Platform.OS === 'web') window.alert('Select at least one copy.');
      else Alert.alert('Required', 'Select at least one copy.');
      return;
    }
    try {
      const result = await batchCheckOut.mutateAsync({
        items: [...selectedCopyIds].map((copyId) => ({ bookId: bookId!, copyId })),
        borrowerType: selectedPatron.type,
        borrowerId: selectedPatron.id,
        dueDate: effectiveDueDate,
        staffId: user?.staffId ?? '',
        notes: notes.trim() || undefined,
      });

      const ok = result.succeeded.length;
      const fail = result.failed.length;
      const msg = fail > 0
        ? `${ok} of ${selectedCopyIds.size} copies checked out. ${fail} failed.`
        : `${ok} cop${ok !== 1 ? 'ies' : 'y'} of "${book?.title}" checked out to ${selectedPatron.full_name}.`;

      if (Platform.OS === 'web') {
        window.alert(msg);
        router.back();
      } else {
        Alert.alert('Checked Out', msg, [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message ?? 'Checkout failed');
      else Alert.alert('Error', e.message ?? 'Checkout failed');
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, gap: Spacing.sm }}>
              <Ionicons name="barcode-outline" size={16} color={colors.brand.primary} />
              <ThemedText variant="bodySm">
                {selectedCopyIds.size > 0
                  ? selectedCopyIds.size === 1
                    ? availableCopies.find((c) => selectedCopyIds.has(c.id))?.accession_number ?? '—'
                    : `${selectedCopyIds.size} copies selected`
                  : 'No copies available'}
              </ThemedText>
              {availableCopies.length > 0 && (
                <ThemedText variant="caption" color="muted">
                  ({availableCopies.length}/{totalCount} available)
                </ThemedText>
              )}
            </View>
          </Card>
        )}

        {/* Copy selection */}
        {!bookUnavailable && (
          <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
              <ThemedText variant="h4">Select Copies</ThemedText>
              {availableCopies.length > 1 && (
                <Button
                  label={selectedCopyIds.size === availableCopies.length ? 'Deselect All' : 'Select All'}
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    setSelectedCopyIds(
                      selectedCopyIds.size === availableCopies.length
                        ? new Set()
                        : new Set(availableCopies.map((c) => c.id))
                    )
                  }
                />
              )}
            </View>
            {availableCopies.map((copy) => (
              <ListItem
                key={copy.id}
                title={copy.accession_number}
                subtitle={copy.barcode && copy.barcode !== copy.accession_number ? `Barcode: ${copy.barcode}` : undefined}
                badge={selectedCopyIds.has(copy.id) ? { label: 'Selected', preset: 'success' } : undefined}
                leading={
                  <Ionicons
                    name={selectedCopyIds.has(copy.id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selectedCopyIds.has(copy.id) ? Colors.semantic.success : colors.textMuted}
                  />
                }
                onPress={() => toggleCopy(copy.id)}
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
              Invalid date or date is in the past — use YYYY-MM-DD.
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
            label={selectedCopyIds.size > 1 ? `Confirm Check Out (${selectedCopyIds.size} copies)` : 'Confirm Check Out'}
            onPress={handleCheckout}
            loading={batchCheckOut.isPending}
            disabled={!selectedPatron || batchCheckOut.isPending || bookUnavailable || selectedCopyIds.size === 0 || (customDueDate !== '' && !isCustomValid)}
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
