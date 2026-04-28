import React from 'react';
import {
  View, StyleSheet, ScrollView, Alert, Linking, Share,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { ThemedText, Avatar } from '../../../components/ui';
import { Spacing, Radius, Shadow, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import { ROLE_ACCESS, canAccess } from '../../../lib/roleScope';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type MenuItem = {
  icon: IoniconsName;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string;
};

const can = canAccess;

// ── Sub-components ────────────────────────────────────────────────────────────

function MenuRow({ item, colors, last }: { item: MenuItem; colors: any; last: boolean }) {
  return (
    <TouchableOpacity
      onPress={() => { haptics.light(); item.onPress(); }}
      activeOpacity={0.75}
      style={[styles.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
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
      {item.badge ? (
        <View style={[styles.badgePill, { backgroundColor: colors.brand.primary }]}>
          <ThemedText style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>{item.badge}</ThemedText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminMore() {
  const { colors } = useTheme();
  const { user, school, signOut } = useAuthStore();
  const role = user?.activeRole;

  const sections: { title: string; items: MenuItem[] }[] = [

    // Platform — super_admin only
    ...(can(role, 'onboard_school') ? [{
      title: 'Platform',
      items: [
        {
          icon: 'add-circle-outline' as IoniconsName,
          label: 'Onboard New School',
          sublabel: 'Create a new school tenant',
          onPress: () => router.push('/(app)/(admin)/school-onboarding' as any),
        },
      ],
    }] : []),

    // School management — filtered per role
    {
      title: 'Management',
      items: [
        ...(can(role, 'school_structure') ? [{ icon: 'business-outline' as IoniconsName,          label: 'School Structure',     sublabel: 'Sections, grades, streams, subjects', onPress: () => router.push('/(app)/(admin)/school-structure' as any) }] : []),
        ...(can(role, 'attendance')       ? [{ icon: 'checkbox-outline' as IoniconsName,         label: 'Attendance Overview',  sublabel: "Today's submission status",        onPress: () => router.push('/(app)/(admin)/attendance-overview' as any) }] : []),
        ...(can(role, 'marks_matrix')     ? [{ icon: 'grid-outline' as IoniconsName,              label: 'Marks Matrix',         sublabel: 'Completion overview by class',     onPress: () => router.push('/(app)/(admin)/marks-matrix' as any) }] : []),
        ...(can(role, 'reports')          ? [{ icon: 'document-text-outline' as IoniconsName,     label: 'Reports Approval',     sublabel: 'Pending & released reports',       onPress: () => router.push('/(app)/(admin)/reports' as any) }] : []),
        ...(can(role, 'staff')            ? [{ icon: 'people-outline' as IoniconsName,             label: 'Manage Staff',         sublabel: 'View, add, assign roles',          onPress: () => router.push('/(app)/(admin)/staff' as any) }] : []),
        ...(can(role, 'parents')          ? [{ icon: 'people-circle-outline' as IoniconsName,     label: 'Manage Parents',       sublabel: 'Add parents, link to students',    onPress: () => router.push('/(app)/(admin)/parents' as any) }] : []),
        ...(can(role, 'assignments')      ? [{ icon: 'git-branch-outline' as IoniconsName,        label: 'HRT / ST Assignments', sublabel: 'Assign class teachers & subjects',  onPress: () => router.push('/(app)/(admin)/assignments' as any) }] : []),
        ...(can(role, 'daybook')          ? [{ icon: 'book-outline' as IoniconsName,              label: 'Day Book',             sublabel: 'School-wide student notes',        onPress: () => router.push('/(app)/(admin)/daybook' as any) }] : []),
        ...(can(role, 'announcements')    ? [{ icon: 'megaphone-outline' as IoniconsName,         label: 'Announcements',        sublabel: 'Compose & send to school/groups',  onPress: () => router.push('/(app)/(admin)/announcements' as any) }] : []),
        ...(can(role, 'calendar')         ? [{ icon: 'calendar-outline' as IoniconsName,          label: 'Academic Calendar',    sublabel: 'Events, holidays & exam periods',  onPress: () => router.push('/(app)/(admin)/calendar' as any) }] : []),
        ...(can(role, 'timetable')        ? [{ icon: 'grid-outline' as IoniconsName,              label: 'Timetable Upload',     sublabel: 'Upload PDF/image timetables',      onPress: () => router.push('/(app)/(admin)/timetable-upload' as any) }] : []),
        ...(can(role, 'notification_log') ? [{ icon: 'notifications-outline' as IoniconsName,    label: 'Notification Log',     sublabel: 'All push & in-app notifications',  onPress: () => router.push('/(app)/(admin)/notification-log' as any) }] : []),
        ...(can(role, 'audit')            ? [{ icon: 'shield-checkmark-outline' as IoniconsName,  label: 'Audit Log',            sublabel: 'Filterable action history',        onPress: () => router.push('/(app)/(admin)/audit-log' as any) }] : []),
        ...(can(role, 'marks_windows')    ? [{ icon: 'create-outline' as IoniconsName,            label: 'Marks Windows',        sublabel: 'Open / close entry windows',       onPress: () => router.push('/(app)/(admin)/marks-windows' as any) }] : []),
        ...(can(role, 'semesters')        ? [{ icon: 'calendar-number-outline' as IoniconsName,   label: 'Semesters',            sublabel: 'Manage & activate semesters',      onPress: () => router.push('/(app)/(admin)/semesters' as any) }] : []),
        ...(can(role, 'promotion')        ? [{ icon: 'arrow-up-circle-outline' as IoniconsName,   label: 'Promotion Wizard',     sublabel: 'Year-end promote / graduate',      onPress: () => router.push('/(app)/(admin)/promotion-wizard' as any) }] : []),
        ...(can(role, 'fee_structure')   ? [{ icon: 'cash-outline' as IoniconsName,              label: 'Fee Structure',        sublabel: 'Manage fees & categories',         onPress: () => router.push('/(app)/(admin)/fee-structure' as any) }] : []),
        ...(can(role, 'backup')           ? [{ icon: 'cloud-upload-outline' as IoniconsName,     label: 'Backup to Drive',      sublabel: 'Export data to Google Drive',      onPress: () => router.push('/(app)/(admin)/backup-settings' as any) }] : []),
      ].filter(Boolean),
    },

    // Public surfaces
    ...(can(role, 'students') ? [{
      title: 'Public',
      items: [
        {
          icon: 'link-outline' as IoniconsName,
          label: 'Share Admissions Link',
          sublabel: `Public application form for ${school?.name ?? 'your school'}`,
          onPress: () => {
            const code = school?.code ?? '';
            const url = `escholr://admissions?code=${code}`;
            Share.share({ message: `Apply to ${school?.name ?? 'our school'} online: ${url}`, title: 'Admissions Link' }).catch(() => {});
          },
        },
      ],
    }] : []),

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
          ? [{ icon: 'swap-horizontal-outline' as IoniconsName, label: 'Switch Role', sublabel: `Active: ${user?.activeRole ?? ''}`, onPress: () => router.push('/(app)/switch-role' as any) }]
          : []),
        {
          icon: 'log-out-outline' as IoniconsName,
          label: 'Sign Out',
          danger: true,
          onPress: () => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ]),
        },
      ],
    },
  ].filter((s) => s.items.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand.primary }}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT }}
      >
        {/* ── Hero header ── */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brand.primary }}>
          <View style={styles.hero}>
            <View style={styles.heroAvatarRow}>
              <Avatar name={user?.fullName ?? 'A'} size={70} />
              <View style={styles.heroText}>
                <ThemedText style={styles.heroName} numberOfLines={1}>{user?.fullName ?? '—'}</ThemedText>
                <ThemedText style={styles.heroEmail} numberOfLines={1}>{user?.email}</ThemedText>
                <View style={styles.rolePill}>
                  <ThemedText style={styles.rolePillText}>
                    {user?.activeRole?.replace(/_/g, ' ').toUpperCase() ?? 'ADMIN'}
                  </ThemedText>
                </View>
              </View>
            </View>

            {school && (
              <View style={styles.schoolPill}>
                <View style={[styles.schoolDot, { backgroundColor: school.secondary_color ?? school.primary_color ?? '#F59E0B' }]} />
                <ThemedText style={styles.schoolName} numberOfLines={1}>{school.name}</ThemedText>
              </View>
            )}
          </View>
        </SafeAreaView>

        {/* ── White card body ── */}
        <View style={[styles.body, { backgroundColor: colors.background }]}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <ThemedText variant="label" color="muted" style={styles.sectionTitle}>
                {section.title.toUpperCase()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                {section.items.map((item, i) => (
                  <MenuRow key={item.label} item={item} colors={colors} last={i === section.items.length - 1} />
                ))}
              </View>
            </View>
          ))}

          <ThemedText variant="caption" color="muted" style={styles.version}>eScholr v1.0.0</ThemedText>
          <View style={{ height: TAB_BAR_HEIGHT }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    gap: Spacing.base,
  },
  heroAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  heroText: { flex: 1, gap: 3 },
  heroName: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  schoolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  schoolDot: { width: 8, height: 8, borderRadius: 4 },
  schoolName: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  body: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingTop: Spacing.lg,
    minHeight: 600,
  },
  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  sectionTitle: { marginBottom: Spacing.sm, marginLeft: 2 },
  card: { borderRadius: Radius.lg, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, gap: 2 },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  version: { textAlign: 'center', paddingVertical: Spacing.xl },
});
