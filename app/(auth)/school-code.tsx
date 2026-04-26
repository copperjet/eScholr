import React, { useState, useRef } from 'react';
import {
  View, TextInput, StyleSheet, KeyboardAvoidingView,
  Platform, Animated, Image, StatusBar, Pressable,
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
  const [foundSchool, setFoundSchool] = useState<{ id: string; name: string; primary_color: string } | null>(null);

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
    const { data, error: err } = await supabase.from('schools').select('*').eq('code', trimmed).in('subscription_status', ['active', 'trial']).single();
    setLoading(false);
    if (err || !data) { setError('School not found. Check your code and try again.'); shake(); return; }
    const school = data as any;
    haptics.success();
    setSchool(school);
    setFoundSchool({ id: school.id, name: school.name, primary_color: school.primary_color ?? colors.brand.primary });
    Animated.sequence([
      Animated.timing(brandAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(400),
    ]).start(() => {
      router.push({ pathname: '/(auth)/login', params: { schoolId: school.id } });
      brandAnim.setValue(0);
      setFoundSchool(null);
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.brand.primary }]}>
      <StatusBar barStyle="light-content" />

      {/* Brand transition overlay */}
      {foundSchool && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: foundSchool.primary_color, opacity: brandAnim, zIndex: 99, alignItems: 'center', justifyContent: 'center', gap: 16 }]} pointerEvents="none">
          <Image source={require('../../assets/scholr-logo.png')} style={styles.overlayLogo} resizeMode="contain" />
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
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
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
                placeholder="e.g. CIS_DEMO"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                style={{ flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 3, color: colors.brand.primary }}
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

          <Pressable onPress={() => router.push('/(auth)/platform-login' as any)} style={styles.platformLink}>
            <Ionicons name="shield-outline" size={13} color={colors.textMuted} />
            <ThemedText variant="caption" color="muted" style={{ marginLeft: 4 }}>
              eScholr Admin Access
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
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
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    padding: Spacing['2xl'],
    paddingTop: Spacing['3xl'],
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
  platformLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing['2xl'],
    paddingVertical: Spacing.sm,
  },
});
