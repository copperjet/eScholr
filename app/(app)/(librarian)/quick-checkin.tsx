import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, Platform, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useBookByBarcode } from '../../../hooks/useLibrary';
import { ThemedText, ScreenHeader, Button, Card } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';

const IS_WEB = Platform.OS === 'web';

export default function QuickCheckinScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { scannedBarcode } = useLocalSearchParams<{ scannedBarcode?: string }>();
  const schoolId = user?.schoolId ?? '';
  const [barcode, setBarcode] = useState('');
  const [processing, setProcessing] = useState(false);
  const barcodeMut = useBookByBarcode(schoolId);

  const processBarcode = useCallback(async (code: string) => {
    if (!code || processing) return;
    setProcessing(true);

    try {
      const bookId = await barcodeMut.mutateAsync(code);
      if (!bookId) {
        if (Platform.OS === 'web') {
          window.alert(`No book found with barcode "${code}"`);
        } else {
          Alert.alert('Not Found', `No book found with barcode "${code}"`);
        }
        setProcessing(false);
        return;
      }

      // Navigate to book-detail which shows active transactions with Return buttons
      router.push({
        pathname: '/(app)/(librarian)/book-detail' as any,
        params: { bookId },
      });
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Lookup failed');
      } else {
        Alert.alert('Error', e.message ?? 'Lookup failed');
      }
      setProcessing(false);
    }
  }, [processing, barcodeMut]);

  useEffect(() => {
    if (scannedBarcode) {
      setBarcode(scannedBarcode);
      processBarcode(scannedBarcode);
    }
  }, [scannedBarcode, processBarcode]);

  const handleScan = useCallback(() => {
    processBarcode(barcode.trim());
  }, [barcode, processBarcode]);

  const handleScanButton = () => {
    router.push({
      pathname: '/(app)/(librarian)/scan' as any,
      params: { returnTo: 'quick-checkin' },
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Quick Check In" showBack />

      <View style={styles.container}>
        <Card style={styles.card}>
          <ThemedText variant="h3" style={{ marginBottom: Spacing.sm }}>Scan Book Barcode</ThemedText>
          <ThemedText variant="body" color="muted" style={{ marginBottom: Spacing.lg }}>
            {IS_WEB
              ? 'Type the barcode below or use a USB barcode scanner. The book detail will open — tap Return on the active loan.'
              : 'Point the camera at the book barcode. The book detail will open — tap Return on the active loan.'}
          </ThemedText>

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="caption" color="muted" style={{ marginBottom: Spacing.xs }}>Barcode</ThemedText>
              <TextInput
                value={barcode}
                onChangeText={setBarcode}
                placeholder="e.g. ACC-00001"
                placeholderTextColor={colors.textMuted}
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                  borderRadius: Radius.md,
                  paddingHorizontal: Spacing.base,
                  paddingVertical: Spacing.md,
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                autoFocus
                onSubmitEditing={handleScan}
                editable={!processing}
              />
            </View>
            <Button
              label="Scan"
              variant="secondary"
              onPress={handleScanButton}
              disabled={processing}
              style={{ alignSelf: 'flex-end' }}
            />
          </View>

          <Button
            label={processing ? 'Processing...' : 'Look Up Book'}
            onPress={handleScan}
            disabled={!barcode.trim() || processing}
            fullWidth
            style={{ marginTop: Spacing.base }}
          />
        </Card>

        <Card variant="tinted" style={styles.tip}>
          <ThemedText variant="bodySm" color="muted">
            Scan the book barcode to open the book detail, then tap Return on the active loan to complete check-in.
          </ThemedText>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: Spacing.screen, justifyContent: 'center' },
  card: { padding: Spacing.lg },
  tip: { marginTop: Spacing.base, padding: Spacing.md },
});
