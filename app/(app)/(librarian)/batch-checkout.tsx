import React, { useState, useMemo, useRef } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, Platform, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, addDays, parseISO, isValid, startOfDay } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  useAccessionCopyLookup, useBatchCheckOut, usePatronSearch, useLibrarySettings,
} from '../../../hooks/useLibrary';
import type { PatronResult } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, Card, SearchBar, ListItem, Button, FormField, EmptyState,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

interface CartItem {
  copyId: string;
  bookId: string;
  accessionNumber: string;
  title: string;
}

export default function BatchCheckoutScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: settings } = useLibrarySettings(schoolId);
  const lookupMut = useAccessionCopyLookup(schoolId);
  const batchCheckOutMut = useBatchCheckOut(schoolId);

  const [accessionInput, setAccessionInput] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  const [patronQuery, setPatronQuery] = useState('');
  const [patronType, setPatronType] = useState<'all' | 'staff' | 'student'>('all');
  const [selectedPatron, setSelectedPatron] = useState<PatronResult | null>(null);

  const defaultDays = settings?.default_loan_days ?? 14;
  const dueDate = useMemo(() => format(addDays(new Date(), defaultDays), 'yyyy-MM-dd'), [defaultDays]);
  const [customDueDate, setCustomDueDate] = useState('');
  const parsedCustom = customDueDate ? parseISO(customDueDate) : null;
  const isCustomValid = parsedCustom && isValid(parsedCustom) && startOfDay(parsedCustom) >= startOfDay(new Date());
  const effectiveDueDate = isCustomValid ? customDueDate : dueDate;

  const [notes, setNotes] = useState('');

  const { data: patrons } = usePatronSearch(schoolId, patronQuery, patronType);

  const accessionInputRef = useRef<TextInput>(null);

  const handleAddAccession = async () => {
    const code = accessionInput.trim();
    if (!code) return;
    setLookupError('');

    if (cart.some((i) => i.accessionNumber === code)) {
      setLookupError(`"${code}" already in cart.`);
      return;
    }

    try {
      const result = await lookupMut.mutateAsync(code);
      if (!result) {
        setLookupError(`No book found for "${code}".`);
        return;
      }
      if (result.status !== 'available') {
        setLookupError(`"${code}" is ${result.status.replace('_', ' ')} — cannot check out.`);
        return;
      }
      setCart((prev) => [...prev, {
        copyId: result.copyId,
        bookId: result.bookId,
        accessionNumber: result.accessionNumber,
        title: result.title,
      }]);
      setAccessionInput('');
      accessionInputRef.current?.focus();
    } catch (e: any) {
      setLookupError(e.message ?? 'Lookup failed.');
    }
  };

  const removeFromCart = (copyId: string) => {
    setCart((prev) => prev.filter((i) => i.copyId !== copyId));
  };

  const handleCheckoutAll = async () => {
    if (!selectedPatron) {
      if (Platform.OS === 'web') window.alert('Select a borrower first.');
      else Alert.alert('Required', 'Select a borrower first.');
      return;
    }
    if (cart.length === 0) {
      if (Platform.OS === 'web') window.alert('Add at least one book to the cart.');
      else Alert.alert('Required', 'Add at least one book to the cart.');
      return;
    }
    try {
      const result = await batchCheckOutMut.mutateAsync({
        items: cart.map((i) => ({ bookId: i.bookId, copyId: i.copyId })),
        borrowerType: selectedPatron.type,
        borrowerId: selectedPatron.id,
        dueDate: effectiveDueDate,
        staffId: user?.staffId ?? '',
        notes: notes.trim() || undefined,
      });

      const total = cart.length;
      const ok = result.succeeded.length;
      const fail = result.failed.length;

      const msg = fail > 0
        ? `${ok} of ${total} books checked out. ${fail} failed (may have been taken).`
        : `${ok} book${ok !== 1 ? 's' : ''} checked out to ${selectedPatron.full_name}.`;

      if (Platform.OS === 'web') {
        window.alert(msg);
        router.back();
      } else {
        Alert.alert('Done', msg, [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message ?? 'Checkout failed.');
      else Alert.alert('Error', e.message ?? 'Checkout failed.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Batch Check Out" showBack />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Accession entry */}
        <Card style={styles.card}>
          <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>Add Books by Accession</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <TextInput
                ref={accessionInputRef}
                value={accessionInput}
                onChangeText={(v) => { setAccessionInput(v); setLookupError(''); }}
                placeholder="e.g. ACC-00001"
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                  borderRadius: Radius.md,
                  paddingHorizontal: Spacing.base,
                  paddingVertical: Spacing.md,
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: lookupError ? Colors.semantic.error : colors.border,
                }}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleAddAccession}
                editable={!lookupMut.isPending}
              />
            </View>
            <Button
              label={lookupMut.isPending ? '...' : 'Add'}
              onPress={handleAddAccession}
              disabled={!accessionInput.trim() || lookupMut.isPending}
              size="md"
            />
          </View>
          {lookupError ? (
            <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginTop: Spacing.xs }}>
              {lookupError}
            </ThemedText>
          ) : null}
        </Card>

        {/* Cart */}
        <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.base }}>
          <ThemedText variant="h4" style={{ marginBottom: Spacing.sm }}>
            Cart ({cart.length})
          </ThemedText>
          {cart.length === 0 ? (
            <EmptyState title="No books added" description="Enter accession numbers above to build your cart." />
          ) : (
            cart.map((item) => (
              <ListItem
                key={item.copyId}
                title={item.accessionNumber}
                subtitle={item.title}
                leading={<Ionicons name="book-outline" size={20} color={colors.brand.primary} />}
                trailing={
                  <Pressable onPress={() => removeFromCart(item.copyId)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={22} color={Colors.semantic.error} />
                  </Pressable>
                }
              />
            ))
          )}
        </View>

        {/* Patron */}
        <View style={{ paddingHorizontal: Spacing.screen, marginTop: Spacing.lg }}>
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
          <SearchBar value={patronQuery} onChangeText={setPatronQuery} placeholder="Search by name..." />
        </View>

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
          <Button
            label={`Checkout All (${cart.length})`}
            onPress={handleCheckoutAll}
            loading={batchCheckOutMut.isPending}
            disabled={cart.length === 0 || !selectedPatron || batchCheckOutMut.isPending || (customDueDate !== '' && !isCustomValid)}
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
