/**
 * Role Switcher — /(app)/switch-role
 * For users with multiple roles. Shown when user has 2+ roles.
 * Calls switchRole() → navigates back to root which re-routes.
 */
import React from 'react';
import {
  View, StyleSheet, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { ThemedText, ScreenHeader } from '../../components/ui';
import { Spacing, Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import { haptics } from '../../lib/haptics';
import type { UserRole } from '../../types/database';

const ROLE_META: Record<UserRole, { label: string; icon: string; description: string }> = {
  hrt:                { label: 'Class Teacher (HRT)', icon: 'people',          description: 'Attendance, marks, CREED, day book, reports' },
  st:                 { label: 'Subject Teacher',     icon: 'book',            description: 'Subject assignments and marks entry' },
  admin:              { label: 'Administrator',       icon: 'shield',          description: 'School-wide management and approvals' },
  super_admin:        { label: 'Super Admin',         icon: 'shield-checkmark',description: 'Full system access across all schools' },
  school_super_admin: { label: 'School Super Admin',    icon: 'shield-checkmark',description: 'Full school management and governance' },
  principal:          { label: 'Principal',             icon: 'ribbon',          description: 'School leadership and oversight' },
  coordinator:        { label: 'Coordinator',         icon: 'git-merge',       description: 'Academic coordination and scheduling' },
  hod:                { label: 'Head of Department',  icon: 'layers',          description: 'Departmental marks and staff oversight' },
  finance:            { label: 'Finance',             icon: 'card',            description: 'Fee clearance and financial reports' },
  front_desk:         { label: 'Front Desk',          icon: 'headset',         description: 'Admission inquiries and visitor management' },
  parent:             { label: 'Parent',              icon: 'heart',           description: "Your children's progress and reports" },
  student:            { label: 'Student',             icon: 'school',          description: 'View your marks, attendance, and reports' },
  hr:                 { label: 'Human Resources',     icon: 'briefcase',       description: 'Staff leave management and directory' },
  librarian:          { label: 'Librarian',           icon: 'library',         description: 'Catalog, loans, barcodes and collections' },
};

export default function SwitchRoleScreen() {
  const { colors } = useTheme();
  const { user, switchRole } = useAuthStore();

  const roles = user?.roles ?? [];
  const activeRole = user?.activeRole;

  const handleSwitch = (role: UserRole) => {
    if (role === activeRole) {
      router.back();
      return;
    }
    haptics.medium();
    switchRole(role);
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Switch Role" showBack />

      <View style={styles.content}>
        <ThemedText variant="body" color="muted" style={{ marginBottom: Spacing.lg }}>
          {roles.length > 1
            ? 'You have access to multiple roles. Select the one you want to use.'
            : 'This is your only assigned role.'}
        </ThemedText>

        {roles.map((role) => {
          const meta = ROLE_META[role] ?? { label: role, icon: 'person', description: '' };
          const isActive = role === activeRole;
          return (
            <TouchableOpacity
              key={role}
              onPress={() => handleSwitch(role)}
              activeOpacity={0.8}
              style={[
                styles.roleCard,
                {
                  backgroundColor: isActive ? colors.brand.primarySoft : colors.surface,
                  borderColor: isActive ? colors.brand.primary : colors.border,
                  borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={[styles.roleIcon, { backgroundColor: colors.brand.primarySoft }]}>
                <Ionicons name={meta.icon as any} size={24} color={colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="body" style={{ fontWeight: '700', color: isActive ? colors.brand.primary : colors.textPrimary }}>
                  {meta.label}
                </ThemedText>
                <ThemedText variant="caption" color="muted">{meta.description}</ThemedText>
              </View>
              {isActive ? (
                <View style={[styles.activeDot, { backgroundColor: colors.brand.primary }]}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    padding: Spacing.base,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
