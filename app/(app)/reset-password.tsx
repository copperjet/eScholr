/**
 * Force password reset screen — shown after first login when
 * user_metadata.must_reset_password === true. The (app) layout
 * gates here before showing the rest of the app.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ThemedText, Button, FormField } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const [pw1, setPw1]   = useState('');
  const [pw2, setPw2]   = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setError('');
    if (pw1.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2)    { setError('Passwords do not match.');                 return; }

    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        password: pw1,
        data: { must_reset_password: false },
      });
      if (updErr) throw updErr;

      // Clear the stored temp password from the staff record.
      const { data: { user: me } } = await supabase.auth.getUser();
      if (me) {
        const staffId = (me.app_metadata as any)?.staff_id;
        if (staffId) {
          await (supabase as any)
            .from('staff')
            .update({ temp_password: null, login_status: 'active' })
            .eq('id', staffId);
        }
      }

      // Refresh the session so user_metadata is current locally.
      await supabase.auth.refreshSession();

      haptics.success();
      router.replace('/');
    } catch (e: any) {
      setError(e.message ?? 'Could not update password.');
      haptics.error();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand.primaryDark }}>
      <StatusBar barStyle="light-content" />

      <View style={styles.hero}>
        <View style={styles.iconBadge}>
          <Ionicons name="key-outline" size={28} color="#fff" />
        </View>
        <ThemedText style={styles.heroTitle}>Set a New Password</ThemedText>
        <ThemedText style={styles.heroSub}>
          You&apos;re using a temporary password. Choose a new one to continue.
        </ThemedText>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <ThemedText style={{ color: colors.textMuted, fontSize: 13, marginBottom: Spacing.md }}>
              Signed in as <ThemedText style={{ fontWeight: '700' }}>{user?.email}</ThemedText>
            </ThemedText>

            <View style={styles.form}>
              <FormField
                label="New Password"
                placeholder="At least 8 characters"
                value={pw1}
                onChangeText={(t) => { setPw1(t); setError(''); }}
                iconLeft="lock-closed-outline"
                secureTextEntry
                returnKeyType="next"
              />
              <FormField
                label="Confirm Password"
                placeholder="Re-enter password"
                value={pw2}
                onChangeText={(t) => { setPw2(t); setError(''); }}
                iconLeft="lock-closed-outline"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                  <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>{error}</ThemedText>
                </View>
              ) : null}

              <Button label="Save & Continue" onPress={handleSave} loading={loading} fullWidth size="lg" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: 80,
    paddingBottom: Spacing['2xl'],
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  heroSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6, lineHeight: 20 },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: Spacing['2xl'],
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
    ...Shadow.lg,
  },
  form: { gap: Spacing.base },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md,
  },
});
