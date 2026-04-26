/**
 * Parent Inbox — Day Book notes + Notifications, two tabs.
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Skeleton, EmptyState, ErrorState,
} from '../../../components/ui';
import { DayBookEntryCard } from '../../../components/modules/DayBookEntryCard';
import { useParentDayBookInbox } from '../../../hooks/useDayBook';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

type TabValue = 'daybook' | 'notifications';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  sent_at: string;
  read_at: string | null;
}

function useParentNotifications(parentId: string | null, schoolId: string) {
  return useQuery<NotificationItem[]>({
    queryKey: ['parent-notifications', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('notification_logs')
        .select('id, title, body, type, sent_at, read_at')
        .eq('school_id', schoolId)
        .eq('recipient_id', parentId)
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationItem[];
    },
  });
}

export default function ParentInboxScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const parentId = user?.staffId ?? null;

  const [activeTab, setActiveTab] = useState<TabValue>('daybook');

  const {
    data: daybookEntries = [],
    isLoading: dbLoading,
    isError: dbError,
    refetch: dbRefetch,
  } = useParentDayBookInbox(parentId, schoolId);

  const {
    data: notifications = [],
    isLoading: notifLoading,
    isError: notifError,
    refetch: notifRefetch,
  } = useParentNotifications(parentId, schoolId);

  const TABS: Array<{ value: TabValue; label: string; icon: string }> = [
    { value: 'daybook',       label: 'Day Book',      icon: 'book-outline' },
    { value: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  ];

  const isLoading = activeTab === 'daybook' ? dbLoading : notifLoading;
  const isError   = activeTab === 'daybook' ? dbError   : notifError;
  const refetch   = activeTab === 'daybook' ? dbRefetch : notifRefetch;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText variant="h4">Inbox</ThemedText>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            onPress={() => setActiveTab(tab.value)}
            style={[
              styles.tab,
              activeTab === tab.value && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 },
            ]}
          >
            <Ionicons
              name={tab.icon as any}
              size={15}
              color={activeTab === tab.value ? colors.brand.primary : colors.textMuted}
            />
            <ThemedText
              variant="caption"
              style={{
                marginLeft: 4,
                fontWeight: activeTab === tab.value ? '700' : '500',
                color: activeTab === tab.value ? colors.brand.primary : colors.textMuted,
              }}
            >
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {isError ? (
        <ErrorState title="Could not load" description="Try again." onRetry={refetch} />
      ) : isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="55%" height={13} />
                <Skeleton width="70%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : activeTab === 'daybook' ? (
        daybookEntries.length === 0 ? (
          <EmptyState
            title="No day book notes"
            description="Notes shared by your child's teachers will appear here."
            icon="book-outline"
          />
        ) : (
          <FlatList
            data={daybookEntries}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={dbLoading} onRefresh={dbRefetch} tintColor={colors.brand.primary} />}
            renderItem={({ item }) => (
              <DayBookEntryCard entry={item} showStudent showStaff />
            )}
          />
        )
      ) : (
        notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="School notifications will appear here."
            icon="notifications-outline"
          />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={notifLoading} onRefresh={notifRefetch} tintColor={colors.brand.primary} />}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.notifRow,
                  {
                    backgroundColor: item.read_at ? colors.surface : colors.brand.primary + '08',
                    borderColor: item.read_at ? colors.border : colors.brand.primary + '30',
                  },
                ]}
              >
                <View style={[styles.notifDot, { backgroundColor: item.read_at ? colors.border : colors.brand.primary }]} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <ThemedText variant="body" style={{ fontWeight: item.read_at ? '500' : '700' }}>
                    {item.title}
                  </ThemedText>
                  <ThemedText variant="bodySm" color="secondary" style={{ marginTop: 2, lineHeight: 18 }}>
                    {item.body}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
                    {format(parseISO(item.sent_at), 'dd MMM yyyy · h:mm a')}
                  </ThemedText>
                </View>
              </View>
            )}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 4,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
