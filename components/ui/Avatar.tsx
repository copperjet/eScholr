import React from 'react';
import { View, Image, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';

interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: number;
  style?: ViewStyle;
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase() || '?';
}

// Generates a consistent hue from the name, keeps saturation/lightness in a
// comfortable range — no more clashing reds or harsh yellows.
function nameToColor(str: string): { bg: string; fg: string } {
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: '#D1FAE5', fg: '#065F46' },
    { bg: '#DBEAFE', fg: '#1E40AF' },
    { bg: '#EDE9FE', fg: '#5B21B6' },
    { bg: '#FCE7F3', fg: '#9D174D' },
    { bg: '#FEF3C7', fg: '#92400E' },
    { bg: '#CFFAFE', fg: '#0E7490' },
    { bg: '#FFE4E6', fg: '#9F1239' },
    { bg: '#F3F4F6', fg: '#374151' },
  ];
  const safe = str || '?';
  let hash = 0;
  for (let i = 0; i < safe.length; i++) hash = safe.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export function Avatar({ name, photoUrl, size = 40, style }: AvatarProps) {
  const { colors } = useTheme();
  const safeName = name || '?';
  const { bg, fg } = nameToColor(safeName);
  const fontSize = Math.round(size * 0.38);

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ width: size, height: size, borderRadius: size / 2 } as ImageStyle, style as ImageStyle]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
        styles.fallback,
        style,
      ]}
    >
      <ThemedText style={{ color: fg, fontSize, fontWeight: '700', lineHeight: fontSize * 1.2 }}>
        {initials(safeName)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
