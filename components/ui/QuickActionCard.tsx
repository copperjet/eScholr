import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { IconChip } from './IconChip';
import { PressableScale } from './PressableScale';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius, Shadow } from '../../constants/Typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface QuickActionCardProps {
  title: string;
  subtitle?: string;
  icon: IoniconsName;
  /** Overrides the default brand chip */
  iconBg?: string;
  iconColor?: string;
  /** 'brand' = dark green filled; 'tinted' = soft green; 'surface' = white card */
  variant?: 'brand' | 'tinted' | 'surface';
  onPress?: () => void;
  style?: ViewStyle;
}

export function QuickActionCard({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  variant = 'surface',
  onPress,
  style,
}: QuickActionCardProps) {
  const { colors } = useTheme();

  const bgMap = {
    brand:   colors.brand.primary,
    tinted:  colors.brand.primarySoft,
    surface: colors.surface,
  };
  const titleColor = variant === 'brand' ? '#FFFFFF' : colors.textPrimary;
  const subtitleColor = variant === 'brand' ? 'rgba(255,255,255,0.72)' : colors.textMuted;
  const chipBg = variant === 'brand' ? 'rgba(255,255,255,0.2)' : (iconBg ?? colors.brand.primarySoft);
  const chipColor = variant === 'brand' ? '#FFFFFF' : (iconColor ?? colors.brand.primary);

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      style={[
        styles.card,
        { backgroundColor: bgMap[variant] },
        variant === 'surface' && Shadow.md,
        style,
      ]}
    >
      <IconChip
        icon={<Ionicons name={icon} size={22} color={chipColor} />}
        bg={chipBg}
        size={48}
        radius={Radius.md}
      />
      <View style={styles.text}>
        <ThemedText style={{ fontSize: 15, fontWeight: '700', color: titleColor }} numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText style={{ fontSize: 12, color: subtitleColor, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={variant === 'brand' ? 'rgba(255,255,255,0.6)' : colors.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.md,
    flex: 1,
  },
  text: { flex: 1, minWidth: 0 },
});
