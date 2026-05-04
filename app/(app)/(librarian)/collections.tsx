import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  useLibraryCollections, useCreateCollection, useUpdateCollection, useDeleteCollection,
} from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, ListItem, FAB, EmptyState, ErrorState,
  BottomSheet, FormField, Button, Skeleton,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6B7280'];

export default function CollectionsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: collections, isLoading, isError, refetch, isFetching } = useLibraryCollections(schoolId);
  const createMut = useCreateCollection(schoolId);
  const updateMut = useUpdateCollection(schoolId);
  const deleteMut = useDeleteCollection(schoolId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const openCreate = () => {
    setEditId(null);
    setName('');
    setDescription('');
    setColor(PRESET_COLORS[0]);
    setSheetOpen(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setName(c.name);
    setDescription(c.description ?? '');
    setColor(c.color ?? PRESET_COLORS[0]);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Name is required.');
      return;
    }
    try {
      if (editId) {
        await updateMut.mutateAsync({ id: editId, name: name.trim(), description: description.trim(), color });
      } else {
        await createMut.mutateAsync({ name: name.trim(), description: description.trim(), color });
      }
      setSheetOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save collection');
    }
  };

  const handleDelete = (id: string, collName: string) => {
    Alert.alert('Delete Collection', `Delete "${collName}"? Books in this collection will be unlinked.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteMut.mutateAsync(id); } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not delete');
          }
        },
      },
    ]);
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Collections" showBack />
        <ErrorState title="Could not load collections" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Collections" showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={56} style={{ marginBottom: Spacing.sm, borderRadius: 12 }} />)}
          </View>
        ) : (collections ?? []).length === 0 ? (
          <EmptyState title="No collections" description="Create a collection to organize your books." />
        ) : (
          (collections ?? []).map((c) => (
            <ListItem
              key={c.id}
              title={c.name}
              subtitle={c.description ?? undefined}
              leading={<View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.color }} />}
              showChevron
              onPress={() => router.push({ pathname: '/(app)/(librarian)/collection-detail' as any, params: { collectionId: c.id, collectionName: c.name } })}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Pressable onPress={() => openEdit(c)} hitSlop={8}>
                    <Ionicons name="create-outline" size={20} color={colors.brand.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(c.id, c.name)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={Colors.semantic.error} />
                  </Pressable>
                </View>
              }
            />
          ))
        )}
        <View style={{ height: 96 }} />
      </ScrollView>

      <FAB
        icon={<Ionicons name="add" size={26} color="#fff" />}
        label="New Collection"
        onPress={openCreate}
      />

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={editId ? 'Edit Collection' : 'New Collection'}>
        <FormField label="Name *" value={name} onChangeText={setName} placeholder="e.g. Fiction, Science, History" />
        <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional description" textarea />

        <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm, marginBottom: Spacing.xs }}>Color</ThemedText>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
          {PRESET_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: 32, height: 32, borderRadius: 16, backgroundColor: c,
                borderWidth: color === c ? 3 : 0, borderColor: colors.textPrimary,
              }}
            />
          ))}
        </View>

        <View style={{ marginTop: Spacing.lg }}>
          <Button
            label={editId ? 'Save Changes' : 'Create Collection'}
            onPress={handleSave}
            loading={createMut.isPending || updateMut.isPending}
            fullWidth
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
