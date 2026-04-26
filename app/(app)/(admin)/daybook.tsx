/**
 * Admin Day Book — school-wide entries, search, archive action.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, SearchBar, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { DayBookEntryCard } from '../../../components/modules/DayBookEntryCard';
import { useAdminDayBook, useArchiveDayBookEntry } from '../../../hooks/useDayBook';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type ViewMode = 'active' | 'archived';

export default function AdminDayBookScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<ViewMode>('active');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: entries = [], isLoading, isError, refetch } = useAdminDayBook(schoolId, {
    date: mode === 'active' ? date : undefined,
    search: search.trim() || undefined,
    archived: mode === 'archived',
  });

  const archiveMutation = useArchiveDayBookEntry(schoolId);

  const handleArchive = useCallback((id: string, studentName: string) => {
    Alert.alert(
      'Archive Entry',
      `Archive this entry for ${studentName}? It will no longer appear in the active day book.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            haptics.medium();
            try {
              await archiveMutation.mutateAsync(id);
              haptics.success();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not archive this entry.');
            }
          },
        },
      ],
    );
  }, [archiveMutation]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load day book" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Day Book" showBack />

      {/* Mode toggle */}
      <View style={[styles.modeBar, { borderBottomColor: colors.border }]}>
        {(['active', 'archived'] as ViewMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={[styles.modeTab, mode === m && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 }]}
          >
            <ThemedText
              variant="caption"
              style={{ fontWeight: mode === m ? '700' : '500', color: mode === m ? colors.brand.primary : colors.textMuted, fontSize: 11 }}
            >
              {m === 'active' ? 'Today' : 'Archived'}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search student or note…" />
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="55%" height={13} />
                <Skeleton width="75%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : entries.length === 0 ? (
        <EmptyState
          title={mode === 'archived' ? 'No archived entries' : 'No entries today'}
          description={mode === 'archived' ? 'Archived day book entries will appear here.' : 'No day book entries have been added yet.'}
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
              showStaff
              onArchive={mode === 'active' ? () => handleArchive(item.id, item.student.full_name) : undefined}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  modeBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
});
