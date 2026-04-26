import React, { useState } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, StatusBar, Pressable, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ThemedText, Button, FormField } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

export default function PlatformLoginScreen() {
  const { colors } = useTheme();
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
      return;
    }

    const meta = data.session.user.app_metadata as any;
    const roles: string[] = Array.isArray(meta?.roles) ? meta.roles : [];

    if (!roles.includes('super_admin')) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('This login is for eScholr platform administrators only.');
      haptics.error();
      return;
    }

    setUser({
      id: data.session.user.id,
      email: data.session.user.email ?? '',
      fullName: data.session.user.user_metadata?.full_name ?? '',
      staffId: null,
      parentId: null,
      roles: roles as any,
      activeRole: 'super_admin',
      schoolId: null,
    });

    haptics.success();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
      <StatusBar barStyle="light-content" />

      <View style={styles.hero}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <View style={styles.heroContent}>
          <View style={styles.shieldBadge}>
            <Ionicons name="shield-checkmark" size={28} color="#fff" />
          </View>
          <ThemedText style={styles.heroTitle}>Platform Admin</ThemedText>
          <ThemedText style={styles.heroSub}>eScholr internal access only</ThemedText>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.form}>
              <FormField
                label="Admin Email"
                placeholder="admin@escholr.com"
                value={email}
                onChangeText={(t) => { setEmail(t); setError(''); }}
                iconLeft="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <FormField
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                iconLeft="lock-closed-outline"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                  <ThemedText style={{ color: '#DC2626', marginLeft: 6, flex: 1, fontSize: 14 }}>{error}</ThemedText>
                </View>
              ) : null}

              <Button label="Sign In" onPress={handleLogin} loading={loading} fullWidth size="lg" />
            </View>

            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={15} color="#92400E" />
              <ThemedText style={{ fontSize: 12, color: '#92400E', flex: 1, marginLeft: 6 }}>
                This area is restricted to eScholr staff. Unauthorised access attempts are logged.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 240,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: 60,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroContent: {
    flex: 1, justifyContent: 'flex-end', paddingBottom: Spacing['2xl'], alignItems: 'flex-start',
  },
  shieldBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  heroSub:   { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },
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
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginTop: Spacing['2xl'],
    backgroundColor: '#FEF3C7',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
});
