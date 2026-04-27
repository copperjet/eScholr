/**
 * Notification Inbox — /(app)/notifications
 * Shared by all roles. Shows last 90 days of in-app notifications.
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subDays, parseISO, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader, IconChip, FastList,
} from '../../components/ui';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import { haptics } from '../../lib/haptics';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const NINETY_DAYS_AGO = subDays(new Date(), 90).toISOString();

const TYPE_META: Record<string, { icon: IoniconsName; color: string }> = {
  attendance_submitted: { icon: 'checkmark-circle-outline', color: Colors.semantic.success },
  report_submitted:     { icon: 'document-text-outline',    color: Colors.semantic.info },
  report_approved:      { icon: 'shield-checkmark-outline', color: Colors.semantic.success },
  report_released:      { icon: 'gift-outline',             color: Colors.semantic.success },
  report_rejected:      { icon: 'close-circle-outline',     color: Colors.semantic.error },
  daybook_note:         { icon: 'book-outline',             color: Colors.semantic.warning },
  finance_cleared:      { icon: 'card-outline',             color: Colors.semantic.success },
  system:               { icon: 'information-circle-outline', color: Colors.semantic.info },
};

function formatNotifDate(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return `Today · ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`;
  return format(d, 'd MMM yyyy');
}

function useNotifications(userId: string, schoolId: string) {
  return useQuery({
    queryKey: ['notifications', userId, schoolId],
    enabled: !!userId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('id, type, title, body, is_read, created_at, data')
        .eq('school_id', schoolId)
        .eq('recipient_id', userId)
        .gte('created_at', NINETY_DAYS_AGO)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useNotifications(user?.id ?? '', user?.schoolId ?? '');

  const markRead = useMutation({
    mutationFn: async (notifId: string) => {
      await (supabase as any).from('notifications').update({ is_read: true })
        .eq('id', notifId).eq('recipient_id', user?.id ?? '');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await (supabase as any).from('notifications').update({ is_read: true })
        .eq('school_id', user?.schoolId ?? '').eq('recipient_id', user?.id ?? '').eq('is_read', false);
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const getDeepLink = (notif: any): string | null => {
    const role = user?.activeRole;
    switch (notif.type) {
      case 'report_submitted':
      case 'report_approved':
      case 'report_rejected':
        return role === 'admin' ? '/(app)/(admin)/reports' : '/(app)/(hrt)/reports';
      case 'report_released':
        return role === 'parent' ? '/(app)/(parent)/home' : '/(app)/(admin)/reports';
      case 'daybook_note':
        return role === 'parent' ? '/(app)/(parent)/home' : '/(app)/(hrt)/daybook';
      case 'attendance_submitted':
        return role === 'hrt' ? '/(app)/(hrt)/attendance' : null;
      default:
        return null;
    }
  };

  const handlePress = useCallback((notif: any) => {
    if (!notif.is_read) markRead.mutate(notif.id);
    haptics.selection();
    const link = getDeepLink(notif);
    if (link) router.push(link as any);
  }, [markRead, user?.activeRole]);

  const unreadCount = (data ?? []).filter((n: any) => !n.is_read).length;
  const notifications = data ?? [];

  if (isError) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Notifications" showBack />
        <ErrorState title="Could not load notifications" description="Pull down to try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        showBack
        right={
          unreadCount > 0 ? (
            <Pressable onPress={() => markAllRead.mutate()} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <ThemedText style={{ color: colors.brand.primary, fontWeight: '700', fontSize: 13 }}>
                Mark all read
              </ThemedText>
            </Pressable>
          ) : null
        }
      />

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <Skeleton width={44} height={44} radius={22} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="90%" height={11} />
                <Skeleton width="40%" height={10} />
              </View>
            </View>
          ))}
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="You're all caught up"
          description="Notifications from the last 90 days will appear here."
        />
      ) : (
        <FastList
          data={notifications}
          keyExtractor={n => n.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
          renderItem={({ item: notif }) => {
            const meta = TYPE_META[notif.type] ?? TYPE_META.system;
            const isUnread = !notif.is_read;
            const hasLink = !!getDeepLink(notif);
            return (
              <Pressable
                onPress={() => handlePress(notif)}
                style={({ pressed }) => [
                  styles.notifRow,
                  { backgroundColor: isUnread ? colors.brand.primarySoft : colors.surface },
                  Shadow.sm,
                  { transform: [{ scale: pressed ? 0.99 : 1 }] },
                ]}
              >
                <IconChip
                  icon={<Ionicons name={meta.icon} size={20} color={meta.color} />}
                  bg={meta.color + '1A'}
                  size={44}
                  radius={Radius.md}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <ThemedText
                      style={{ fontSize: 14, fontWeight: isUnread ? '700' : '500', color: colors.textPrimary, flex: 1 }}
                      numberOfLines={1}
                    >
                      {notif.title}
                    </ThemedText>
                    {isUnread && <View style={[styles.dot, { backgroundColor: colors.brand.primary }]} />}
                  </View>
                  {notif.body ? (
                    <ThemedText variant="bodySm" color="muted" numberOfLines={2} style={{ marginTop: 2, lineHeight: 18 }}>
                      {notif.body}
                    </ThemedText>
                  ) : null}
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 4 }}>
                    {formatNotifDate(notif.created_at)}
                  </ThemedText>
                </View>
                {hasLink && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40, gap: Spacing.sm },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.base,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
