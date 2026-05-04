import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, TextInput, Animated } from 'react-native';
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
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const processingRef = useRef(false);
  const barcodeMut = useBookByBarcode(schoolId);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const isIsbnMode = returnTo === 'book-form';
  const flashAnim = useRef(new Animated.Value(0)).current;

  const flashGreen = useCallback(() => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
  }, [flashAnim]);

  const handleCode = useCallback(async (data: string) => {
    const code = data.trim();
    if (!code || processingRef.current) return;
    processingRef.current = true;
    setDetectedCode(code);
    flashGreen();

    if (isIsbnMode) {
      router.replace({
        pathname: '/(app)/(librarian)/book-form' as any,
        params: { scannedIsbn: code },
      });
      return;
    }

    try {
      const foundBookId = await barcodeMut.mutateAsync(code);
      if (!foundBookId) {
        Alert.alert('Not Found', `No book found with barcode "${code}"`, [
          { text: 'OK', onPress: () => { processingRef.current = false; setDetectedCode(null); } },
        ]);
        return;
      }
      router.replace({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: foundBookId } });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Lookup failed', [
        { text: 'OK', onPress: () => { processingRef.current = false; setDetectedCode(null); } },
      ]);
    }
  }, [isIsbnMode, barcodeMut, flashGreen]);

  const handleBarCodeScanned = useCallback(({ data }: { type: string; data: string }) => {
    handleCode(data);
  }, [handleCode]);

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
          facing="back"
          animateShutter={false}
          barcodeScannerSettings={{ barcodeTypes: ['code128', 'ean13', 'ean8', 'qr', 'code39', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={handleBarCodeScanned}
        />

        {/* Scan overlay */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <ThemedText variant="body" style={{ color: '#fff', textAlign: 'center', marginTop: Spacing.base, fontWeight: '600' }}>
            {isIsbnMode ? 'Scan ISBN barcode on book' : 'Point camera at library barcode'}
          </ThemedText>
          <ThemedText variant="bodySm" style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: Spacing.xs }}>
            {isIsbnMode ? 'ISBN-13 or ISBN-10 barcode' : 'Library accession barcode'}
          </ThemedText>
        </View>
      </View>

      {/* Detected flash banner */}
      {detectedCode && (
        <Animated.View
          style={[styles.detectedBanner, { opacity: flashAnim }]}
          pointerEvents="none"
        >
          <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
            Detected: {detectedCode}
          </ThemedText>
        </Animated.View>
      )}

      {/* Manual entry - primary input for web */}
      <View style={styles.bottomBar}>
        <Card style={{ padding: Spacing.base, backgroundColor: 'rgba(30,30,30,0.95)' }}>
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
            {isIsbnMode ? 'Camera scan may not work on web. Type ISBN below:' : 'Camera scan may not work on web. Type barcode below:'}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder={isIsbnMode ? 'e.g. 9780134685991' : 'e.g. ACC-00001'}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: Radius.md,
                paddingHorizontal: Spacing.base,
                paddingVertical: Spacing.md,
                fontSize: 17,
              }}
              keyboardType="default"
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={() => {
                if (manualCode.trim()) {
                  handleCode(manualCode.trim());
                  setManualCode('');
                }
              }}
            />
            <Button
              label="Submit"
              variant="primary"
              size="md"
              onPress={() => {
                if (manualCode.trim()) {
                  handleCode(manualCode.trim());
                  setManualCode('');
                }
              }}
              disabled={!manualCode.trim() || barcodeMut.isPending}
            />
          </View>
        </Card>
      </View>
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
    width: 300,
    height: 180,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#fff',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.screen,
    paddingBottom: Spacing.xl,
  },
  detectedBanner: {
    position: 'absolute',
    top: 80,
    left: Spacing.screen,
    right: Spacing.screen,
    backgroundColor: '#22c55e',
    borderRadius: Radius.md,
    padding: Spacing.base,
    alignItems: 'center',
    zIndex: 10,
  },
});
