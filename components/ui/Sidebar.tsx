/**
 * Desktop Sidebar Navigation — shown on tablet/desktop instead of bottom tabs.
 * Mirrors the structure of AppTabBar but in a vertical sidebar layout.
 */
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { ThemedText } from './ThemedText';
import { PressableScale } from './PressableScale';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { Radius, Spacing } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles?: string[]; // Optional: restrict to specific roles
}

// Define navigation structure for each role
const ROLE_NAV_ITEMS: Record<string, NavItem[]> = {
  super_admin: [
    { path: '/(app)/(platform)', label: 'Schools', icon: 'grid-outline' },
    { path: '/(app)/(platform)/metrics', label: 'Metrics', icon: 'bar-chart-outline' },
    { path: '/(app)/(platform)/impersonation-log', label: 'Audit', icon: 'shield-outline' },
    { path: '/(app)/(platform)/more', label: 'Account', icon: 'person-circle-outline' },
  ],
  admin: [
    { path: '/(app)/(admin)', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(admin)/students', label: 'Students', icon: 'people-outline' },
    { path: '/(app)/(admin)/staff', label: 'Staff', icon: 'briefcase-outline' },
    { path: '/(app)/(admin)/reports', label: 'Reports', icon: 'document-text-outline' },
    { path: '/(app)/(admin)/attendance-overview', label: 'Attendance', icon: 'calendar-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(admin)/more', label: 'More', icon: 'menu-outline' },
  ],
  hrt: [
    { path: '/(app)/(hrt)/home', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(hrt)/students', label: 'My Class', icon: 'people-outline' },
    { path: '/(app)/(hrt)/attendance', label: 'Attendance', icon: 'calendar-outline' },
    { path: '/(app)/(hrt)/marks', label: 'Marks', icon: 'create-outline' },
    { path: '/(app)/(hrt)/homework', label: 'Homework', icon: 'book-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(hrt)/more', label: 'More', icon: 'menu-outline' },
  ],
  st: [
    { path: '/(app)/(st)/home', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(st)/students', label: 'Students', icon: 'people-outline' },
    { path: '/(app)/(st)/marks', label: 'Marks', icon: 'create-outline' },
    { path: '/(app)/(st)/homework', label: 'Homework', icon: 'book-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(st)/more', label: 'More', icon: 'menu-outline' },
  ],
  finance: [
    { path: '/(app)/(finance)', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(finance)/finance-reports', label: 'Reports', icon: 'bar-chart-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(finance)/more', label: 'More', icon: 'menu-outline' },
  ],
  hr: [
    { path: '/(app)/(hr)', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(hr)/staff', label: 'Staff', icon: 'people-outline' },
    { path: '/(app)/(hr)/leave', label: 'Leave', icon: 'calendar-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(hr)/more', label: 'More', icon: 'menu-outline' },
  ],
  frontdesk: [
    { path: '/(app)/(frontdesk)', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(frontdesk)/inquiries', label: 'Inquiries', icon: 'chatbubble-outline' },
    { path: '/(app)/(frontdesk)/visitors', label: 'Visitors', icon: 'people-outline' },
    { path: '/(app)/(frontdesk)/applications', label: 'Applications', icon: 'document-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(frontdesk)/more', label: 'More', icon: 'menu-outline' },
  ],
  parent: [
    { path: '/(app)/(parent)', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(parent)/homework', label: 'Homework', icon: 'book-outline' },
    { path: '/(app)/(parent)/reports', label: 'Reports', icon: 'document-text-outline' },
    { path: '/(app)/(parent)/fees', label: 'Fees', icon: 'cash-outline' },
    { path: '/(app)/(parent)/messages', label: 'Messages', icon: 'chatbubble-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(parent)/more', label: 'More', icon: 'menu-outline' },
  ],
  student: [
    { path: '/(app)/(student)', label: 'Dashboard', icon: 'grid-outline' },
    { path: '/(app)/(student)/marks', label: 'Marks', icon: 'school-outline' },
    { path: '/(app)/(student)/reports', label: 'Reports', icon: 'document-text-outline' },
    { path: '/(app)/(student)/homework', label: 'Homework', icon: 'book-outline' },
    { path: '/(app)/announcements', label: 'Announcements', icon: 'megaphone-outline' },
    { path: '/(app)/(student)/more', label: 'More', icon: 'menu-outline' },
  ],
  librarian: [
    { path: '/(app)/(librarian)/home',        label: 'Dashboard',   icon: 'grid-outline' },
    { path: '/(app)/(librarian)/catalog',     label: 'Catalog',     icon: 'library-outline' },
    { path: '/(app)/(librarian)/loans',       label: 'Loans',       icon: 'swap-horizontal-outline' },
    { path: '/(app)/(librarian)/collections', label: 'Collections', icon: 'albums-outline' },
    { path: '/(app)/(librarian)/patrons',     label: 'Patrons',     icon: 'people-outline' },
    { path: '/(app)/(librarian)/more',        label: 'More',        icon: 'menu-outline' },
  ],
};

// Map role variations to base role
function getBaseRole(role: string): string {
  if (role === 'super_admin') return 'super_admin';
  if (['school_super_admin', 'admin', 'principal', 'coordinator', 'hod'].includes(role)) return 'admin';
  if (role === 'front_desk') return 'frontdesk';
  if (role === 'librarian') return 'librarian';
  return role;
}

export function Sidebar() {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();

  const activeRole = user?.activeRole ?? 'hrt';
  const baseRole = getBaseRole(activeRole);
  const navItems = ROLE_NAV_ITEMS[baseRole] ?? ROLE_NAV_ITEMS.hrt;

  const isActive = (path: string) => {
    // Check if current pathname starts with this path (handles nested routes)
    if (path === '/(app)/(admin)' && pathname?.includes('(admin)') && !pathname?.includes('/students') && !pathname?.includes('/staff/')) {
      return true;
    }
    if (path === '/(app)/(hrt)/home' && pathname?.includes('(hrt)/home')) {
      return true;
    }
    if (path === '/(app)/(st)/home' && pathname?.includes('(st)/home')) {
      return true;
    }
    if (path === '/(app)/(librarian)/home' && pathname?.includes('(librarian)/home')) {
      return true;
    }
    return pathname?.startsWith(path) ?? false;
  };

  const handlePress = (path: string) => {
    haptics.light();
    // Navigate to the index route of that group
    const indexPath = path as any;
    router.navigate(indexPath);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      {/* Logo/Brand area */}
      <View style={[styles.brand, { borderBottomColor: colors.border }]}>
        <ThemedText variant="h4" style={{ color: colors.brand.primary, fontWeight: '700' }}>
          eScholr
        </ThemedText>
        <ThemedText variant="caption" color="muted">
          {activeRole.charAt(0).toUpperCase() + activeRole.slice(1)}
        </ThemedText>
      </View>

      {/* Navigation items */}
      <ScrollView style={styles.nav} contentContainerStyle={styles.navContent} showsVerticalScrollIndicator={false}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <PressableScale
              key={item.path}
              onPress={() => handlePress(item.path)}
              style={[
                styles.navItem,
                active && { backgroundColor: colors.brand.primarySoft },
              ]}
              scaleTo={0.98}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? colors.brand.primary : colors.textSecondary}
              />
              <ThemedText
                style={[
                  styles.navLabel,
                  { color: active ? colors.brand.primary : colors.textPrimary },
                  active && { fontWeight: '600' },
                ]}
              >
                {item.label}
              </ThemedText>
            </PressableScale>
          );
        })}
      </ScrollView>

      {/* User info at bottom */}
      <View style={[styles.userInfo, { borderTopColor: colors.border }]}>
        <ThemedText variant="bodySm" numberOfLines={1}>
          {user?.fullName ?? 'User'}
        </ThemedText>
        <ThemedText variant="caption" color="muted" numberOfLines={1}>
          {user?.email ?? ''}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    height: '100%',
    borderRightWidth: 1,
  },
  brand: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
  },
  nav: {
    flex: 1,
  },
  navContent: {
    paddingVertical: Spacing.md,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    borderRadius: Radius.md,
    gap: Spacing.md,
  },
  navLabel: {
    fontSize: 15,
  },
  userInfo: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
});
