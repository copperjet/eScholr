import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { IconChip } from './IconChip';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius, Shadow } from '../../constants/Typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface StatCardProps {
  label: string;
  value: string | number;
  /** Ionicons icon name */
  icon?: IoniconsName;
  iconBg?: string;
  iconColor?: string;
  /** Small caption below label */
  caption?: string;
  /** 'up' | 'down' with a color hint */
  trend?: { direction: 'up' | 'down'; label: string };
  /** 'standard' fills card normally; 'hero' uses gradient brand bg */
  variant?: 'standard' | 'hero';
  style?: ViewStyle;
  onPress?: () => void;
}

export function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  caption,
  trend,
  variant = 'standard',
  style,
}: StatCardProps) {
  const { colors } = useTheme();

  if (variant === 'hero') {
    return (
      <View style={[styles.hero, { backgroundColor: colors.brand.primary }, Shadow.lg, style]}>
        {icon && (
          <IconChip
            icon={<Ionicons name={icon} size={22} color={colors.brand.primary} />}
            bg="rgba(255,255,255,0.2)"
            size={46}
            radius={Radius.md}
          />
        )}
        <ThemedText style={styles.heroValue}>{value}</ThemedText>
        <ThemedText style={styles.heroLabel}>{label}</ThemedText>
        {caption && (
          <ThemedText style={styles.heroCaption}>{caption}</ThemedText>
        )}
        {trend && (
          <View style={styles.trendRow}>
            <Ionicons
              name={trend.direction === 'up' ? 'arrow-up' : 'arrow-down'}
              size={12}
              color="rgba(255,255,255,0.8)"
            />
            <ThemedText style={styles.heroCaption}>{trend.label}</ThemedText>
          </View>
        )}
      </View>
    );
  }

  const trendColor = trend?.direction === 'up'
    ? colors.brand.primary
    : '#DC2626';

  return (
    <View style={[styles.standard, { backgroundColor: colors.surface }, Shadow.sm, style]}>
      {icon && (
        <IconChip
          icon={<Ionicons name={icon} size={18} color={iconColor ?? colors.brand.primary} />}
          bg={iconBg ?? colors.brand.primarySoft}
          size={38}
          radius={Radius.sm}
        />
      )}
      <ThemedText style={styles.value}>{value}</ThemedText>
      <ThemedText variant="caption" color="muted" numberOfLines={1}>{label}</ThemedText>
      {trend && (
        <View style={styles.trendRow}>
          <Ionicons
            name={trend.direction === 'up' ? 'trending-up' : 'trending-down'}
            size={11}
            color={trendColor}
          />
          <ThemedText style={{ fontSize: 10, color: trendColor, fontWeight: '600', marginLeft: 2 }}>
            {trend.label}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  standard: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.xs,
    flex: 1,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: Spacing.sm,
  },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: Spacing.sm,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  heroCaption: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
});
