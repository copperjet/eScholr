import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useLibraryDashboard, useOverdueBooks } from '../../../hooks/useLibrary';
import { ThemedText, Avatar, FAB, ErrorState, SectionHeader, StatCard, Card, IconChip, ListItem } from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';

export default function LibrarianHome() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();
  const TODAY = useMemo(() => format(new Date(), 'EEEE, d MMM'), []);
  const schoolId = user?.schoolId ?? '';

  const { data: stats, isLoading, isError, refetch, isFetching } = useLibraryDashboard(schoolId);
  const { data: overdue } = useOverdueBooks(schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load dashboard" description="Check your connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand.primary} />}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="caption" color="muted">{TODAY}</ThemedText>
            <ThemedText variant="h2">Library</ThemedText>
          </View>
          <Pressable onPress={() => router.push('/(app)/switch-role' as any)}>
            <Avatar name={user?.fullName ?? 'L'} photoUrl={school?.logo_url} size={44} />
          </Pressable>
        </View>

        {/* ── Stats grid ── */}
        <SectionHeader title="Overview" />
        <View style={styles.statRow}>
          <StatCard
            label="Total Books"
            value={isLoading ? '—' : String(stats?.total_books ?? 0)}
            icon="library-outline"
            iconBg={Colors.semantic.info + '18'}
            iconColor={Colors.semantic.info}
            onPress={() => router.push('/(app)/(librarian)/catalog' as any)}
          />
          <StatCard
            label="Available"
            value={isLoading ? '—' : String(stats?.available ?? 0)}
            icon="checkmark-circle-outline"
            iconBg={Colors.semantic.success + '18'}
            iconColor={Colors.semantic.success}
            onPress={() => router.push('/(app)/(librarian)/catalog' as any)}
          />
        </View>
        <View style={[styles.statRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="Checked Out"
            value={isLoading ? '—' : String(stats?.checked_out ?? 0)}
            icon="arrow-forward-circle-outline"
            iconBg={Colors.semantic.warning + '18'}
            iconColor={Colors.semantic.warning}
            onPress={() => router.push('/(app)/(librarian)/loans' as any)}
          />
          <StatCard
            label="Overdue"
            value={isLoading ? '—' : String(stats?.overdue ?? 0)}
            icon="alert-circle-outline"
            iconBg={Colors.semantic.error + '18'}
            iconColor={Colors.semantic.error}
            onPress={() => router.push('/(app)/(librarian)/loans' as any)}
          />
        </View>

        {/* ── Quick actions ── */}
        <SectionHeader title="Quick Actions" />
        <View style={styles.actionRow}>
          {[
            { icon: 'arrow-undo-circle-outline' as const, label: 'Check In', color: Colors.semantic.warning, route: '/(app)/(librarian)/quick-checkin' },
            { icon: 'arrow-forward-circle-outline' as const, label: 'Check Out', color: Colors.semantic.success, route: '/(app)/(librarian)/quick-checkout' },
            { icon: 'add-circle-outline' as const, label: 'Add Book', color: Colors.semantic.info, route: '/(app)/(librarian)/book-form' },
            { icon: 'people-outline' as const, label: 'Patrons', color: '#8B5CF6', route: '/(app)/(librarian)/patrons' },
          ].map((a) => (
            <Pressable key={a.label} onPress={() => router.push(a.route as any)} style={styles.actionItem}>
              <View style={[styles.actionIcon, { backgroundColor: a.color + '18' }]}>
                <Ionicons name={a.icon} size={22} color={a.color} />
              </View>
              <ThemedText variant="caption" style={{ marginTop: 6 }}>{a.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* ── Overdue books ── */}
        {(overdue ?? []).length > 0 && (
          <>
            <SectionHeader title="Overdue Books" action="View All" onAction={() => router.push('/(app)/(librarian)/loans' as any)} />
            <View style={{ paddingHorizontal: Spacing.screen }}>
              {(overdue ?? []).slice(0, 5).map((item) => (
                <ListItem
                  key={item.transaction_id}
                  title={item.book_title}
                  subtitle={`${item.borrower_name} · ${item.days_overdue}d overdue`}
                  leading={<Ionicons name="alert-circle" size={20} color={Colors.semantic.error} />}
                  onPress={() => router.push('/(app)/(librarian)/loans' as any)}
                />
              ))}
            </View>
          </>
        )}

        {/* ── Tip card ── */}
        <Card variant="tinted" style={styles.tip}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
            <IconChip
              icon={<Ionicons name="bulb-outline" size={16} color={colors.brand.primary} />}
              size={32}
              radius={16}
            />
            <ThemedText variant="bodySm" color="muted" style={{ flex: 1 }}>
              Use the barcode scanner to quickly check in or check out books. Tap Check Out to start a new loan.
            </ThemedText>
          </View>
        </Card>

        <View style={{ height: TAB_BAR_HEIGHT }} />
      </ScrollView>

      <FAB
        icon={<Ionicons name="scan" size={26} color="#fff" />}
        label="Check Out"
        onPress={() => router.push('/(app)/(librarian)/quick-checkout' as any)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingTop: Spacing.xl, paddingBottom: Spacing.base, gap: Spacing.sm },
  statRow:    { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.sm },
  actionRow:  { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: Spacing.base, justifyContent: 'space-between' },
  actionItem: { alignItems: 'center', flex: 1 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tip:         { marginHorizontal: Spacing.screen, marginTop: Spacing.lg, padding: Spacing.md },
});
