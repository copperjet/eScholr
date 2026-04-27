import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Button, Card, Badge,
  EmptyState, ErrorState, SectionHeader,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';

function useFeeCategories(schoolId: string) {
  return useQuery({
    queryKey: ['fee-categories', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fee_categories')
        .select('*')
        .eq('school_id', schoolId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useFeeSchedules(schoolId: string, semesterId: string | null) {
  return useQuery({
    queryKey: ['fee-schedules', schoolId, semesterId],
    enabled: !!schoolId && !!semesterId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fee_schedules')
        .select('*, fee_categories(name), grades(name), streams(name)')
        .eq('school_id', schoolId)
        .eq('semester_id', semesterId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCreateFeeCategory(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { error } = await (supabase as any).from('fee_categories').insert({
        school_id: schoolId,
        name: values.name,
        description: values.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-categories'] }),
  });
}

function useCreateFeeSchedule(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: any) => {
      const { error } = await (supabase as any).from('fee_schedules').insert({
        school_id: schoolId,
        ...values,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedules'] }),
  });
}

export default function FeeStructureScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;
  const qc = useQueryClient();

  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null);

  const { data: categories, isLoading: catLoading } = useFeeCategories(schoolId);
  const { data: schedules, isLoading: schedLoading, refetch } = useFeeSchedules(schoolId, activeSemesterId);
  const createCat = useCreateFeeCategory(schoolId);
  const createSched = useCreateFeeSchedule(schoolId);

  const [showCatModal, setShowCatModal] = useState(false);
  const [catName, setCatName] = useState('');
  const handleAddCategory = () => {
    setCatName('');
    setShowCatModal(true);
  };
  const submitCategory = () => {
    if (catName.trim()) {
      createCat.mutate({ name: catName.trim() });
      setShowCatModal(false);
      setCatName('');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Fee Structure" showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={schedLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* Categories */}
        <SectionHeader title="Fee Categories" />
        {catLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : categories?.length === 0 ? (
          <EmptyState title="No categories" description="Add fee categories first." />
        ) : (
          <View style={{ marginHorizontal: Spacing.screen }}>
            {categories?.map((cat: any) => (
              <Card key={cat.id} style={{ marginBottom: Spacing.sm, padding: Spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <ThemedText style={{ fontWeight: '600' }}>{cat.name}</ThemedText>
                  <Badge label={cat.is_active ? 'Active' : 'Inactive'} preset={cat.is_active ? 'success' : 'neutral'} />
                </View>
                {cat.description && <ThemedText variant="caption" color="muted">{cat.description}</ThemedText>}
              </Card>
            ))}
            <Button label="Add Category" variant="tonal" onPress={handleAddCategory} style={{ marginTop: Spacing.md }} />
          </View>
        )}

        {/* Schedules */}
        <SectionHeader title="Fee Amounts" />
        {schedLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : schedules?.length === 0 ? (
          <EmptyState title="No fee schedules" description="Add amounts per category/grade." />
        ) : (
          schedules?.map((sched: any) => (
            <Card key={sched.id} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <ThemedText style={{ fontWeight: '600' }}>{sched.fee_categories?.name}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {sched.grades?.name ?? 'All grades'} {sched.streams?.name ?? ''}
                  </ThemedText>
                </View>
                <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>
                  {sched.amount?.toLocaleString?.() ?? sched.amount}
                </ThemedText>
              </View>
            </Card>
          ))
        )}

        {/* Add Category Modal */}
        <Modal visible={showCatModal} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ backgroundColor: colors.surface, padding: Spacing.lg, borderRadius: Radius.lg, width: '80%' }}>
              <ThemedText variant="h4" style={{ marginBottom: Spacing.md }}>New Fee Category</ThemedText>
              <TextInput
                value={catName}
                onChangeText={setCatName}
                placeholder="e.g., Tuition, Transport"
                autoFocus
                style={{
                  borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md,
                  padding: Spacing.md, marginBottom: Spacing.md, color: colors.textPrimary,
                }}
              />
              <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                <Button label="Cancel" variant="ghost" onPress={() => setShowCatModal(false)} />
                <Button label="Add" onPress={submitCategory} disabled={!catName.trim()} />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
