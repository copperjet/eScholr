/**
 * Admin Audit Log — filterable, searchable audit trail.
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
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
  ThemedText, SearchBar, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  bulk_finance_clear:    { label: 'Finance Clear',    color: '#8B5CF6',               icon: 'cash-outline' },
  inquiry_converted:     { label: 'Enrollment',       color: Colors.semantic.success, icon: 'person-add-outline' },
  mark_corrected:        { label: 'Mark Corrected',   color: Colors.semantic.warning, icon: 'create-outline' },
  attendance_corrected:  { label: 'Attendance Fix',   color: Colors.semantic.info,    icon: 'checkbox-outline' },
  report_approved:       { label: 'Report Approved',  color: Colors.semantic.success, icon: 'document-text-outline' },
  marks_window_unlocked: { label: 'Window Unlocked',  color: Colors.semantic.error,   icon: 'lock-open-outline' },
};

const FILTER_ACTIONS = ['all', ...Object.keys(ACTION_META)] as const;
type FilterAction = typeof FILTER_ACTIONS[number];

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  performer_name: string;
  performed_at: string;
  meta: Record<string, any> | null;
}

function useAuditLog(schoolId: string, action: FilterAction, search: string) {
  return useQuery<AuditEntry[]>({
    queryKey: ['audit-log', schoolId, action, search],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('audit_logs')
        .select(`
          id, action, entity_type, entity_id, performed_at, meta,
          staff:performed_by ( full_name )
        `)
        .eq('school_id', schoolId)
        .order('performed_at', { ascending: false })
        .limit(200);
      if (action !== 'all') q = q.eq('action', action);
      const { data, error } = await q;
      if (error) throw error;

      let rows = ((data ?? []) as any[]).map((r: any): AuditEntry => ({
        id: r.id,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id ?? null,
        performer_name: r.staff?.full_name ?? '—',
        performed_at: r.performed_at,
        meta: r.meta ?? null,
      }));

      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(
          (r) => r.action.toLowerCase().includes(s) || r.performer_name.toLowerCase().includes(s),
        );
      }
      return rows;
    },
  });
}

function metaSnippet(meta: Record<string, any> | null): string {
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.count !== undefined) parts.push(`${meta.count} records`);
  if (meta.note) parts.push(`"${String(meta.note).slice(0, 40)}"`);
  if (meta.studentId) parts.push(`student ${String(meta.studentId).slice(0, 8)}…`);
  return parts.join(' · ');
}

export default function AuditLogScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [activeAction, setActiveAction] = useState<FilterAction>('all');
  const [search, setSearch] = useState('');

  const { data: entries = [], isLoading, isError, refetch } = useAuditLog(schoolId, activeAction, search);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load audit log" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Audit Log" showBack />

      {/* Filter chips */}
      <View style={styles.chips}>
        {FILTER_ACTIONS.map((a) => {
          const meta = a === 'all' ? null : ACTION_META[a];
          const active = activeAction === a;
          return (
            <TouchableOpacity
              key={a}
              onPress={() => setActiveAction(a)}
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
                {a === 'all' ? 'All' : meta!.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by action or performer…" />
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
      ) : entries.length === 0 ? (
        <EmptyState title="No audit entries" description="Audited actions will appear here." icon="shield-checkmark-outline" />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: entry }) => {
            const meta = ACTION_META[entry.action] ?? { label: entry.action, color: '#6B7280', icon: 'ellipsis-horizontal-outline' };
            const snippet = metaSnippet(entry.meta);
            return (
              <View style={[styles.entryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.actionIcon, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '700', flex: 1 }}>{meta.label}</ThemedText>
                    <ThemedText variant="caption" style={{ color: meta.color, fontWeight: '600', fontSize: 10 }}>
                      {entry.entity_type.replace(/_/g, ' ')}
                    </ThemedText>
                  </View>
                  {snippet ? (
                    <ThemedText variant="caption" color="muted" numberOfLines={1}>{snippet}</ThemedText>
                  ) : null}
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
                    {entry.performer_name} · {format(parseISO(entry.performed_at), 'dd MMM yyyy, h:mm a')}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 40 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
