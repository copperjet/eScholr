import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableOpacity, ScrollView, StatusBar, Pressable, Image,
} from 'react-native';

const isWeb = Platform.OS === 'web';
import { router, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ThemedText, Button, FormField } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { school, setUser } = useAuthStore();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const displayName = school?.name ?? 'Your School';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | null>(null);

  useEffect(() => {
    // Biometric auth not supported on web
    if (isWeb) return;

    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        setBiometricAvailable(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        setBiometricType(types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'face' : 'fingerprint');
      }
    })();
  }, []);

  const handleBiometric = async () => {
    if (isWeb) return;
    haptics.light();
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: `Sign in to ${displayName}`, fallbackLabel: 'Use Password' });
    if (result.success) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const meta = session.user.app_metadata as any;
        // Fetch staff department for HOD scoping
        let department: string | null = null;
        if (meta?.staff_id) {
          const { data: staff } = await (supabase as any)
            .from('staff')
            .select('department')
            .eq('id', meta.staff_id)
            .single();
          department = staff?.department ?? null;
        }
        setUser({ id: session.user.id, email: session.user.email ?? '', fullName: session.user.user_metadata?.full_name ?? '', staffId: meta?.staff_id ?? null, parentId: meta?.parent_id ?? null, studentId: meta?.student_id ?? null, department, roles: meta?.roles ?? [], activeRole: meta?.active_role ?? 'hrt', schoolId: meta?.school_id ?? '' });
        haptics.success();
        router.replace('/');
      } else {
        setError('No saved session. Please sign in with your password first.');
      }
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (err || !data.session) {
      setLoading(false);
      setError('Incorrect email or password. Try again.');
      haptics.error();
      return;
    }
    const meta = data.session.user.app_metadata as any;
    // Fetch staff department for HOD scoping
    let department: string | null = null;
    if (meta?.staff_id) {
      const { data: staff } = await (supabase as any)
        .from('staff')
        .select('department')
        .eq('id', meta.staff_id)
        .single();
      department = staff?.department ?? null;
    }
    setUser({ id: data.session.user.id, email: data.session.user.email ?? '', fullName: data.session.user.user_metadata?.full_name ?? '', staffId: meta?.staff_id ?? null, parentId: meta?.parent_id ?? null, studentId: meta?.student_id ?? null, department, roles: meta?.roles ?? [], activeRole: meta?.active_role ?? 'hrt', schoolId: meta?.school_id ?? '' });
    haptics.success();
    router.replace('/');
  };

  const inner = (
    <View style={{ flex: 1, backgroundColor: colors.brand.primary }}>
      <StatusBar barStyle="light-content" />

      {/* ── Green hero top ── */}
      <View style={styles.hero}>
        {canGoBack && (
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: Spacing['2xl'] }}>
          {school?.logo_url ? (
            <Image
              source={{ uri: school.logo_url }}
              style={styles.schoolLogo}
              resizeMode="contain"
            />
          ) : null}
          <View style={styles.schoolPill}>
            <View style={styles.schoolDot} />
            <ThemedText style={{ color: colors.brand.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>
              {displayName}
            </ThemedText>
          </View>
          <ThemedText style={styles.heroTitle}>Welcome back</ThemedText>
          <ThemedText style={styles.heroSub}>Sign in to your eScholr account</ThemedText>
        </View>
      </View>

      {/* ── White card sheet ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={[styles.sheet, Platform.OS !== 'web' && { flex: 1 }, { backgroundColor: colors.background }]}>
            <View style={styles.form}>
              <FormField
                label="Email address"
                placeholder="name@school.edu"
                value={email}
                onChangeText={t => { setEmail(t); setError(''); }}
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
                onChangeText={t => { setPassword(t); setError(''); }}
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

              <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password' as any)}>
                <ThemedText style={{ color: colors.brand.primary, fontWeight: '600', fontSize: 15 }}>Forgot password?</ThemedText>
              </TouchableOpacity>

              {biometricAvailable && (
                <Pressable
                  onPress={handleBiometric}
                  style={({ pressed }) => [
                    styles.biometricBtn,
                    { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Ionicons
                    name={biometricType === 'face' ? 'scan-outline' : 'finger-print-outline'}
                    size={22}
                    color={colors.brand.primary}
                  />
                  <ThemedText style={{ fontSize: 14, color: colors.brand.primary, fontWeight: '600' }}>
                    {biometricType === 'face' ? 'Sign in with Face ID' : 'Sign in with Fingerprint'}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.brand.primary, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 480, flex: 1 }}>
          {inner}
        </View>
      </View>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  hero: {
    height: 260,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: 60,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    marginBottom: Spacing.base,
  },
  schoolDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#0F5132',
  },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  heroSub:   { color: 'rgba(255,255,255,0.72)', fontSize: 15, marginTop: 6, textAlign: 'center' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: Spacing['2xl'],
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadow.lg,
  },
  form: {
    gap: Spacing.base,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  schoolLogo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginBottom: Spacing.md,
    alignSelf: 'center',
  },
  forgotBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
});
