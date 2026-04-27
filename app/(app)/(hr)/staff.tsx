import React from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, Card, Avatar, EmptyState, ErrorState, SectionHeader } from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';

function useStaffList(schoolId: string) {
  return useQuery({
    queryKey: ['hr-staff-list', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name, staff_number, email, phone, department, status, staff_roles(role)')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function HRStaff() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: staff, isLoading, isError, refetch, isRefetching } = useStaffList(schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load staff" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        <View style={styles.header}>
          <ThemedText variant="h4">Staff Directory</ThemedText>
        </View>

        {isLoading ? (
          <Card style={{ margin: Spacing.screen, padding: Spacing.lg }}><ThemedText>Loading...</ThemedText></Card>
        ) : staff?.length === 0 ? (
          <EmptyState title="No staff found" description="Staff records appear once added by admin." icon="people-outline" />
        ) : (
          staff?.map((s: any) => (
            <Card key={s.id} style={{ marginHorizontal: Spacing.screen, marginBottom: Spacing.sm, padding: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Avatar name={s.full_name} size={48} />
                <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }}>{s.full_name}</ThemedText>
                  <ThemedText variant="caption" color="muted">{s.staff_number} · {s.department ?? '—'}</ThemedText>
                  <ThemedText variant="caption" color="muted">{s.email}</ThemedText>
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
});
