import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, RefreshControl, Pressable, Platform } from 'react-native';
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

type Tab = 'collection' | 'genre';

export default function CollectionsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [activeTab, setActiveTab] = useState<Tab>('collection');

  const { data: collections, isLoading: loadingC, isError: errorC, refetch: refetchC, isFetching: fetchingC } = useLibraryCollections(schoolId, 'collection');
  const { data: genres, isLoading: loadingG, isError: errorG, refetch: refetchG, isFetching: fetchingG } = useLibraryCollections(schoolId, 'genre');
  const createMut = useCreateCollection(schoolId);
  const updateMut = useUpdateCollection(schoolId);
  const deleteMut = useDeleteCollection(schoolId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const isLoading = activeTab === 'collection' ? loadingC : loadingG;
  const isError   = activeTab === 'collection' ? errorC   : errorG;
  const refetch   = activeTab === 'collection' ? refetchC : refetchG;
  const isFetching = activeTab === 'collection' ? fetchingC : fetchingG;
  const items     = (activeTab === 'collection' ? collections : genres) ?? [];

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
      if (Platform.OS === 'web') {
        window.alert('Name is required.');
      } else {
        Alert.alert('Required', 'Name is required.');
      }
      return;
    }
    try {
      if (editId) {
        await updateMut.mutateAsync({ id: editId, name: name.trim(), description: description.trim(), color });
      } else {
        await createMut.mutateAsync({ name: name.trim(), description: description.trim(), color, collectionType: activeTab });
      }
      setSheetOpen(false);
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message ?? 'Could not save');
      } else {
        Alert.alert('Error', e.message ?? 'Could not save');
      }
    }
  };

  const handleDelete = (id: string, collName: string) => {
    const msg = `Delete "${collName}"? Books in this ${activeTab} will be unlinked.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) {
        deleteMut.mutateAsync(id).catch((e: any) => { window.alert(e.message ?? 'Could not delete'); });
      }
      return;
    }
    Alert.alert(`Delete ${activeTab === 'genre' ? 'Genre' : 'Collection'}`, msg, [
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
        <ScreenHeader title="Collections & Genres" showBack />
        <ErrorState title="Could not load" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Collections & Genres" showBack />

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['collection', 'genre'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tab,
              activeTab === tab && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 },
            ]}
          >
            <ThemedText
              variant="label"
              style={{ color: activeTab === tab ? colors.brand.primary : colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              {tab === 'collection' ? 'Collections' : 'Genres'}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={56} style={{ marginBottom: Spacing.sm, borderRadius: 12 }} />)}
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            title={activeTab === 'genre' ? 'No genres' : 'No collections'}
            description={activeTab === 'genre'
              ? 'Create genres like "Mystery" or "Science Fiction" to group books by subject.'
              : 'Create a collection to organise your books.'}
          />
        ) : (
          items.map((c) => (
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
        label={activeTab === 'genre' ? 'New Genre' : 'New Collection'}
        onPress={openCreate}
      />

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editId
          ? (activeTab === 'genre' ? 'Edit Genre' : 'Edit Collection')
          : (activeTab === 'genre' ? 'New Genre' : 'New Collection')}
      >
        <FormField
          label="Name *"
          value={name}
          onChangeText={setName}
          placeholder={activeTab === 'genre' ? 'e.g. Mystery, Science Fiction' : 'e.g. Reference, Donated Books'}
        />
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
            label={editId ? 'Save Changes' : (activeTab === 'genre' ? 'Create Genre' : 'Create Collection')}
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
  safe:   { flex: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab:    { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
});
