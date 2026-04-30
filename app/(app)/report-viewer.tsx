/**
 * Report Viewer — /app/report-viewer?report_id=&pdf_url=&student_name=
 * Shared across Parent, HRT and Admin roles.
 * Uses PDFViewer (WebView on native, iframe on web) for cross-platform PDF viewing.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../../lib/theme';
import { ThemedText, PDFViewer } from '../../components/ui';
import { Spacing } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import { haptics } from '../../lib/haptics';

export default function ReportViewerScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ report_id: string; pdf_url: string; student_name: string; is_draft?: string }>();
  const { pdf_url, student_name, is_draft } = params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

  const isDraft = is_draft === 'true';

  const viewerUri = pdf_url
    ? `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(pdf_url)}`
    : null;

  const handleShare = useCallback(async () => {
    if (!pdf_url || sharing) return;
    haptics.medium();
    setSharing(true);
    try {
      const result = await Share.share(
        { message: `Report Card${student_name ? ' — ' + student_name : ''}: ${pdf_url}`, url: pdf_url },
        { dialogTitle: `Share ${student_name ?? 'Report Card'}` },
      );
      if (result.action === Share.dismissedAction) {
        // User dismissed share sheet — open in browser as fallback
        await WebBrowser.openBrowserAsync(pdf_url).catch(() => {});
      }
    } catch {
      // fallback: open in browser
      await WebBrowser.openBrowserAsync(pdf_url).catch(() => {});
    } finally {
      setSharing(false);
    }
  }, [pdf_url, sharing, student_name]);

  if (!pdf_url) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Header student_name={student_name} isDraft={isDraft} onShare={handleShare} sharing={sharing} colors={colors} />
        <View style={styles.centerMessage}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <ThemedText variant="h4" color="muted" style={{ marginTop: Spacing.md }}>No PDF available</ThemedText>
          <ThemedText variant="body" color="muted" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
            The report PDF has not been generated yet.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Header
        student_name={student_name}
        isDraft={isDraft}
        onShare={handleShare}
        sharing={sharing}
        colors={colors}
      />

      {isDraft && (
        <View style={[styles.draftBanner, { backgroundColor: Colors.semantic.errorLight }]}>
          <Ionicons name="alert-circle" size={14} color={Colors.semantic.error} />
          <ThemedText variant="caption" style={{ color: Colors.semantic.error, marginLeft: Spacing.sm, fontWeight: '700' }}>
            DRAFT — Not approved for release
          </ThemedText>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {loading && !error && (
          <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
            <ThemedText variant="bodySm" color="muted" style={{ marginTop: Spacing.md }}>Loading report…</ThemedText>
          </View>
        )}

        {error ? (
          <View style={styles.centerMessage}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.semantic.error} />
            <ThemedText variant="body" style={{ color: Colors.semantic.error, marginTop: Spacing.md }}>
              Could not load PDF
            </ThemedText>
            <TouchableOpacity
              onPress={() => { setError(false); setLoading(true); }}
              style={[styles.retryBtn, { borderColor: colors.brand.primary }]}
            >
              <ThemedText variant="bodySm" style={{ color: colors.brand.primary, fontWeight: '600' }}>Try again</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <PDFViewer
            uri={viewerUri!}
            style={styles.webview}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
            startInLoadingState={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Header({
  student_name, isDraft, onShare, sharing, colors,
}: {
  student_name?: string; isDraft: boolean;
  onShare: () => void; sharing: boolean; colors: any;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.headerBtn}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <ThemedText variant="h4" numberOfLines={1}>{student_name ?? 'Report Card'}</ThemedText>
      </View>

      <TouchableOpacity
        onPress={onShare}
        disabled={sharing}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.headerBtn, { opacity: sharing ? 0.5 : 1 }]}
      >
        {sharing
          ? <ActivityIndicator size="small" color={colors.brand.primary} />
          : <Ionicons name="share-outline" size={22} color={colors.brand.primary} />
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  webview: { flex: 1, width: '100%' },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  centerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  pageIndicator: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
