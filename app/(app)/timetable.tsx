/**
 * Shared Timetable Viewer — all roles.
 * Shows the current timetable for the user's stream/grade.
 * PDF rendered via PDFViewer (WebView on native, iframe on web); image via Image.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, PDFViewer,
} from '../../components/ui';
import { Spacing, Radius } from '../../constants/Typography';
import { useTimetableDocuments } from '../../hooks/useTimetable';

const { width: SCREEN_W } = Dimensions.get('window');

export default function TimetableViewer() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const { owner } = useLocalSearchParams<{ owner?: 'class' | 'teacher' }>();
  const ownerFilter = owner === 'teacher' ? 'teacher' : 'class';

  const { data: docs = [], isLoading, isError, refetch } = useTimetableDocuments(schoolId);

  // Filter by owner type. For teacher view, also filter to current user's staff_id when known.
  const filteredDocs = docs.filter((d) => {
    if ((d.owner_type ?? 'class') !== ownerFilter) return false;
    if (ownerFilter === 'teacher' && user?.staffId) {
      return d.staff_id === user.staffId;
    }
    return true;
  });

  // Show current docs first, then historical
  const currentDocs = filteredDocs.filter((d) => d.is_current);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedDoc = selectedId
    ? docs.find((d) => d.id === selectedId) ?? currentDocs[0] ?? null
    : currentDocs[0] ?? null;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load timetable" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Timetable</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="100%" height={40} radius={Radius.md} />
          <Skeleton width="100%" height={400} radius={Radius.lg} />
        </View>
      ) : currentDocs.length === 0 ? (
        <EmptyState
          title="No timetable available"
          description="No timetable has been uploaded yet. Check back after the school admin uploads one."
          icon="calendar-outline"
        />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Timetable switcher if multiple */}
          {currentDocs.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.switcher}
            >
              {currentDocs.map((doc) => {
                const active = (selectedDoc?.id ?? '') === doc.id;
                return (
                  <TouchableOpacity
                    key={doc.id}
                    onPress={() => setSelectedId(doc.id)}
                    style={[
                      styles.switcherChip,
                      {
                        backgroundColor: active ? colors.brand.primary + '18' : colors.surfaceSecondary,
                        borderColor: active ? colors.brand.primary : colors.border,
                      },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={{ color: active ? colors.brand.primary : colors.textMuted, fontWeight: active ? '700' : '400', fontSize: 11 }}
                    >
                      {doc.owner_type === 'teacher'
                        ? (doc.staff_name ?? 'Teacher')
                        : `${doc.grade_name ?? 'School'}${doc.stream_name ? ` · ${doc.stream_name}` : ''}`}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Doc info bar */}
          {selectedDoc && (
            <View style={[styles.infoBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons
                name={selectedDoc.file_type === 'pdf' ? 'document-text-outline' : 'image-outline'}
                size={14}
                color={colors.textMuted}
              />
              <ThemedText variant="caption" color="muted" style={{ flex: 1, marginLeft: 6 }} numberOfLines={1}>
                {selectedDoc.label}
              </ThemedText>
              <ThemedText variant="caption" color="muted">
                From {format(new Date(selectedDoc.effective_from), 'dd MMM yyyy')}
              </ThemedText>
            </View>
          )}

          {/* Viewer */}
          {selectedDoc && (
            selectedDoc.file_type === 'image' ? (
              <ScrollView
                style={{ flex: 1 }}
                maximumZoomScale={4}
                minimumZoomScale={1}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'center', padding: Spacing.sm }}
              >
                <Image
                  source={{ uri: selectedDoc.file_url }}
                  style={{ width: SCREEN_W - Spacing.base * 2, aspectRatio: 1, borderRadius: Radius.lg }}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : (
              <PDFViewer
                uri={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(selectedDoc.file_url)}`}
                style={{ flex: 1 }}
              />
            )
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  switcher: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs },
  switcherChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  infoBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  webviewLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
