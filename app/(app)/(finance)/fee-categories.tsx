import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, Pressable, Alert, TextInput, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState, BottomSheet, Button,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import {
  useFeeCategories, useUpsertFeeCategory, useDeleteFeeCategory,
  type FeeCategory,
} from '../../../hooks/useInvoices';

function Field({ label, value, onChangeText, placeholder, hint }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText variant="label" color="muted" style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
      />
      {hint ? <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>{hint}</ThemedText> : null}
    </View>
  );
}

export default function FeeCategoriesScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: categories = [], isLoading, isError, refetch } = useFeeCategories(schoolId);
  const upsert = useUpsertFeeCategory(schoolId);
  const deleteCat = useDeleteFeeCategory(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Partial<FeeCategory> | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sageAccount, setSageAccount] = useState('');

  const openNew = useCallback(() => {
    setEditing(null);
    setName(''); setDescription(''); setSageAccount('');
    setSheetVisible(true);
  }, []);

  const openEdit = useCallback((cat: FeeCategory) => {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description ?? '');
    setSageAccount(cat.sage_revenue_account ?? '');
    setSheetVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    haptics.medium();
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        name: name.trim(),
        description: description.trim() || null,
        sage_revenue_account: sageAccount.trim() || null,
        is_active: true,
      } as any);
      haptics.success();
      setSheetVisible(false);
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not save category.');
    }
  }, [name, description, sageAccount, editing, upsert]);

  const handleDelete = useCallback((cat: FeeCategory) => {
    Alert.alert('Delete Category', `Delete "${cat.name}"? This will fail if any fee schedules use it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          haptics.medium();
          try {
            await deleteCat.mutateAsync(cat.id);
            haptics.success();
          } catch {
            haptics.error();
            Alert.alert('Error', 'Cannot delete — fee schedules may reference this category.');
          }
        },
      },
    ]);
  }, [deleteCat]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Fee Categories" showBack />
        <ErrorState title="Could not load categories" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Fee Categories"
        showBack
        right={
          <Pressable onPress={openNew} style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.row, { backgroundColor: colors.surface }, Shadow.sm]}>
              <Skeleton width={160} height={16} />
              <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
            </View>
          ))
        ) : categories.length === 0 ? (
          <EmptyState
            title="No fee categories"
            description="Create categories like Tuition, Transport, Uniform."
            icon="pricetag-outline"
          />
        ) : (
          categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => openEdit(cat)}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }, Shadow.sm]}
            >
              <View style={[styles.catIcon, { backgroundColor: cat.is_active ? colors.brand.primarySoft : colors.surfaceSecondary }]}>
                <Ionicons name="pricetag-outline" size={18} color={cat.is_active ? colors.brand.primary : colors.textMuted} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText variant="h4">{cat.name}</ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                  {cat.description ? (
                    <ThemedText variant="caption" color="muted" numberOfLines={1}>{cat.description}</ThemedText>
                  ) : null}
                  {cat.sage_revenue_account ? (
                    <View style={[styles.sagePill, { backgroundColor: Colors.semantic.successLight }]}>
                      <ThemedText style={{ fontSize: 10, fontWeight: '600', color: Colors.semantic.success }}>
                        Sage: {cat.sage_revenue_account}
                      </ThemedText>
                    </View>
                  ) : null}
                  {!cat.is_active && (
                    <View style={[styles.sagePill, { backgroundColor: colors.surfaceSecondary }]}>
                      <ThemedText style={{ fontSize: 10, color: colors.textMuted }}>Inactive</ThemedText>
                    </View>
                  )}
                </View>
              </View>
              <Pressable
                onPress={() => handleDelete(cat)}
                hitSlop={10}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={17} color={Colors.semantic.error} />
              </Pressable>
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editing ? 'Edit Category' : 'New Fee Category'}
        snapHeight={420}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Field label="NAME" value={name} onChangeText={setName} placeholder="e.g. Tuition" />
          <Field label="DESCRIPTION (optional)" value={description} onChangeText={setDescription} placeholder="e.g. Annual tuition fees" />
          <Field
            label="SAGE REVENUE ACCOUNT (optional)"
            value={sageAccount}
            onChangeText={setSageAccount}
            placeholder="e.g. 4000/001"
            hint="Sage GL account code for this revenue type. Used when exporting to Sage."
          />
          <View style={{ gap: Spacing.sm, marginTop: Spacing.base }}>
            <Button
              label={upsert.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'}
              variant="primary"
              fullWidth
              loading={upsert.isPending}
              onPress={handleSave}
            />
            <Button label="Cancel" variant="secondary" fullWidth onPress={() => setSheetVisible(false)} />
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg,
  },
  catIcon: {
    width: 40, height: 40, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  sagePill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
  },
  deleteBtn: { padding: 4 },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: Spacing.md },
  fieldLabel: { marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
  },
});
