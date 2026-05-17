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

// Fire-and-forget audit log. Every attempt (success or fail) is recorded.
async function logAttempt(email: string, success: boolean, reason?: string) {
  try {
    await (supabase as any).from('admin_login_attempts').insert({
      email: email.trim().toLowerCase() || null,
      success,
      reason: reason ?? null,
      user_agent: `eScholr-${Platform.OS}-${Platform.Version}`,
    });
  } catch {
    /* ignore — never block login on audit failures */
  }
}

export default function PlatformLoginScreen() {
  const { colors, isDark } = useTheme();
  const { setUser } = useAuthStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (err || !data.session) {
      setLoading(false);
      setError('Incorrect email or password.');
      haptics.error();
      logAttempt(email, false, err?.message ?? 'invalid_credentials');
      return;
    }

    const meta = data.session.user.app_metadata as any;
    const roles: string[] = Array.isArray(meta?.roles) ? meta.roles : [];

    if (!roles.includes('super_admin')) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('Incorrect email or password.');
      haptics.error();
      logAttempt(email, false, 'not_platform_admin');
      return;
    }

    setUser({
      id: data.session.user.id,
      email: data.session.user.email ?? '',
      fullName: data.session.user.user_metadata?.full_name ?? '',
      staffId: null,
      parentId: null,
      studentId: null,
      roles: roles as any,
      activeRole: 'super_admin',
      schoolId: null,
    });

    haptics.success();
    logAttempt(email, true);
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand.primaryDark }}>
      <StatusBar barStyle="light-content" />

      {/* Wordmark only — no subtitle, no badge, no clue what this page is for. */}
      <View style={styles.hero}>
        <ThemedText style={styles.wordmark}>eScholr</ThemedText>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.form}>
              <FormField
                placeholder="Email"
                value={email}
                onChangeText={(t) => { setEmail(t); setError(''); }}
                iconLeft="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <FormField
                placeholder="Password"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                iconLeft="lock-closed-outline"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                  <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>{error}</ThemedText>
                </View>
              ) : null}

              <Button label="Sign In" onPress={handleLogin} loading={loading} fullWidth size="lg" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 200,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    marginTop: -28,
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
