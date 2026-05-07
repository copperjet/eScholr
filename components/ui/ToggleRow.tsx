/**
 * ToggleRow — Label + optional description + native Switch.
 * Used in settings and module configuration screens.
 */
import React from 'react';
import { View, Switch, StyleSheet, Platform } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';

export interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: ToggleRowProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.text}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {description ? (
          <ThemedText variant="caption" color="muted" style={styles.description}>
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: colors.border,
          true: colors.brand.primary,
        }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.brand.primary : colors.textMuted) : undefined}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.base,
  },
  text: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
  },
  description: {
    marginTop: 2,
    lineHeight: 18,
  },
});
