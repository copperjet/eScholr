/**
 * ModuleDisabledScreen — Full-screen message when a user tries to access
 * a module that is disabled for their school. Replaces silent redirect
 * with informative UX explaining why and offering action.
 */
import React from 'react';
import { View, SafeAreaView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ThemedText } from './ThemedText';
import { Button } from './Button';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';
import { type ModuleKey, getModuleDefinition } from '../../lib/modules';

export interface ModuleDisabledScreenProps {
  module: ModuleKey;
  /** Path to navigate "back" to. Defaults to admin home. */
  fallbackPath?: string;
}

export function ModuleDisabledScreen({
  module,
  fallbackPath = '/(app)/(admin)',
}: ModuleDisabledScreenProps) {
  const { colors } = useTheme();
  const def = getModuleDefinition(module);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackPath as any);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.brand.primary + '15' }]}>
          <Ionicons
            name={(def?.icon as any) ?? 'lock-closed-outline'}
            size={48}
            color={colors.brand.primary}
          />
        </View>

        <ThemedText style={styles.title}>
          {def?.label ?? module} not available
        </ThemedText>

        <ThemedText color="muted" style={styles.description}>
          This feature is not enabled for your school. Contact your school administrator
          or platform support to request access.
        </ThemedText>

        {def?.description ? (
          <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText variant="caption" color="muted" style={styles.featureLabel}>
              ABOUT THIS MODULE
            </ThemedText>
            <ThemedText style={styles.featureText}>{def.description}</ThemedText>
          </View>
        ) : null}

        <Button label="Go back" onPress={handleBack} size="md" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 360,
  },
  featureCard: {
    padding: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    width: '100%',
    maxWidth: 400,
    gap: 4,
  },
  featureLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
