import React from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Avatar } from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';

interface MenuItem {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuRow({ item, colors }: { item: MenuItem; colors: any }) {
  return (
    <TouchableOpacity
      onPress={item.onPress}
      activeOpacity={0.75}
      style={[styles.menuRow, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEE2E2' : colors.surfaceSecondary }]}>
        <Ionicons name={item.icon as any} size={20} color={item.danger ? '#EF4444' : colors.brand.primary} />
      </View>
      <View style={styles.menuText}>
        <ThemedText variant="body" style={{ color: item.danger ? '#EF4444' : undefined, fontWeight: '500' }}>
          {item.label}
        </ThemedText>
        {item.sublabel && <ThemedText variant="caption" color="muted">{item.sublabel}</ThemedText>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function FrontDeskMore() {
  const { colors } = useTheme();
  const { user, school, signOut } = useAuthStore();

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Front Desk',
      items: [
        { icon: 'chatbubble-ellipses-outline', label: 'Inquiries', sublabel: 'View and log admission inquiries', onPress: () => router.push('/(app)/(frontdesk)/inquiries' as any) },
      ],
    },
    {
      title: 'School',
      items: [
        { icon: 'megaphone-outline', label: 'Announcements', sublabel: 'School announcements', onPress: () => router.push('/(app)/announcements' as any) },
        { icon: 'calendar-outline',  label: 'Timetable',     sublabel: 'View timetable',        onPress: () => router.push('/(app)/timetable' as any) },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { icon: 'notifications-outline', label: 'Notification Inbox', onPress: () => router.push('/(app)/notifications' as any) },
      ],
    },
    {
      title: 'Resources',
      items: [
        { icon: 'library-outline', label: 'igaprep.com', sublabel: 'Homework, past papers & revision', onPress: () => Linking.openURL('https://igaprep.com').catch(() => {}) },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'person-outline',
          label: 'My Profile',
          sublabel: user?.email ?? undefined,
          onPress: () => Alert.alert(
            user?.fullName ?? 'My Profile',
            `Role: ${user?.activeRole ?? '—'}\nSchool: ${school?.name ?? '—'}\nEmail: ${user?.email ?? '—'}`,
            [{ text: 'Close', style: 'cancel' }]
          ),
        },
        ...((user?.roles ?? []).length > 1
          ? [{ icon: 'swap-horizontal-outline', label: 'Switch Role', sublabel: `Active: ${user?.activeRole ?? ''}`, onPress: () => router.push('/(app)/switch-role' as any) }]
          : []),
        {
          icon: 'log-out-outline',
          label: 'Sign Out',
          danger: true,
          onPress: () => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ]),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.profileSection, { borderBottomColor: colors.border }]}>
          <Avatar name={user?.fullName ?? 'F'} size={64} />
          <View style={styles.profileText}>
            <ThemedText variant="h4">{user?.fullName ?? '—'}</ThemedText>
            <ThemedText variant="bodySm" color="muted">{user?.email}</ThemedText>
            <View style={[styles.roleBadge, { backgroundColor: colors.brand.primary + '18' }]}>
              <ThemedText variant="label" style={{ color: colors.brand.primary }}>
                {user?.activeRole?.toUpperCase() ?? 'FRONT DESK'}
              </ThemedText>
            </View>
          </View>
        </View>

        {school && (
          <View style={[styles.schoolRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={[styles.schoolDot, { backgroundColor: school.primary_color ?? colors.brand.primary }]} />
            <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>{school.name}</ThemedText>
          </View>
        )}

        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <ThemedText variant="label" color="muted" style={styles.sectionTitle}>{section.title.toUpperCase()}</ThemedText>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {section.items.map((item, i) => <MenuRow key={i} item={item} colors={colors} />)}
            </View>
          </View>
        ))}

        <ThemedText variant="caption" color="muted" style={styles.version}>Scholr v1.0.0</ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  profileSection: { flexDirection: 'row', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.base },
  profileText: { flex: 1, gap: 4 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginTop: 4 },
  schoolRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.base, marginTop: Spacing.base, padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  schoolDot: { width: 10, height: 10, borderRadius: 5 },
  section: { marginTop: Spacing.lg, paddingHorizontal: Spacing.base },
  sectionTitle: { marginBottom: Spacing.sm },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  menuIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, gap: 2 },
  version: { textAlign: 'center', padding: Spacing.xl },
});
