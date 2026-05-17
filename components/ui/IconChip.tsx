import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';
import { Radius } from '../../constants/Typography';

interface IconChipProps {
  icon: React.ReactNode;
  size?: number;
  radius?: number;
  bg?: string;
  style?: ViewStyle;
}

/**
 * A rounded-square icon container. Defaults to `brand.primarySoft` background.
 * Used in quick-action tiles, list leading slots, stat cards, etc.
 */
export function IconChip({ icon, size = 44, radius, bg, style }: IconChipProps) {
  const { colors } = useTheme();
  const resolvedBg = bg ?? colors.brand.primarySoft;
  const resolvedRadius = radius ?? Radius.md;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: resolvedRadius,
          backgroundColor: resolvedBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {icon}
    </View>
  );
}
