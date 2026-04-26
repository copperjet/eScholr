import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
  /** Use 'light' when placed over a dark/gradient background */
  tint?: 'dark' | 'light';
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  right,
  style,
  tint = 'dark',
}: ScreenHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const isLight = tint === 'light';
  const iconColor = isLight ? '#FFFFFF' : colors.textPrimary;
  const iconBg = isLight ? 'rgba(255,255,255,0.18)' : colors.surfaceSecondary;

  const handleBack = () => {
    if (onBack) { onBack(); } else { router.back(); }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Left slot */}
      <View style={styles.side}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: iconBg, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={iconColor} />
          </Pressable>
        )}
      </View>

      {/* Center */}
      <View style={styles.center}>
        <ThemedText
          variant="h3"
          style={{ color: iconColor, textAlign: 'center' }}
          numberOfLines={1}
        >
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            variant="caption"
            style={{ color: isLight ? 'rgba(255,255,255,0.7)' : colors.textMuted, textAlign: 'center' }}
            numberOfLines={1}
          >
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      {/* Right slot */}
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        {right ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  side: {
    width: 40,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
