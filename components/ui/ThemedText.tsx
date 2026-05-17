import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTheme } from '../../lib/theme';
import { Typography } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';

type Variant = keyof typeof Typography;
type ColorKey = 'primary' | 'secondary' | 'muted' | 'inverse' | 'brand' | 'success' | 'error' | 'warning';

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: ColorKey;
}

export function ThemedText({ variant = 'body', color = 'primary', style, ...props }: ThemedTextProps) {
  const { colors } = useTheme();

  const colorMap: Record<ColorKey, string> = {
    primary:   colors.textPrimary,
    secondary: colors.textSecondary,
    muted:     colors.textMuted,
    inverse:   colors.textInverse,
    brand:     colors.brand.primary,
    success:   Colors.semantic.success,
    error:     Colors.semantic.error,
    warning:   Colors.semantic.warning,
  };

  return (
    <Text
      style={[Typography[variant], { color: colorMap[color] }, style]}
      {...props}
    />
  );
}
