import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText } from './ThemedText';
import { Spacing, Radius } from '../../constants/Typography';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void | Promise<unknown>;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this data. Please try again.',
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  const { colors } = useTheme();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (retrying || !onRetry) return;
    try {
      setRetrying(true);
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.semantic.errorBg }]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.semantic.error} />
      </View>
      <ThemedText variant="h4" style={styles.title}>{title}</ThemedText>
      <ThemedText variant="body" color="muted" style={styles.description}>{description}</ThemedText>
      {onRetry && (
        <TouchableOpacity
          onPress={handleRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityState={{ busy: retrying }}
          style={[styles.retryBtn, { backgroundColor: colors.brand.primary, opacity: retrying ? 0.7 : 1 }]}
          activeOpacity={0.8}
        >
          {retrying ? (
            <ActivityIndicator size="small" color={colors.brand.onPrimary} style={{ marginRight: Spacing.sm }} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={colors.brand.onPrimary} style={{ marginRight: Spacing.sm }} />
          )}
          <ThemedText variant="body" style={{ color: colors.brand.onPrimary, fontWeight: '600' }}>
            {retrying ? 'Retrying…' : retryLabel}
          </ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
});
