import React, { useState } from 'react';
import {
  View, SafeAreaView, ScrollView, StyleSheet, Pressable,
  RefreshControl, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { ThemedText, ErrorState, ListItemSkeleton } from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { useImpersonationLog } from '../../../hooks/usePlatform';

export default function ImpersonationLog() {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch, isFetching } = useImpersonationLog();

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Impersonation Log</ThemedText>
          <View style={{ width: 24 }} />
        </View>
        <ErrorState title="Could not load log" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const filtered = (data ?? []).filter((entry) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      entry.target_email.toLowerCase().includes(q) ||
      (entry.reason ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Impersonation Log</ThemedText>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search email or reason…"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, fontSize: 14, color: colors.textPrimary, marginLeft: 8 }}
        />
        {!!search && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: colors.brand.primaryDark }]}>
        <Ionicons name="shield-checkmark" size={14} color="rgba(255,255,255,0.8)" />
        <ThemedText style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 6, flex: 1 }}>
          All impersonation sessions are permanently logged. Last 200 entries shown.
        </ThemedText>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
        contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: TAB_BAR_HEIGHT, gap: Spacing.sm, paddingTop: Spacing.base }}
      >
        {isLoading ? (
          [0, 1, 2, 3, 4].map((i) => <ListItemSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: colors.border }]}>
            <Ionicons name="shield-outline" size={32} color={colors.textMuted} />
            <ThemedText color="muted" style={{ marginTop: Spacing.sm, textAlign: 'center' }}>
              {search ? 'No matching sessions found.' : 'No impersonation sessions yet.'}
            </ThemedText>
          </View>
        ) : (
          filtered.map((entry) => (
            <View
              key={entry.id}
              style={[
                styles.logCard,
                { backgroundColor: colors.surface, borderColor: entry.revoked ? '#EF4444' : colors.border },
              ]}
            >
              {/* Top row */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
                <View style={[styles.iconBox, { backgroundColor: entry.revoked ? '#FEE2E2' : colors.surfaceSecondary }]}>
                  <Ionicons
                    name={entry.revoked ? 'ban-outline' : 'log-in-outline'}
                    size={16}
                    color={entry.revoked ? '#DC2626' : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                    {entry.target_email}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {format(new Date(entry.created_at), 'd MMM yyyy, HH:mm')}
                    {entry.expires_at ? ` · expires ${format(new Date(entry.expires_at), 'HH:mm')}` : ''}
                  </ThemedText>
                </View>
                {entry.revoked && (
                  <View style={styles.revokedBadge}>
                    <ThemedText style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>REVOKED</ThemedText>
                  </View>
                )}
              </View>

              {/* Reason */}
              {entry.reason ? (
                <View style={[styles.reasonBox, { backgroundColor: colors.surfaceSecondary }]}>
                  <ThemedText style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                    {entry.reason}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText variant="caption" color="muted" style={{ marginTop: 4, fontStyle: 'italic' }}>No reason recorded</ThemedText>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.screen, marginTop: Spacing.base,
    borderRadius: Radius.full, borderWidth: 1.5,
    paddingHorizontal: Spacing.base, paddingVertical: 10,
  },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.screen, marginTop: Spacing.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 8,
  },
  logCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.base, gap: Spacing.sm },
  iconBox: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  reasonBox: { borderRadius: Radius.sm, padding: Spacing.sm },
  revokedBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' },
  emptyCard: { borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', padding: Spacing['2xl'], alignItems: 'center', marginTop: Spacing.lg },
});
