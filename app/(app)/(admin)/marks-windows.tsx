/**
 * Admin — Marks Window Management
 * Open / close marks entry windows per subject × stream × assessment type.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  useMarksWindows,
  useToggleMarksWindow,
  useBulkSetMarksWindows,
  type MarksWindow,
} from '../../../hooks/useAdmin';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type FilterTab = 'all' | 'open' | 'closed';

const ASSESSMENT_COLORS: Record<string, string> = {
  FA1:       Colors.semantic.info,
  FA2:       Colors.semantic.warning,
  Summative: Colors.semantic.error,
};

export default function MarksWindowsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const { data: windows = [], isLoading, isError, refetch } = useMarksWindows(schoolId);
  const toggleMutation = useToggleMarksWindow(schoolId);
  const bulkMutation = useBulkSetMarksWindows(schoolId);

  const handleToggle = useCallback((win: MarksWindow, open: boolean) => {
    const action = open ? 'Open' : 'Close';
    Alert.alert(
      `${action} Window`,
      `${action} marks entry for ${win.subject_name} · ${win.grade_name} ${win.stream_name} · ${win.assessment_type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          onPress: async () => {
            haptics.medium();
            try {
              await toggleMutation.mutateAsync({
                windowId: win.id,
                open,
                staffId: user!.staffId!,
              });
              haptics.success();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not update window. Try again.');
            }
          },
        },
      ],
    );
  }, [toggleMutation, user]);

  const handleBulk = useCallback((open: boolean) => {
    const semId = windows[0]?.semester_id;
    if (!semId) return;
    const semName = windows[0]?.semester_name ?? 'this semester';
    const action = open ? 'Open all' : 'Close all';
    Alert.alert(
      `${action} windows?`,
      `${open ? 'Open' : 'Close'} all marks entry windows for ${semName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: open ? 'default' : 'destructive',
          onPress: async () => {
            haptics.medium();
            try {
              await bulkMutation.mutateAsync({ semesterId: semId, open, staffId: user!.staffId! });
              haptics.success();
            } catch {
              haptics.error();
            }
          },
        },
      ],
    );
  }, [windows, bulkMutation, user]);

  const filtered = windows.filter((w) => {
    if (filterTab === 'open') return w.is_open;
    if (filterTab === 'closed') return !w.is_open;
    return true;
  });

  const openCount   = windows.filter((w) => w.is_open).length;
  const closedCount = windows.filter((w) => !w.is_open).length;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load windows" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Marks Windows" showBack />

      {/* Bulk actions */}
      {!isLoading && windows.length > 0 && (
        <View style={[styles.bulkRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => handleBulk(true)}
            disabled={bulkMutation.isPending || openCount === windows.length}
            style={[styles.bulkBtn, { backgroundColor: Colors.semantic.success + '18', borderColor: Colors.semantic.success + '40' }]}
          >
            <Ionicons name="lock-open-outline" size={14} color={Colors.semantic.success} />
            <ThemedText variant="caption" style={{ color: Colors.semantic.success, fontWeight: '700', marginLeft: 4 }}>
              Open All ({closedCount})
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleBulk(false)}
            disabled={bulkMutation.isPending || closedCount === windows.length}
            style={[styles.bulkBtn, { backgroundColor: Colors.semantic.error + '18', borderColor: Colors.semantic.error + '40' }]}
          >
            <Ionicons name="lock-closed-outline" size={14} color={Colors.semantic.error} />
            <ThemedText variant="caption" style={{ color: Colors.semantic.error, fontWeight: '700', marginLeft: 4 }}>
              Close All ({openCount})
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['all', 'open', 'closed'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilterTab(tab)}
            style={[styles.tab, filterTab === tab && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 }]}
          >
            <ThemedText
              variant="caption"
              style={{
                fontWeight: filterTab === tab ? '700' : '500',
                color: filterTab === tab ? colors.brand.primary : colors.textMuted,
                fontSize: 11,
                textTransform: 'capitalize',
              }}
            >
              {tab}{tab === 'open' ? ` (${openCount})` : tab === 'closed' ? ` (${closedCount})` : ` (${windows.length})`}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="55%" height={13} />
                <Skeleton width="35%" height={11} />
              </View>
              <Skeleton width={44} height={24} radius={12} />
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No windows"
          description="No marks windows configured for the active semester."
          icon="create-outline"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: win }) => {
            const assessColor = ASSESSMENT_COLORS[win.assessment_type] ?? colors.brand.primary;
            const now = new Date();
            const withinSchedule = isAfter(now, parseISO(win.opens_at)) && isBefore(now, parseISO(win.closes_at));

            return (
              <View style={[styles.windowRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.assessBadge, { backgroundColor: assessColor + '15' }]}>
                  <ThemedText variant="caption" style={{ color: assessColor, fontWeight: '800', fontSize: 10 }}>
                    {win.assessment_type}
                  </ThemedText>
                </View>

                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>
                    {win.subject_name}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {win.grade_name} · {win.stream_name}
                  </ThemedText>
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 1 }}>
                    {format(parseISO(win.opens_at), 'dd MMM')} – {format(parseISO(win.closes_at), 'dd MMM yyyy')}
                    {withinSchedule && (
                      <ThemedText variant="caption" style={{ color: Colors.semantic.success }}> · In schedule</ThemedText>
                    )}
                  </ThemedText>
                  {win.locked_by_name && !win.is_open && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.warning, marginTop: 1 }}>
                      Closed by {win.locked_by_name}
                    </ThemedText>
                  )}
                </View>

                <Switch
                  value={win.is_open}
                  onValueChange={(v) => handleToggle(win, v)}
                  disabled={toggleMutation.isPending}
                  trackColor={{ true: Colors.semantic.success, false: colors.border }}
                  thumbColor={win.is_open ? '#fff' : colors.textMuted}
                />
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
  bulkRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 4,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40 },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  assessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    minWidth: 72,
    alignItems: 'center',
  },
});
