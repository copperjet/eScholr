/**
 * Admin — Notification Delivery Log
 * Filterable log of all push + in-app notifications sent school-wide.
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, SearchBar, Skeleton, EmptyState, ErrorState, ScreenHeader, FastList,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  absence:    { label: 'Absence',    color: Colors.semantic.error,   icon: 'person-remove-outline' },
  report:     { label: 'Report',     color: Colors.semantic.success, icon: 'document-text-outline' },
  daybook:    { label: 'Day Book',   color: Colors.semantic.info,    icon: 'book-outline' },
  marks:      { label: 'Marks',      color: Colors.semantic.warning, icon: 'bar-chart-outline' },
  finance:    { label: 'Finance',    color: '#8B5CF6',               icon: 'cash-outline' },
  system:     { label: 'System',     color: '#6B7280',               icon: 'settings-outline' },
};

const FILTER_TYPES = ['all', 'absence', 'report', 'daybook', 'marks', 'finance'] as const;
type FilterType = typeof FILTER_TYPES[number];

interface NotifLog {
  id: string;
  recipient_name: string;
  type: string;
  title: string;
  body: string;
  sent_at: string;
  read_at: string | null;
}

function useNotificationLog(schoolId: string, type: FilterType, search: string) {
  return useQuery<NotifLog[]>({
    queryKey: ['notification-log', schoolId, type, search],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('notification_logs')
        .select(`
          id, type, title, body, sent_at, read_at,
          staff:recipient_id ( full_name )
        `)
        .eq('school_id', schoolId)
        .order('sent_at', { ascending: false })
        .limit(200);
      if (type !== 'all') q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;
      let rows = ((data ?? []) as any[]).map((r: any): NotifLog => ({
        id: r.id,
        recipient_name: r.staff?.full_name ?? '—',
        type: r.type,
        title: r.title,
        body: r.body,
        sent_at: r.sent_at,
        read_at: r.read_at ?? null,
      }));
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(
          (r) => r.title.toLowerCase().includes(s) || r.recipient_name.toLowerCase().includes(s),
        );
      }
      return rows;
    },
  });
}

export default function NotificationLogScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [activeType, setActiveType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading, isError, refetch } = useNotificationLog(schoolId, activeType, search);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load log" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Notification Log" showBack />

      {/* Type filter chips */}
      <View style={styles.chips}>
        {FILTER_TYPES.map((t) => {
          const meta = t === 'all' ? null : TYPE_META[t];
          const active = activeType === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveType(t)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? (meta?.color ?? colors.brand.primary) + '18' : colors.surfaceSecondary,
                  borderColor: active ? (meta?.color ?? colors.brand.primary) : colors.border,
                },
              ]}
            >
              {meta && <Ionicons name={meta.icon as any} size={12} color={active ? meta.color : colors.textMuted} />}
              <ThemedText
                variant="caption"
                style={{ marginLeft: meta ? 4 : 0, fontWeight: active ? '700' : '400', color: active ? (meta?.color ?? colors.brand.primary) : colors.textMuted, fontSize: 11 }}
              >
                {t === 'all' ? 'All' : meta!.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by title or recipient…" />
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Skeleton width="55%" height={13} />
                <Skeleton width="70%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : logs.length === 0 ? (
        <EmptyState title="No notifications" description="No notifications have been sent yet." icon="notifications-outline" />
      ) : (
        <FastList
          data={logs}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: n }) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.system;
            return (
              <View style={[styles.logRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.typeIcon, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '600', flex: 1 }}>{n.title}</ThemedText>
                    {!n.read_at && (
                      <View style={[styles.unreadDot, { backgroundColor: colors.brand.primary }]} />
                    )}
                  </View>
                  <ThemedText variant="caption" color="muted" numberOfLines={1}>{n.body}</ThemedText>
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
                    → {n.recipient_name} · {format(parseISO(n.sent_at), 'dd MMM, h:mm a')}
                  </ThemedText>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 40 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5 },
});
