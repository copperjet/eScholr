import React from 'react';
import {
  View, StyleSheet, ScrollView, Alert, Linking,
  Pressable, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Avatar } from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  icon: IoniconsName;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuRow({ item, colors, last }: { item: MenuItem; colors: any; last: boolean }) {
  return (
    <Pressable
      onPress={() => { haptics.light(); item.onPress(); }}
      style={({ pressed }) => [styles.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, { opacity: pressed ? 0.75 : 1 }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined]}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEE2E2' : colors.brand.primarySoft }]}>
        <Ionicons name={item.icon} size={19} color={item.danger ? '#EF4444' : colors.brand.primary} />
      </View>
      <View style={styles.menuText}>
        <ThemedText style={{ fontSize: 15, fontWeight: '500', color: item.danger ? '#EF4444' : colors.textPrimary }}>
          {item.label}
        </ThemedText>
        {item.sublabel ? <ThemedText variant="caption" color="muted" numberOfLines={1}>{item.sublabel}</ThemedText> : null}
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

export default function HRTMore() {
  const { colors } = useTheme();
  const { user, school, signOut } = useAuthStore();

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Class',
      items: [
        { icon: 'time-outline',          label: 'Attendance History',  sublabel: 'Past registers & stats',    onPress: () => router.push('/(app)/(hrt)/attendance-history' as any) },
        { icon: 'document-text-outline', label: 'Report Cards',        sublabel: 'View & release reports',   onPress: () => router.push('/(app)/(hrt)/reports' as any) },
        { icon: 'checkmark-done-outline', label: 'Reports Approval',  sublabel: 'Approve & add class teacher comments', onPress: () => router.push('/(app)/(hrt)/reports-approve' as any) },
        { icon: 'book-outline',          label: 'Day Book',            sublabel: 'Student daily notes',      onPress: () => router.push('/(app)/(hrt)/daybook' as any) },
        { icon: 'person-add-outline',    label: 'CREED Ratings',       sublabel: 'Character assessments',    onPress: () => router.push('/(app)/(hrt)/creed' as any) },
        { icon: 'chatbubble-ellipses-outline', label: 'Parent Messages', sublabel: 'Message parents of your students', onPress: () => router.push('/(app)/(hrt)/messages' as any) },
        { icon: 'bar-chart-outline',           label: 'Class Analysis',  sublabel: 'Performance breakdown for your class', onPress: () => router.push('/(app)/(hrt)/analysis' as any) },
      ],
    },
    {
      title: 'School',
      items: [
        { icon: 'megaphone-outline', label: 'Announcements', sublabel: 'School announcements & updates', onPress: () => router.push('/(app)/announcements' as any) },
        { icon: 'calendar-outline',  label: 'Class Timetable', sublabel: 'My class timetable',             onPress: () => router.push('/(app)/timetable?owner=class' as any) },
        { icon: 'person-outline',    label: 'My Timetable',    sublabel: 'My personal teaching schedule',  onPress: () => router.push('/(app)/timetable?owner=teacher' as any) },
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
          onPress: () => router.push('/(app)/profile' as any),
        },
        { icon: 'finger-print-outline', label: 'Biometric Login', sublabel: 'Face ID / Fingerprint', onPress: () => {} },
        ...((user?.roles ?? []).length > 1
          ? [{ icon: 'swap-horizontal-outline' as IoniconsName, label: 'Switch Role', sublabel: `Active: ${user?.activeRole ?? ''}`, onPress: () => router.push('/(app)/switch-role' as any) }]
          : []),
        {
          icon: 'log-out-outline' as IoniconsName,
          label: 'Sign Out',
          danger: true,
          onPress: () => {
            if (Platform.OS === 'web') { if (window.confirm('Are you sure you want to sign out?')) signOut(); return; }
            Alert.alert('Sign Out', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: signOut }]);
          },
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand.primary }}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brand.primary }}>
          <View style={styles.hero}>
            <View style={styles.heroAvatarRow}>
              <Avatar name={user?.fullName ?? 'T'} size={70} />
              <View style={styles.heroText}>
                <ThemedText style={styles.heroName} numberOfLines={1}>{user?.fullName ?? '—'}</ThemedText>
                <ThemedText style={styles.heroEmail} numberOfLines={1}>{user?.email}</ThemedText>
                <View style={styles.rolePill}>
                  <ThemedText style={styles.rolePillText}>CLASS TEACHER</ThemedText>
                </View>
              </View>
            </View>
            {school && (
              <View style={styles.schoolPill}>
                <View style={[styles.schoolDot, { backgroundColor: school.primary_color ?? '#F59E0B' }]} />
                <ThemedText style={styles.schoolName} numberOfLines={1}>{school.name}</ThemedText>
              </View>
            )}
          </View>
        </SafeAreaView>

        <View style={[styles.body, { backgroundColor: colors.background }]}>
          {sections.map(section => (
            <View key={section.title} style={styles.section}>
              <ThemedText variant="label" color="muted" style={styles.sectionTitle}>{section.title.toUpperCase()}</ThemedText>
              <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                {section.items.map((item, i) => (
                  <MenuRow key={i} item={item} colors={colors} last={i === section.items.length - 1} />
                ))}
              </View>
            </View>
          ))}
          <ThemedText variant="caption" color="muted" style={styles.version}>eScholr v1.0.0</ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['2xl'], gap: Spacing.base },
  heroAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  heroText: { flex: 1, gap: 3 },
  heroName: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  rolePill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginTop: 4 },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  schoolPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  schoolDot: { width: 8, height: 8, borderRadius: 4 },
  schoolName: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  body: { borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, paddingTop: Spacing.lg, minHeight: 600 },
  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  sectionTitle: { marginBottom: Spacing.sm, marginLeft: 2 },
  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  menuIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, gap: 2 },
  version: { textAlign: 'center', paddingVertical: Spacing.xl },
});
