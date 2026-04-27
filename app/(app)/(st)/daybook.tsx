/**
 * Day Book — Subject Teacher view
 * ST creates entries for students they teach. Same 15-min edit window.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, FAB, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { DayBookEntryCard } from '../../../components/modules/DayBookEntryCard';
import { DayBookCreateSheet } from '../../../components/modules/DayBookCreateSheet';
import {
  useSTDayBook,
  useCreateDayBookEntry,
  useEditDayBookEntry,
  type DayBookEntry,
} from '../../../hooks/useDayBook';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

const TODAY = format(new Date(), 'yyyy-MM-dd');

function useSTStudents(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['st-students', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: sem } = await db
        .from('semesters')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!sem) return [];

      const { data: assignments } = await db
        .from('subject_assignments')
        .select('stream_id')
        .eq('staff_id', staffId)
        .eq('school_id', schoolId)
        .eq('semester_id', sem.id);
      const streamIds = ((assignments ?? []) as any[]).map((a: any) => a.stream_id);
      if (!streamIds.length) return [];

      const { data } = await db
        .from('students')
        .select('id, full_name, student_number, photo_url')
        .eq('school_id', schoolId)
        .in('stream_id', streamIds)
        .eq('is_active', true)
        .order('full_name');
      return (data ?? []) as any[];
    },
  });
}

export default function STDayBookScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editEntry, setEditEntry] = useState<DayBookEntry | null>(null);

  const { data: entries = [], isLoading, isError, refetch } = useSTDayBook(staffId, schoolId, TODAY);
  const { data: students = [] } = useSTStudents(staffId, schoolId);

  const createMutation = useCreateDayBookEntry(schoolId);
  const editMutation = useEditDayBookEntry(schoolId);

  const handleCreate = useCallback(async (params: {
    studentId: string;
    category: any;
    note: string;
    sendToParent: boolean;
  }) => {
    haptics.medium();
    try {
      await createMutation.mutateAsync({ ...params, staffId: staffId! });
      haptics.success();
      setSheetVisible(false);
    } catch {
      haptics.error();
    }
  }, [createMutation, staffId]);

  const handleEdit = useCallback(async (params: { entryId: string; note: string; sendToParent: boolean }) => {
    haptics.medium();
    try {
      await editMutation.mutateAsync(params);
      haptics.success();
      setEditEntry(null);
    } catch {
      haptics.error();
    }
  }, [editMutation]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load day book" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Day Book"
        subtitle={format(new Date(), 'EEEE, d MMM yyyy')}
        showBack
      />

      {/* Count badge */}
      {!isLoading && (
        <View style={[styles.countBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="book-outline" size={14} color={colors.brand.primary} />
          <ThemedText variant="caption" style={{ marginLeft: 6, color: colors.brand.primary, fontWeight: '600' }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} today
          </ThemedText>
        </View>
      )}

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="80%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No entries today"
          description="Tap + to add a day book note for a student."
          icon="book-outline"
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <DayBookEntryCard
              entry={item}
              showStudent
              onEdit={() => { haptics.selection(); setEditEntry(item); }}
            />
          )}
        />
      )}

      <FAB
        icon={<Ionicons name="add" size={24} color="#fff" />}
        onPress={() => { haptics.medium(); setSheetVisible(true); }}
      />

      <DayBookCreateSheet
        visible={sheetVisible || !!editEntry}
        onClose={() => { setSheetVisible(false); setEditEntry(null); }}
        students={students}
        isSaving={createMutation.isPending || editMutation.isPending}
        onSubmit={handleCreate}
        editEntry={editEntry ? {
          id: editEntry.id,
          note: editEntry.note,
          sendToParent: editEntry.send_to_parent,
          category: editEntry.category,
          studentId: editEntry.student_id,
        } : null}
        onEditSubmit={handleEdit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    alignSelf: 'flex-start',
    ...Shadow.sm,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: TAB_BAR_HEIGHT },
});
