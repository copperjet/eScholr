/**
 * Forgot Password — sends a Supabase password-recovery email.
 *
 * Flow:
 *  1. User enters their email here.
 *  2. We call supabase.auth.resetPasswordForEmail with a deep-link
 *     redirectTo. Supabase emails them a recovery link.
 *  3. Tapping the link opens the app via expo-linking; supabase-js
 *     parses the URL fragment and fires a `PASSWORD_RECOVERY` auth
 *     event.
 *  4. The (app) layout listens for that event and routes the user
 *     to /reset-password (the same screen used for must_reset flag).
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, StatusBar, Pressable,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { ThemedText, Button, FormField } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

export default function ForgotPasswordScreen() {
  const { colors, isDark } = useTheme();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setError('');
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      // Deep link back into the app — supabase-js will pick up the
      // recovery token from the URL fragment automatically.
      const redirectTo = Linking.createURL('/');
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo },
      );
      // We deliberately do NOT leak whether the email exists. Always
      // show the same success state to avoid email-enumeration.
      if (err) console.warn('[forgot-password] resetPasswordForEmail:', err.message);
      haptics.success();
      setSent(true);
    } catch (e: any) {
      // Same — silent failure UX.
      console.warn('[forgot-password] unexpected:', e?.message);
      haptics.success();
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand.primaryDark }}>
      <StatusBar barStyle="light-content" />

      <View style={styles.hero}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.85)" />
        </Pressable>
        <View style={styles.heroBody}>
          <View style={styles.iconBadge}>
            <Ionicons name="mail-outline" size={26} color="#fff" />
          </View>
          <ThemedText style={styles.heroTitle}>Forgot Password?</ThemedText>
          <ThemedText style={styles.heroSub}>
            Enter your email and we&apos;ll send you a link to reset it.
          </ThemedText>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {sent ? (
              <View style={{ gap: Spacing.md, alignItems: 'flex-start' }}>
                <View style={[styles.successBox, { backgroundColor: isDark ? '#14532D' : '#DCFCE7' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                  <ThemedText style={{ color: isDark ? '#86EFAC' : '#15803D', flex: 1, marginLeft: 8, fontSize: 14 }}>
                    If an account exists for <ThemedText style={{ fontWeight: '700' }}>{email.trim().toLowerCase()}</ThemedText>,
                    a reset link is on the way. Open the link on this device to choose a new password.
                  </ThemedText>
                </View>
                <Button label="Back to Sign In" onPress={() => router.back()} fullWidth size="lg" />
              </View>
            ) : (
              <View style={{ gap: Spacing.base }}>
                <FormField
                  label="Email address"
                  placeholder="name@school.edu"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(''); }}
                  iconLeft="mail-outline"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                />
                {error ? (
                  <View style={[styles.errorBox, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                    <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>{error}</ThemedText>
                  </View>
                ) : null}
                <Button label="Send Reset Link" onPress={handleSend} loading={loading} fullWidth size="lg" />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: 60,
    paddingBottom: Spacing['2xl'],
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBody: { marginTop: Spacing.lg },
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
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md,
  },
  successBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: Spacing.md, borderRadius: Radius.md,
  },
});
