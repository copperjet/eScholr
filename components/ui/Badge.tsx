import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { Colors, resolveAttBg, resolveAttColor } from '../../constants/Colors';
import { useTheme } from '../../lib/theme';
import type { AttendanceStatus } from '../../types/database';
import { Radius } from '../../constants/Typography';

type Preset = AttendanceStatus | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';
type BadgeVariant = 'solid' | 'tonal' | 'outline' | 'dot';

interface BadgeProps {
  label: string;
  preset?: Preset;
  variant?: BadgeVariant;
  bg?: string;
  fg?: string;
  style?: ViewStyle;
}

const SEMANTIC: Record<string, { bg: string; fg: string }> = {
  success: { bg: Colors.semantic.successLight, fg: Colors.semantic.success },
  warning: { bg: Colors.semantic.warningLight, fg: Colors.semantic.warning },
  error:   { bg: Colors.semantic.errorLight,   fg: Colors.semantic.error },
  info:    { bg: Colors.semantic.infoLight,     fg: Colors.semantic.info },
  neutral: { bg: '#F3F4F6',                     fg: '#6B7280' },
};

const ATT_KEYS: AttendanceStatus[] = ['present', 'absent', 'late', 'ap', 'sick'];

export function Badge({ label, preset = 'neutral', variant = 'tonal', bg, fg, style }: BadgeProps) {
  const { scheme, colors } = useTheme();

  let finalBg: string;
  let finalFg: string;

  if (ATT_KEYS.includes(preset as AttendanceStatus)) {
    finalBg = resolveAttBg(preset as AttendanceStatus, scheme);
    finalFg = resolveAttColor(preset as AttendanceStatus);
  } else if (preset === 'brand') {
    finalBg = colors.brand.primarySoft;
    finalFg = colors.brand.primary;
  } else {
    const s = SEMANTIC[preset] ?? SEMANTIC.neutral;
    finalBg = s.bg;
    finalFg = s.fg;
  }

  finalBg = bg ?? finalBg;
  finalFg = fg ?? finalFg;

  if (variant === 'dot') {
    return (
      <View style={[styles.dotWrapper, style]}>
        <View style={[styles.dot, { backgroundColor: finalFg }]} />
        <ThemedText style={[styles.text, { color: finalFg }]}>{label}</ThemedText>
      </View>
    );
  }

  if (variant === 'outline') {
    return (
      <View style={[styles.badge, { backgroundColor: 'transparent', borderWidth: 1, borderColor: finalFg }, style]}>
        <ThemedText style={[styles.text, { color: finalFg }]}>{label.toUpperCase()}</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: finalBg }, style]}>
      <ThemedText style={[styles.text, { color: finalFg }]}>{label.toUpperCase()}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  dotWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
