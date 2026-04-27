import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { PressableScale } from './PressableScale';
import { useTheme } from '../../lib/theme';
import { Spacing } from '../../constants/Typography';

interface ListItemProps {
  title: string;
  subtitle?: string;
  caption?: string;
  /** Show an avatar with this name (initials fallback) */
  avatarName?: string;
  avatarUrl?: string | null;
  avatarSize?: number;
  /** Or supply a custom leading element instead of avatar */
  leading?: React.ReactNode;
  /** Badge label + optional preset */
  badge?: { label: string; preset?: string };
  /** Custom trailing content */
  trailing?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  /** Show a hairline separator at bottom */
  separator?: boolean;
}

export function ListItem({
  title,
  subtitle,
  caption,
  avatarName,
  avatarUrl,
  avatarSize = 44,
  leading,
  badge,
  trailing,
  showChevron = false,
  onPress,
  style,
  separator = false,
}: ListItemProps) {
  const { colors } = useTheme();

  const inner = (
    <View style={[styles.row, separator && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      {/* Leading */}
      {(leading || avatarName) && (
        <View style={styles.leading}>
          {leading ?? (
            <Avatar name={avatarName!} photoUrl={avatarUrl} size={avatarSize} />
          )}
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <ThemedText variant="h4" numberOfLines={1}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText variant="bodySm" color="muted" numberOfLines={1} style={{ marginTop: 1 }}>
            {subtitle}
          </ThemedText>
        ) : null}
        {caption ? (
          <ThemedText variant="caption" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {caption}
          </ThemedText>
        ) : null}
      </View>

      {/* Trailing */}
      <View style={styles.trailing}>
        {badge ? (
          <Badge
            label={badge.label}
            preset={badge.preset as any}
          />
        ) : null}
        {trailing ?? null}
        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.985} style={[styles.pressable, style]}>
        {inner}
      </PressableScale>
    );
  }

  return <View style={style}>{inner}</View>;
}

const styles = StyleSheet.create({
  pressable: { paddingHorizontal: Spacing.screen },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  leading: { flexShrink: 0 },
  content: { flex: 1, minWidth: 0 },
  trailing: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
