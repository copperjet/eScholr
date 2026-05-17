/**
 * BiometricEnrollModal
 * Shown once after first login if the device has biometric hardware
 * but the user hasn't yet been asked to enable it for this app.
 * Stores consent flag in SecureStore so it only shows once per device.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Modal, StyleSheet, TouchableOpacity,
  Animated, Pressable, Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText } from './ThemedText';
import { Button } from './Button';
import { Spacing, Radius, Shadow } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

const ENROLL_KEY = 'escholr_biometric_asked';

interface Props {
  userId: string;
}

const isWeb = Platform.OS === 'web';

export function BiometricEnrollModal({ userId }: Props) {
  const { colors } = useTheme();
  const [visible, setVisible]       = useState(false);
  const [biometricType, setBioType] = useState<'face' | 'fingerprint'>('fingerprint');
  const [enrolling, setEnrolling]   = useState(false);
  const [scaleAnim]                 = useState(new Animated.Value(0.85));
  const [opacityAnim]               = useState(new Animated.Value(0));

  // Biometric auth not supported on web
  if (isWeb) return null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = `${ENROLL_KEY}_${userId}`;
      const already = await SecureStore.getItemAsync(key).catch(() => null);
      if (already || cancelled) return;

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled || cancelled) return;

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const isFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      setBioType(isFace ? 'face' : 'fingerprint');

      // Small delay so app layout settles after login navigation
      await new Promise(r => setTimeout(r, 800));
      if (!cancelled) setVisible(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 200 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  const markAsked = useCallback(() => {
    SecureStore.setItemAsync(`${ENROLL_KEY}_${userId}`, 'asked').catch(() => {});
  }, [userId]);

  const dismiss = useCallback(() => {
    markAsked();
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.85, useNativeDriver: true, damping: 18, stiffness: 200 }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, [scaleAnim, opacityAnim, markAsked]);

  const handleEnable = useCallback(async () => {
    setEnrolling(true);
    haptics.medium();
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Enable ${biometricType === 'face' ? 'Face ID' : 'fingerprint'} for quick sign-in`,
        fallbackLabel: 'Use Password',
        cancelLabel: 'Not now',
      });
      if (result.success) {
        haptics.success();
        dismiss();
      } else {
        haptics.error();
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setEnrolling(false);
    }
  }, [biometricType, dismiss]);

  if (!visible) return null;

  const iconName = biometricType === 'face' ? 'scan-outline' : 'finger-print-outline';
  const label    = biometricType === 'face' ? 'Face ID' : 'Fingerprint';

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface },
            Shadow.lg,
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: colors.brand.primarySoft }]}>
            <Ionicons name={iconName} size={38} color={colors.brand.primary} />
          </View>

          <ThemedText variant="h3" style={styles.title}>
            Enable {label}
          </ThemedText>
          <ThemedText variant="body" color="muted" style={styles.body}>
            Sign in faster next time using {label} instead of your password.
          </ThemedText>

          <View style={styles.actions}>
            <Button
              label={`Enable ${label}`}
              onPress={handleEnable}
              loading={enrolling}
              fullWidth
              size="lg"
              iconLeft={<Ionicons name={iconName} size={18} color="#fff" />}
            />
            <TouchableOpacity onPress={dismiss} style={styles.skipBtn}>
              <ThemedText variant="bodySm" color="muted">Not now</ThemedText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing['2xl'],
    paddingBottom: 52,
    alignItems: 'center',
    gap: Spacing.base,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.base,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
});
