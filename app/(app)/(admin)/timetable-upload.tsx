/**
 * Admin — Timetable Upload
 * Upload PDF or image timetable per grade/stream.
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import {
  useTimetableDocuments, useUploadTimetable, useDeleteTimetable,
  uploadTimetableFile, type TimetableDocument,
} from '../../../hooks/useTimetable';

const db = supabase as any;

interface Grade  { id: string; name: string; }
interface Stream { id: string; name: string; grade_id: string; }

function useGradesAndStreams(schoolId: string) {
  return useQuery<{ grades: Grade[]; streams: Stream[] }>({
    queryKey: ['grades-streams', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const [gr, st] = await Promise.all([
        db.from('grades').select('id, name').eq('school_id', schoolId).order('order_index'),
        db.from('streams').select('id, name, grade_id').eq('school_id', schoolId).order('name'),
      ]);
      return {
        grades:  (gr.data  ?? []) as Grade[],
        streams: (st.data ?? []) as Stream[],
      };
    },
  });
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TimetableUploadScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: meta, isLoading: metaLoading } = useGradesAndStreams(schoolId);
  const { data: docs = [], isLoading: docsLoading, isError, refetch } = useTimetableDocuments(schoolId);
  const uploadMutation = useUploadTimetable();
  const deleteMutation = useDeleteTimetable(schoolId);

  // Form state
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [uploading, setUploading] = useState(false);

  const streamsForGrade = (meta?.streams ?? []).filter((s) => s.grade_id === selectedGradeId);

  const handlePickAndUpload = useCallback(async () => {
    if (!label.trim()) {
      Alert.alert('Label required', 'Enter a label before uploading.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const file = result.assets[0];
      const isImage = file.mimeType?.startsWith('image/') ?? false;
      const fileType: 'pdf' | 'image' = isImage ? 'image' : 'pdf';

      setUploading(true);
      haptics.medium();

      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const publicUrl = await uploadTimetableFile({
        schoolId,
        fileName: file.name,
        base64,
        mimeType: file.mimeType ?? 'application/pdf',
      });

      await uploadMutation.mutateAsync({
        school_id: schoolId,
        grade_id: selectedGradeId,
        stream_id: selectedStreamId,
        label: label.trim(),
        file_url: publicUrl,
        file_type: fileType,
        file_name: file.name,
        file_size_bytes: file.size ?? null,
        effective_from: effectiveFrom,
        uploaded_by: user?.id ?? '',
      });

      haptics.success();
      setLabel('');
      Alert.alert('Uploaded', 'Timetable has been uploaded successfully.');
    } catch (err: any) {
      haptics.error();
      Alert.alert('Upload failed', err.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  }, [label, selectedGradeId, selectedStreamId, effectiveFrom, schoolId, user?.id, uploadMutation]);

  const handleDelete = useCallback((doc: TimetableDocument) => {
    Alert.alert('Delete Timetable', `Remove "${doc.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(doc.id) },
    ]);
  }, [deleteMutation]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load timetables" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Timetable Upload" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Upload form */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText variant="h4" style={{ marginBottom: Spacing.md }}>Upload New Timetable</ThemedText>

          {/* Label */}
          <ThemedText variant="label" color="muted" style={styles.fieldLabel}>LABEL</ThemedText>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Grade 10A — Term 1 2026"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
          />

          {/* Grade picker */}
          <ThemedText variant="label" color="muted" style={[styles.fieldLabel, { marginTop: Spacing.md }]}>GRADE (OPTIONAL)</ThemedText>
          {metaLoading ? (
            <Skeleton width="100%" height={36} radius={Radius.md} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
              <TouchableOpacity
                onPress={() => { setSelectedGradeId(null); setSelectedStreamId(null); }}
                style={[styles.chip, {
                  backgroundColor: !selectedGradeId ? colors.brand.primary + '18' : colors.surfaceSecondary,
                  borderColor: !selectedGradeId ? colors.brand.primary : colors.border,
                }]}
              >
                <ThemedText variant="caption" style={{ color: !selectedGradeId ? colors.brand.primary : colors.textMuted, fontWeight: !selectedGradeId ? '700' : '400', fontSize: 11 }}>
                  All Grades
                </ThemedText>
              </TouchableOpacity>
              {(meta?.grades ?? []).map((g) => (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => { setSelectedGradeId(g.id); setSelectedStreamId(null); }}
                  style={[styles.chip, {
                    backgroundColor: selectedGradeId === g.id ? colors.brand.primary + '18' : colors.surfaceSecondary,
                    borderColor: selectedGradeId === g.id ? colors.brand.primary : colors.border,
                  }]}
                >
                  <ThemedText variant="caption" style={{ color: selectedGradeId === g.id ? colors.brand.primary : colors.textMuted, fontWeight: selectedGradeId === g.id ? '700' : '400', fontSize: 11 }}>
                    {g.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Stream picker */}
          {selectedGradeId && streamsForGrade.length > 0 && (
            <>
              <ThemedText variant="label" color="muted" style={[styles.fieldLabel, { marginTop: Spacing.md }]}>STREAM (OPTIONAL)</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
                <TouchableOpacity
                  onPress={() => setSelectedStreamId(null)}
                  style={[styles.chip, {
                    backgroundColor: !selectedStreamId ? colors.brand.primary + '18' : colors.surfaceSecondary,
                    borderColor: !selectedStreamId ? colors.brand.primary : colors.border,
                  }]}
                >
                  <ThemedText variant="caption" style={{ color: !selectedStreamId ? colors.brand.primary : colors.textMuted, fontSize: 11, fontWeight: !selectedStreamId ? '700' : '400' }}>
                    All Streams
                  </ThemedText>
                </TouchableOpacity>
                {streamsForGrade.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setSelectedStreamId(s.id)}
                    style={[styles.chip, {
                      backgroundColor: selectedStreamId === s.id ? colors.brand.primary + '18' : colors.surfaceSecondary,
                      borderColor: selectedStreamId === s.id ? colors.brand.primary : colors.border,
                    }]}
                  >
                    <ThemedText variant="caption" style={{ color: selectedStreamId === s.id ? colors.brand.primary : colors.textMuted, fontSize: 11, fontWeight: selectedStreamId === s.id ? '700' : '400' }}>
                      {s.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Effective from */}
          <ThemedText variant="label" color="muted" style={[styles.fieldLabel, { marginTop: Spacing.md }]}>EFFECTIVE FROM</ThemedText>
          <TextInput
            value={effectiveFrom}
            onChangeText={setEffectiveFrom}
            placeholder="yyyy-mm-dd"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
          />

          {/* Upload button */}
          <TouchableOpacity
            onPress={handlePickAndUpload}
            disabled={uploading}
            style={[styles.uploadBtn, { backgroundColor: uploading ? colors.border : colors.brand.primary }]}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                  Choose PDF or Image
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Existing timetables */}
        <ThemedText variant="label" color="muted" style={{ marginTop: Spacing.xl, marginBottom: Spacing.sm }}>
          UPLOADED TIMETABLES
        </ThemedText>

        {docsLoading ? (
          <View style={{ gap: Spacing.sm }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={70} radius={Radius.lg} />
            ))}
          </View>
        ) : docs.length === 0 ? (
          <EmptyState title="No timetables yet" description="Upload a timetable above." icon="document-outline" />
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {docs.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                onLongPress={() => handleDelete(doc)}
                activeOpacity={0.85}
                style={[styles.docRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.docIcon, { backgroundColor: doc.file_type === 'pdf' ? Colors.semantic.error + '15' : Colors.semantic.info + '15' }]}>
                  <Ionicons
                    name={doc.file_type === 'pdf' ? 'document-text-outline' : 'image-outline'}
                    size={20}
                    color={doc.file_type === 'pdf' ? Colors.semantic.error : Colors.semantic.info}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>{doc.label}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {doc.grade_name ? `${doc.grade_name}${doc.stream_name ? ` · ${doc.stream_name}` : ''}` : 'Whole School'}
                    {' · '}
                    {format(new Date(doc.effective_from), 'dd MMM yyyy')}
                    {doc.file_size_bytes ? ` · ${formatBytes(doc.file_size_bytes)}` : ''}
                  </ThemedText>
                </View>
                {doc.is_current && (
                  <View style={[styles.currentBadge, { backgroundColor: Colors.semantic.success + '20' }]}>
                    <ThemedText variant="caption" style={{ color: Colors.semantic.success, fontSize: 10, fontWeight: '700' }}>CURRENT</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ThemedText variant="caption" color="muted" style={styles.hint}>
          Long-press any timetable to delete it. Uploading a new timetable for the same grade/stream will automatically replace the current one.
        </ThemedText>
      </ScrollView>
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
  content: { padding: Spacing.base, paddingBottom: 60 },
  section: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.base },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.base },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  docIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  hint: { marginTop: Spacing.base, textAlign: 'center', lineHeight: 18 },
});
