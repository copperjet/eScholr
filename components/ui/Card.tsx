import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from '../../lib/theme';
import { Radius, Shadow, Spacing } from '../../constants/Typography';

type CardVariant = 'elevated' | 'flat' | 'outline' | 'tinted';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  accentColor?: string;
  accentSide?: 'left' | 'top';
  noPadding?: boolean;
  padding?: number;
}

export function Card({
  variant = 'elevated',
  accentColor,
  accentSide = 'left',
  noPadding,
  padding = Spacing.base,
  style,
  children,
  ...props
}: CardProps) {
  const { colors } = useTheme();

  const variantStyles = {
    elevated: {
      backgroundColor: colors.surface,
      borderWidth: 0,
      ...Shadow.md,
    },
    flat: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    tinted: {
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 0,
    },
  };

  return (
    <View
      style={[
        styles.card,
        variantStyles[variant],
        style,
      ]}
      {...props}
    >
      {accentColor && accentSide === 'left' && (
        <View style={[styles.accentLeft, { backgroundColor: accentColor }]} />
      )}
      {accentColor && accentSide === 'top' && (
        <View style={[styles.accentTop, { backgroundColor: accentColor }]} />
      )}
      <View style={noPadding ? undefined : { padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  accentLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  accentTop: {
    height: 3,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
});
