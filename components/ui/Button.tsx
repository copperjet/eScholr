import React from 'react';
import {
  Pressable,
  View,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

// primary  — filled with brand green
// tonal    — light green tint bg, green text (great for secondary actions)
// secondary— surface bg, border, primary text
// ghost    — no bg, no border, primary text
// danger   — filled red
type Variant = 'primary' | 'tonal' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  loading = false,
  disabled = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const sizeMap = {
    sm: { height: 36, px: Spacing.md,   textSize: 13 },
    md: { height: 46, px: Spacing.base, textSize: 15 },
    lg: { height: 54, px: Spacing.lg,   textSize: 16 },
  };

  const s = sizeMap[size];

  const getColors = (): { bg: string; text: string; border?: string } => {
    switch (variant) {
      case 'primary':
        return { bg: colors.brand.primary, text: colors.brand.onPrimary };
      case 'tonal':
        return { bg: colors.brand.primarySoft, text: colors.brand.primary };
      case 'secondary':
        return { bg: colors.surface, text: colors.textPrimary, border: colors.border };
      case 'ghost':
        return { bg: 'transparent', text: colors.brand.primary };
      case 'danger':
        return { bg: '#DC2626', text: '#FFFFFF' };
    }
  };

  const c = getColors();

  return (
    <Pressable
      onPress={() => { if (!isDisabled) { haptics.light(); onPress?.(); } }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.px,
          backgroundColor: c.bg,
          borderRadius: Radius.md,
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.5 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.text} size="small" />
      ) : (
        <>
          {iconLeft && <View style={styles.iconLeft}>{iconLeft}</View>}
          <ThemedText style={[{ color: c.text, fontSize: s.textSize, fontWeight: '600' }, textStyle]}>
            {label}
          </ThemedText>
          {iconRight && <View style={styles.iconRight}>{iconRight}</View>}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft:  { marginRight: Spacing.sm },
  iconRight: { marginLeft: Spacing.sm },
});
