import React, { useState, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useBookByBarcode } from '../../../hooks/useLibrary';
import { ThemedText, ScreenHeader, Button, Card } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';

export default function ScanScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const barcodeMut = useBookByBarcode(schoolId);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    // Return mode: pass raw barcode back to caller (e.g. book-form ISBN scan)
    if (returnTo === 'book-form') {
      router.replace({
        pathname: '/(app)/(librarian)/book-form' as any,
        params: { scannedIsbn: data },
      });
      return;
    }

    try {
      const foundBookId = await barcodeMut.mutateAsync(data);
      if (!foundBookId) {
        Alert.alert('Not Found', `No book found with barcode "${data}"`, [
          { text: 'Scan Again', onPress: () => setScanned(false) },
        ]);
        return;
      }
      // Navigate to book detail
      router.replace({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: foundBookId } });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Lookup failed', [
        { text: 'Scan Again', onPress: () => setScanned(false) },
      ]);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Scan Barcode" showBack />
        <View style={styles.center}>
          <ThemedText variant="body" color="muted">Requesting camera permission...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Scan Barcode" showBack />
        <View style={styles.center}>
          <ThemedText variant="body" color="muted" style={{ textAlign: 'center', marginBottom: Spacing.base }}>
            Camera access is required to scan barcodes.
          </ThemedText>
          <Button label="Grant Permission" onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#000' }]}>
      <ScreenHeader title="Scan Barcode" showBack tint="light" />

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['code128', 'ean13', 'ean8', 'qr', 'code39'] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        {/* Scan overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <ThemedText variant="body" style={{ color: '#fff', textAlign: 'center', marginTop: Spacing.base, fontWeight: '600' }}>
            {returnTo === 'book-form' ? 'Scan ISBN barcode on book' : 'Point camera at library barcode'}
          </ThemedText>
          <ThemedText variant="bodySm" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: Spacing.xs }}>
            {returnTo === 'book-form' ? 'ISBN-13 or ISBN-10 barcode' : 'Library accession barcode'}
          </ThemedText>
        </View>
      </View>

      {scanned && (
        <View style={styles.bottomBar}>
          <Card style={{ padding: Spacing.base }}>
            <ThemedText variant="body" style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
              {barcodeMut.isPending ? 'Looking up book...' : 'Processing...'}
            </ThemedText>
            <Button label="Scan Again" variant="tonal" onPress={() => setScanned(false)} fullWidth />
          </Card>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  center:          { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.screen },
  cameraContainer: { flex: 1, position: 'relative' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: Radius.lg,
    backgroundColor: 'transparent',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.screen,
    paddingBottom: Spacing.xl,
  },
});
