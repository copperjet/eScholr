/**
 * PDFViewer - Cross-platform PDF viewing component
 * Uses WebView on native (iOS/Android), iframe on web
 */
import React, { useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../lib/theme';
import { ThemedText } from './ThemedText';
import { Spacing } from '../../constants/Typography';

interface PDFViewerProps {
  uri: string;
  style?: any;
  onLoad?: () => void;
  onError?: () => void;
  startInLoadingState?: boolean;
}

const isWeb = Platform.OS === 'web';

export function PDFViewer({
  uri,
  style,
  onLoad,
  onError,
  startInLoadingState = true,
}: PDFViewerProps) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(startInLoadingState);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
    onError?.();
  };

  // On web, use iframe for PDF viewing
  if (isWeb) {
    return (
      <View style={[styles.container, style]}>
        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
            <ThemedText variant="bodySm" color="muted" style={{ marginTop: Spacing.md }}>
              Loading PDF…
            </ThemedText>
          </View>
        )}
        {error ? (
          <View style={styles.errorContainer}>
            <ThemedText variant="body" color="error">
              Could not load PDF
            </ThemedText>
          </View>
        ) : (
          // Using dangerouslySetInnerHTML for iframe on web
          <View
            style={[styles.iframeContainer, style]}
            // @ts-ignore - web-only prop
            dangerouslySetInnerHTML={{
              __html: `<iframe
                src="${uri}"
                style="width: 100%; height: 100%; border: none;"
                onload="this.dataset.loaded='true'"
                onerror="this.dataset.error='true'"
              ></iframe>`,
            }}
            onLoad={handleLoad}
          />
        )}
      </View>
    );
  }

  // On native, use WebView
  return (
    <WebView
      source={{ uri }}
      style={[styles.webview, style]}
      onLoad={handleLoad}
      onError={handleError}
      startInLoadingState={startInLoadingState}
      renderLoading={() => (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
          <ThemedText variant="bodySm" color="muted" style={{ marginTop: Spacing.md }}>
            Loading PDF…
          </ThemedText>
        </View>
      )}
      javaScriptEnabled
      domStorageEnabled
      scalesPageToFit
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    width: '100%',
  },
  iframeContainer: {
    flex: 1,
    width: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
