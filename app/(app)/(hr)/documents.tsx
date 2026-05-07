import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView, Alert, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ScreenHeader, Card, ThemedText, EmptyState, ErrorState,
  FastList, Skeleton, FormField, Button, SectionHeader,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { useStaffDocuments, useUploadStaffDocument, useDeleteStaffDocument } from '../../../hooks/useStaffDocuments';
import { useStaffDetail } from '../../../hooks/useStaffRecords';

export default function HRDocuments() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const { staffId } = useLocalSearchParams<{ staffId: string }>();

  const { data: staff } = useStaffDetail(staffId ?? '', schoolId);
  const { data: docs = [], isLoading, isError, refetch } =
    useStaffDocuments(staffId ?? '', schoolId);
  const uploadMutation = useUploadStaffDocument(schoolId);
  const deleteMutation = useDeleteStaffDocument(schoolId);

  const [docType, setDocType] = useState('');
  const [notes, setNotes]     = useState('');
  const [pickedFile, setPickedFile] = useState<{ name: string; uri: string; mimeType?: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setPickedFile({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType ?? undefined });
      if (!docType) setDocType(asset.name.split('.').pop()?.toUpperCase() ?? 'Document');
    }
  };

  const handleUpload = async () => {
    if (!staffId || !pickedFile || !docType) {
      Alert.alert('Required', 'Choose a file and set a document type.');
      return;
    }
    const uploaderStaffId = user?.staffId ?? null;
    try {
      await uploadMutation.mutateAsync({
        staffId,
        uploadedBy: uploaderStaffId,
        docType:    docType.trim(),
        fileName:   pickedFile.name,
        fileUri:    pickedFile.uri,
        mimeType:   pickedFile.mimeType,
        notes:      notes || undefined,
      });
      setPickedFile(null); setDocType(''); setNotes(''); setShowForm(false);
      if (router.canGoBack()) router.back();
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Try again.');
    }
  };

  const handleDelete = (id: string, fileUrl: string) => {
    Alert.alert('Delete document?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteMutation.mutate({ id, staffId: staffId!, fileUrl }),
      },
    ]);
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Documents" showBack />
        <ErrorState title="Could not load documents" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={staff ? `${staff.full_name} — Docs` : 'Documents'}
        showBack
        right={
          <Pressable
            onPress={() => setShowForm((v) => !v)}
            style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
          </Pressable>
        }
      />

      {showForm && (
        <Card style={[styles.card, { margin: Spacing.screen }]}>
          <SectionHeader title="Upload Document" />
          <Pressable onPress={pickFile} style={[styles.filePicker, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.brand.primary} />
            <ThemedText style={{ marginLeft: Spacing.sm, color: colors.brand.primary, fontWeight: '600' }}>
              {pickedFile ? pickedFile.name : 'Choose file…'}
            </ThemedText>
          </Pressable>
          <FormField label="Document Type *" value={docType} onChangeText={setDocType} placeholder="e.g. Contract, Passport, Certificate" />
          <FormField label="Notes"           value={notes}   onChangeText={setNotes} multiline />
          <Button
            label="Upload"
            onPress={handleUpload}
            loading={uploadMutation.isPending}
            disabled={!pickedFile || !docType || uploadMutation.isPending}
          />
        </Card>
      )}

      {isLoading ? (
        <View style={{ padding: Spacing.screen, gap: Spacing.sm }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} height={72} radius={Radius.lg} />)}
        </View>
      ) : docs.length === 0 ? (
        <EmptyState title="No documents" description="Upload contracts, ID copies, and staff files." icon="document-outline" />
      ) : (
        <FastList
          data={docs}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: doc }: { item: any }) => (
            <Card style={[styles.card, styles.listCard]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <View style={[styles.docIcon, { backgroundColor: colors.brand.primary + '18' }]}>
                  <Ionicons name="document-text-outline" size={20} color={colors.brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>
                    {doc.file_name ?? doc.doc_type}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {doc.doc_type} · {format(new Date(doc.uploaded_at), 'dd MMM yyyy')}
                  </ThemedText>
                  {doc.notes && (
                    <ThemedText variant="caption" color="muted" numberOfLines={1}>{doc.notes}</ThemedText>
                  )}
                </View>
                <Pressable onPress={() => handleDelete(doc.id, doc.file_url)}>
                  <Ionicons name="trash-outline" size={18} color={Colors.semantic.error} />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  card:       { marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, gap: Spacing.sm },
  listCard:   { padding: Spacing.md, gap: 0 },
  addBtn:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  docIcon:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filePicker: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
});
