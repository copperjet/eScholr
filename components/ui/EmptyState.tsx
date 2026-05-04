import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { Button } from './Button';
import { useTheme } from '../../lib/theme';
import { Spacing } from '../../constants/Typography';

interface EmptyStateProps {
  icon?: React.ReactNode | string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();

  const renderedIcon = typeof icon === 'string'
    ? <Ionicons name={icon as any} size={48} color={colors.textMuted} />
    : icon;

  return (
    <View style={styles.container}>
      {renderedIcon && <View style={styles.icon}>{renderedIcon}</View>}
      <ThemedText variant="h4" style={styles.title}>{title}</ThemedText>
      {description && (
        <ThemedText variant="body" color="muted" style={styles.description}>
          {description}
        </ThemedText>
      )}
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['4xl'],
  },
  icon: {
    marginBottom: Spacing.base,
    opacity: 0.4,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  action: {
    alignSelf: 'center',
  },
});
