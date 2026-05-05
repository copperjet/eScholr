import React, { useState, useRef } from 'react';
import {
  View, TextInput, StyleSheet, KeyboardAvoidingView,
  Platform, Animated, Image, StatusBar, Pressable, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ThemedText, Button } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

export default function SchoolCodeScreen() {
  const { colors } = useTheme();
  const { setSchool } = useAuthStore();

  const [code, setCode]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [foundSchool, setFoundSchool] = useState<{ id: string; name: string; primary_color: string; logo_url?: string | null } | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const brandAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    haptics.error();
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleContinue = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Enter your school code'); shake(); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await (supabase as any).from('schools').select('id, name, primary_color, logo_url').eq('code', trimmed).in('subscription_status', ['active', 'trial']).single();
    setLoading(false);
    if (err || !data) { setError('School not found. Check your code and try again.'); shake(); return; }
    const school = data as any;
    haptics.success();
    setSchool(school);
    setFoundSchool({ id: school.id, name: school.name, primary_color: school.primary_color ?? colors.brand.primary, logo_url: school.logo_url });
    Animated.sequence([
      Animated.timing(brandAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(400),
    ]).start(() => {
      router.push({ pathname: '/(auth)/login', params: { schoolId: school.id } });
      brandAnim.setValue(0);
      setFoundSchool(null);
    });
  };

  const inner = (
    <View style={[styles.root, { backgroundColor: colors.brand.primary }]}>
      <StatusBar barStyle="light-content" />

      {/* Brand transition overlay */}
      {foundSchool && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: foundSchool.primary_color, opacity: brandAnim, zIndex: 99, alignItems: 'center', justifyContent: 'center', gap: 16 }]} pointerEvents="none">
          {foundSchool.logo_url ? (
            <Image source={{ uri: foundSchool.logo_url }} style={styles.schoolLogo} resizeMode="contain" />
          ) : (
            <Image source={require('../../assets/scholr-logo.png')} style={styles.overlayLogo} resizeMode="contain" />
          )}
          <ThemedText style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{foundSchool.name}</ThemedText>
        </Animated.View>
      )}

      {/* ── Green hero top ── */}
      <View style={styles.hero}>
        <View style={styles.logoArea}>
          <Image source={require('../../assets/scholr-main-logo.png')} style={styles.mainLogo} resizeMode="contain" tintColor="#fff" />
          <ThemedText style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center', marginTop: Spacing.sm }}>
            School Management, Reimagined
          </ThemedText>
        </View>
      </View>

      {/* ── White sheet ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
          <View style={[styles.sheet, Platform.OS !== 'web' && { flex: 1 }, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Animated.View style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}>
              <ThemedText variant="h2" style={{ marginBottom: Spacing.xs }}>Enter school code</ThemedText>
              <ThemedText variant="body" color="muted" style={{ marginBottom: Spacing.lg }}>
                Your school administrator provides this code.
              </ThemedText>

              <View style={[
                styles.codeInput,
                { backgroundColor: colors.surfaceSecondary, borderColor: error ? '#DC2626' : colors.border },
              ]}>
                <Ionicons name="school-outline" size={20} color={error ? '#DC2626' : colors.textMuted} style={{ marginRight: Spacing.sm }} />
                <TextInput
                  value={code}
                  onChangeText={t => { setCode(t); setError(''); }}
                  placeholder="e.g. ESCHOLR"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                  style={[{ flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 3, color: colors.textPrimary }, Platform.OS === 'web' ? { outlineStyle: 'none' } as any : undefined]}
                />
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                  <ThemedText style={{ color: '#DC2626', fontSize: 13, marginLeft: 5 }}>{error}</ThemedText>
                </View>
              ) : null}

              <Button label="Continue" onPress={handleContinue} loading={loading} fullWidth size="lg" style={{ marginTop: Spacing.md }} />
            </Animated.View>

            {/* Hidden platform-admin tap target — visually invisible at the very
                bottom of the screen. Anyone who knows where it is can tap it. */}
            <Pressable
              onPress={() => router.push('/(auth)/platform-login' as any)}
              style={styles.hiddenPlatformLink}
              hitSlop={12}
              accessibilityLabel="eScholr admin access"
            />
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
  root: { flex: 1 },
  hero: {
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  logoArea: { alignItems: 'center' },
  mainLogo: { width: 200, height: 67 },
  overlayLogo: { width: 72, height: 72, tintColor: '#fff' },
  schoolLogo: { width: 120, height: 120, borderRadius: 16, backgroundColor: '#FFFFFF' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    padding: Spacing['2xl'],
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['4xl'],
    borderWidth: 1,
    borderBottomWidth: 1,
  },
  form: { gap: Spacing.sm },
  codeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.base,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  hiddenPlatformLink: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 32,
  },
});
