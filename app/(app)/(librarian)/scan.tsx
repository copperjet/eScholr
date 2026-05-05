import React, { useState, useRef, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, Alert, TextInput, Animated, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useBookByBarcode } from '../../../hooks/useLibrary';
import { ThemedText, ScreenHeader, Button, Card } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const IS_WEB = Platform.OS === 'web';

export default function ScanScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
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
        if (Platform.OS === 'web') {
          window.alert(`No book found with barcode "${code}"`);
          processingRef.current = false;
          setDetectedCode(null);
        } else {
          Alert.alert('Not Found', `No book found with barcode "${code}"`, [
            { text: 'OK', onPress: () => { processingRef.current = false; setDetectedCode(null); } },
          ]);
        }
        return;
      }
      router.replace({ pathname: '/(app)/(librarian)/book-detail' as any, params: { bookId: foundBookId } });
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Lookup failed');
        processingRef.current = false;
        setDetectedCode(null);
      } else {
        Alert.alert('Error', e.message ?? 'Lookup failed', [
          { text: 'OK', onPress: () => { processingRef.current = false; setDetectedCode(null); } },
        ]);
      }
    }
  }, [isIsbnMode, barcodeMut, flashGreen]);

  const handleBarCodeScanned = useCallback(({ data }: { type: string; data: string }) => {
    handleCode(data);
  }, [handleCode]);

  // ── Web: camera scanning doesn't work — show clean input form ──
  if (IS_WEB) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title={isIsbnMode ? 'Enter ISBN' : 'Enter Barcode'} showBack />
        <View style={styles.webContainer}>
          <Card style={styles.webCard}>
            <ThemedText variant="h3" style={{ marginBottom: Spacing.sm }}>
              {isIsbnMode ? 'Enter ISBN' : 'Enter Barcode'}
            </ThemedText>
            <ThemedText variant="body" color="muted" style={{ marginBottom: Spacing.lg }}>
              {isIsbnMode
                ? 'Camera scanning only works in the mobile app. Type the ISBN below or use a USB barcode scanner.'
                : 'Camera scanning only works in the mobile app. Type the barcode below or use a USB barcode scanner.'}
            </ThemedText>

            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder={isIsbnMode ? 'e.g. 9780134685991' : 'e.g. ACC-00001'}
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderRadius: Radius.md,
                paddingHorizontal: Spacing.base,
                paddingVertical: Spacing.md,
                fontSize: 18,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: Spacing.base,
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
              label={barcodeMut.isPending ? 'Looking up...' : 'Submit'}
              onPress={() => {
                if (manualCode.trim()) {
                  handleCode(manualCode.trim());
                  setManualCode('');
                }
              }}
              disabled={!manualCode.trim() || barcodeMut.isPending}
              fullWidth
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // ── Native: camera with auto-scan ──
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

        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanFrame}>
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

      {detectedCode && (
        <Animated.View style={[styles.detectedBanner, { opacity: flashAnim }]} pointerEvents="none">
          <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
            Detected: {detectedCode}
          </ThemedText>
        </Animated.View>
      )}

      <View style={styles.bottomBar}>
        <Card style={{ padding: Spacing.base, backgroundColor: 'rgba(30,30,30,0.95)' }}>
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
            {isIsbnMode ? 'Or type ISBN manually:' : 'Or type barcode manually:'}
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
  webContainer:    { flex: 1, justifyContent: 'center', padding: Spacing.screen },
  webCard:         { padding: Spacing.lg },
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
