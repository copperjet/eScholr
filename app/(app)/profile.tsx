/**
 * Shared Profile Screen — accessible from all role "More" menus.
 * View/edit name, change password, view role & school info.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  ThemedText, Avatar, Button, Card, FormField, ScreenHeader,
} from '../../components/ui';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function InfoRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: IoniconsName;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: colors.brand.primarySoft }]}>
        <Ionicons name={icon} size={16} color={colors.brand.primary} />
      </View>
      <View style={styles.infoText}>
        <ThemedText variant="caption" color="muted">{label}</ThemedText>
        <ThemedText variant="body" style={{ fontWeight: '500' }}>{value || '—'}</ThemedText>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, school } = useAuthStore();

  // ── Name edit ──
  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [savingName, setSavingName] = useState(false);

  // ── Password change ──
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveName = useCallback(async () => {
    if (!fullName.trim()) {
      Alert.alert('Validation', 'Name cannot be empty');
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });
      if (error) throw error;

      // Also update staff record if exists
      if (user?.staffId) {
        await (supabase as any)
          .from('staff')
          .update({ full_name: fullName.trim() })
          .eq('id', user.staffId);
      }

      haptics.success();
      setEditingName(false);
      Alert.alert('Updated', 'Name saved. Changes reflect on next login.');
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e.message ?? 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  }, [fullName, user?.staffId]);

  const handleChangePassword = useCallback(async () => {
    if (newPassword.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      haptics.success();
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Updated', 'Password changed successfully.');
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e.message ?? 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  }, [newPassword, confirmPassword]);

  const roleDisplay = (user?.activeRole ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const allRoles = (user?.roles ?? [])
    .map((r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(', ');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="My Profile" showBack />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar & name hero */}
          <View style={styles.avatarSection}>
            <Avatar name={user?.fullName ?? '?'} size={90} />
            <ThemedText variant="h3" style={{ marginTop: Spacing.md }}>
              {user?.fullName ?? '—'}
            </ThemedText>
            <ThemedText variant="bodySm" color="muted">{user?.email ?? ''}</ThemedText>
            <View style={[styles.roleBadge, { backgroundColor: colors.brand.primarySoft }]}>
              <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 11 }}>
                {roleDisplay}
              </ThemedText>
            </View>
          </View>

          {/* Info card */}
          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.cardTitle}>
              ACCOUNT INFORMATION
            </ThemedText>

            <InfoRow icon="mail-outline" label="Email" value={user?.email ?? ''} colors={colors} />
            <InfoRow icon="shield-outline" label="Active Role" value={roleDisplay} colors={colors} />
            {(user?.roles ?? []).length > 1 && (
              <InfoRow icon="layers-outline" label="All Roles" value={allRoles} colors={colors} />
            )}
            <InfoRow icon="school-outline" label="School" value={school?.name ?? ''} colors={colors} />
            {user?.staffId && (
              <InfoRow icon="id-card-outline" label="Staff ID" value={user.staffId} colors={colors} />
            )}
          </Card>

          {/* Edit name */}
          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.cardTitle}>
              DISPLAY NAME
            </ThemedText>

            {editingName ? (
              <View style={{ gap: Spacing.sm }}>
                <FormField
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  autoFocus
                />
                <View style={styles.btnRow}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setEditingName(false);
                      setFullName(user?.fullName ?? '');
                    }}
                  />
                  <Button
                    label="Save"
                    size="sm"
                    loading={savingName}
                    onPress={handleSaveName}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.editRow}>
                <ThemedText variant="body">{user?.fullName ?? '—'}</ThemedText>
                <Button
                  label="Edit"
                  variant="secondary"
                  size="sm"
                  onPress={() => setEditingName(true)}
                />
              </View>
            )}
          </Card>

          {/* Change password */}
          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.cardTitle}>
              SECURITY
            </ThemedText>

            {showPasswordForm ? (
              <View style={{ gap: Spacing.sm }}>
                <FormField
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min. 6 characters"
                  secureTextEntry
                />
                <FormField
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  secureTextEntry
                  error={
                    confirmPassword && confirmPassword !== newPassword
                      ? 'Passwords do not match'
                      : undefined
                  }
                />
                <View style={styles.btnRow}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setShowPasswordForm(false);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  />
                  <Button
                    label="Change Password"
                    size="sm"
                    loading={savingPassword}
                    onPress={handleChangePassword}
                  />
                </View>
              </View>
            ) : (
              <Button
                label="Change Password"
                variant="secondary"
                onPress={() => setShowPasswordForm(true)}
                style={{ alignSelf: 'flex-start' }}
              />
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: Spacing.base,
    paddingBottom: 60,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  roleBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  card: {
    marginBottom: Spacing.base,
    padding: Spacing.base,
  },
  cardTitle: {
    marginBottom: Spacing.md,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    gap: 2,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
