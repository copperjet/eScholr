import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  SectionList,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, SearchBar, ScreenHeader,
} from '../../../components/ui';
import { useAttendanceOverview, type StreamOverview } from '../../../hooks/useAttendance';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const TODAY = format(new Date(), 'yyyy-MM-dd');
const TODAY_DISPLAY = format(new Date(), 'EEE dd/MM/yy');

export default function AttendanceOverviewScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useAttendanceOverview(
    user?.schoolId ?? '',
    TODAY,
  );

  const filtered = (data ?? []).filter((s) =>
    s.streamName.toLowerCase().includes(search.toLowerCase()) ||
    s.gradeName.toLowerCase().includes(search.toLowerCase()) ||
    s.sectionName.toLowerCase().includes(search.toLowerCase()),
  );

  // Group by section
  const grouped = filtered.reduce<Record<string, StreamOverview[]>>((acc, s) => {
    const key = s.sectionName || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([title, streams]) => ({ title, data: streams }));

  const totalStreams = data?.length ?? 0;
  const submittedCount = (data ?? []).filter((s) => s.submittedToday).length;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Could not load attendance"
          description="Check your connection and try again."
          onRetry={refetch}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Attendance Overview" subtitle={TODAY_DISPLAY} showBack />

      {/* Summary banner */}
      {!isLoading && data && (
        <View style={[styles.summaryBanner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <SummaryPill
            label="Submitted"
            value={submittedCount}
            total={totalStreams}
            color={Colors.semantic.success}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SummaryPill
            label="Pending"
            value={totalStreams - submittedCount}
            total={totalStreams}
            color={Colors.semantic.warning}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SummaryPill
            label="Total streams"
            value={totalStreams}
            color={colors.brand.primary}
          />
        </View>
      )}

      {/* Search */}
      <View style={styles.searchBox}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search stream or grade…"
        />
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width="30%" height={14} />
              <View style={{ flex: 1, marginLeft: Spacing.base }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No streams found"
          description="Try a different search."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.streamId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <ThemedText variant="label" color="muted">{section.title.toUpperCase()}</ThemedText>
            </View>
          )}
          renderItem={({ item }) => (
            <StreamOverviewRow
              stream={item}
              colors={colors}
              onPress={() => {
                haptics.light();
                router.push({
                  pathname: '/(app)/(admin)/attendance-correct',
                  params: { streamId: item.streamId, date: TODAY, streamName: item.streamName },
                } as any);
              }}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function SummaryPill({
  label, value, total, color,
}: {
  label: string;
  value: number;
  total?: number;
  color: string;
}) {
  return (
    <View style={styles.pill}>
      <ThemedText variant="h4" style={{ color }}>{value}{total !== undefined ? `/${total}` : ''}</ThemedText>
      <ThemedText variant="caption" color="muted">{label}</ThemedText>
    </View>
  );
}

function StreamOverviewRow({
  stream, colors, onPress,
}: {
  stream: StreamOverview;
  colors: any;
  onPress: () => void;
}) {
  const submitted = stream.submittedToday;
  const pctColor =
    !submitted ? colors.textMuted
    : stream.presentPct >= 85 ? Colors.semantic.success
    : stream.presentPct >= 75 ? Colors.semantic.warning
    : Colors.semantic.error;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.streamRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Status dot */}
      <View style={[styles.statusDot, { backgroundColor: submitted ? Colors.semantic.success : Colors.semantic.warning }]} />

      {/* Info */}
      <View style={styles.streamInfo}>
        <ThemedText variant="body" style={{ fontWeight: '700' }}>{stream.streamName}</ThemedText>
        <ThemedText variant="caption" color="muted">
          {stream.gradeName} · {stream.totalStudents} students
          {stream.submittedByName ? ` · ${stream.submittedByName}` : ''}
        </ThemedText>
      </View>

      {/* Stats */}
      {submitted ? (
        <View style={styles.statsBlock}>
          <ThemedText variant="body" style={{ color: pctColor, fontWeight: '700' }}>
            {stream.presentPct}%
          </ThemedText>
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'right' }}>
            {stream.presentCount}P · {stream.absentCount}A
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.pendingBadge, { backgroundColor: Colors.semantic.warningLight }]}>
          <ThemedText variant="label" style={{ color: Colors.semantic.warning, fontSize: 11 }}>
            PENDING
          </ThemedText>
        </View>
      )}

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
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
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, height: 36 },
  searchBox: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  skeletonList: { padding: Spacing.base, gap: Spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  list: { paddingBottom: 40 },
  sectionHeader: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  streamInfo: { flex: 1, gap: 2 },
  statsBlock: { alignItems: 'flex-end', gap: 2 },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
});
