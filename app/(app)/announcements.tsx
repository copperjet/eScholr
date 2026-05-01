/**
 * Shared Announcements Feed — all roles except admin.
 * Read-only; marks items as read on view; shows unread badge.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../components/ui';
import { Spacing, Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import {
  useAnnouncementFeed, useReadAnnouncements, useMarkAnnouncementRead,
  type Announcement,
} from '../../hooks/useAnnouncements';

const AUDIENCE_COLORS: Record<string, string> = {
  school: Colors.semantic.info,
  grade:  '#8B5CF6',
  stream: Colors.semantic.success,
  role:   Colors.semantic.warning,
};

export default function AnnouncementsFeed() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const userId   = user?.id ?? '';
  const role     = user?.activeRole ?? '';

  const { data: items = [], isLoading, isError, refetch } = useAnnouncementFeed(schoolId, role);
  const { data: readSet = new Set<string>() } = useReadAnnouncements(userId);
  const markRead = useMarkAnnouncementRead(userId, schoolId);
  const markedRef = useRef<Set<string>>(new Set());

  // Auto-mark all visible unread items as read on mount
  useEffect(() => {
    items.forEach((item) => {
      if (!readSet.has(item.id) && !markedRef.current.has(item.id)) {
        markedRef.current.add(item.id);
        markRead.mutate(item.id);
      }
    });
  }, [items, readSet]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load announcements" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Announcements" showBack />

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={90} radius={Radius.lg} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="No announcements"
          description="You'll see school announcements here when they're published."
          icon="megaphone-outline"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: Announcement }) => {
            const isUnread = !readSet.has(item.id);
            const audColor = AUDIENCE_COLORS[item.audience_type] ?? Colors.semantic.info;
            return (
              <View style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: isUnread ? audColor + '40' : colors.border,
                  borderLeftWidth: isUnread ? 3 : StyleSheet.hairlineWidth,
                },
              ]}>
                {item.is_pinned && (
                  <View style={[styles.pinnedBadge, { backgroundColor: Colors.semantic.warning + '20' }]}>
                    <Ionicons name="pin" size={10} color={Colors.semantic.warning} />
                    <ThemedText variant="caption" style={{ color: Colors.semantic.warning, fontSize: 10, fontWeight: '700' }}>PINNED</ThemedText>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <ThemedText variant="body" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{item.title}</ThemedText>
                  {isUnread && <View style={[styles.unreadDot, { backgroundColor: audColor }]} />}
                </View>
                <ThemedText variant="bodySm" color="secondary" style={{ marginTop: 4, lineHeight: 20 }} numberOfLines={4}>
                  {item.body}
                </ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <View style={[styles.audBadge, { backgroundColor: audColor + '15' }]}>
                    <ThemedText variant="caption" style={{ color: audColor, fontSize: 10, fontWeight: '700' }}>
                      {(item.audience_label ?? item.audience_type).toUpperCase()}
                    </ThemedText>
                  </View>
                  <ThemedText variant="caption" color="muted">
                    {format(parseISO(item.published_at), 'dd/MM/yy')}
                  </ThemedText>
                  {item.author_name && (
                    <ThemedText variant="caption" color="muted">· {item.author_name}</ThemedText>
                  )}
                </View>
              </View>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  list: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 40 },
  card: {
    borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
  },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, marginBottom: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  audBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
});
