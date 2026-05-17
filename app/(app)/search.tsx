/**
 * Global Search — debounced across students, staff, reports.
 * Route: /(app)/search
 */
import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { ThemedText, Avatar, Skeleton, FastList } from '../../components/ui';
import { useGlobalSearch, type GlobalSearchResult } from '../../hooks/useStudents';
import { Spacing, Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import { haptics } from '../../lib/haptics';
import { useDebounce } from '../../lib/useDebounce';

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  student: { label: 'Student', color: Colors.semantic.info,    icon: 'person-outline' },
  staff:   { label: 'Staff',   color: '#8B5CF6',               icon: 'id-card-outline' },
  report:  { label: 'Report',  color: Colors.semantic.success, icon: 'document-text-outline' },
};

export default function SearchScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 280);

  const { data: results = [], isLoading } = useGlobalSearch(schoolId, debouncedQuery);

  const handleSelect = (result: GlobalSearchResult) => {
    haptics.selection();
    if (result.type === 'student') {
      router.push({ pathname: '/(app)/student/[id]' as any, params: { id: result.id } });
    } else if (result.type === 'staff') {
      router.push('/(app)/(admin)/staff' as any);
    }
  };

  const showSkeleton = isLoading && debouncedQuery.length >= 2;
  const showEmpty = !isLoading && debouncedQuery.length >= 2 && results.length === 0;
  const showResults = !isLoading && results.length > 0;
  const showHint = debouncedQuery.length < 2;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Search bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search students, staff…"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary }]}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Spacing.sm }}>
          <ThemedText variant="body" style={{ color: colors.brand.primary, fontWeight: '600' }}>Cancel</ThemedText>
        </TouchableOpacity>
      </View>

      {showHint && (
        <View style={styles.hintContainer}>
          <Ionicons name="search-outline" size={40} color={colors.border} />
          <ThemedText variant="body" color="muted" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
            Type at least 2 characters to search
          </ThemedText>
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 4 }}>
            Searches students and staff across your school
          </ThemedText>
        </View>
      )}

      {showSkeleton && (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="35%" height={11} />
              </View>
            </View>
          ))}
        </View>
      )}

      {showEmpty && (
        <View style={styles.hintContainer}>
          <Ionicons name="search-outline" size={40} color={colors.border} />
          <ThemedText variant="body" color="muted" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
            No results for "{debouncedQuery}"
          </ThemedText>
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 4 }}>
            Try a different name or student number
          </ThemedText>
        </View>
      )}

      {showResults && (
        <FastList
          data={results}
          keyExtractor={(r) => `${r.type}-${r.id}`}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item: result }) => {
            const meta = TYPE_META[result.type] ?? TYPE_META.student;
            return (
              <TouchableOpacity
                onPress={() => handleSelect(result)}
                activeOpacity={0.8}
                style={[styles.resultRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Avatar name={result.title} photoUrl={result.photo_url} size={42} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>{result.title}</ThemedText>
                  <ThemedText variant="caption" color="muted" numberOfLines={1}>{result.subtitle}</ThemedText>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={11} color={meta.color} />
                  <ThemedText variant="caption" style={{ color: meta.color, fontWeight: '700', fontSize: 9, marginLeft: 3 }}>
                    {meta.label.toUpperCase()}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            );
          }}
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
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  input: { flex: 1, fontSize: 15 },
  hintContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
});
