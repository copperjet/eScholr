import React from 'react';
import { Pressable, View, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Shadow, Radius, Spacing } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

interface FABProps {
  icon: React.ReactNode;
  label?: string;
  onPress: () => void;
  style?: ViewStyle;
  color?: string;
  disabled?: boolean;
}

export function FAB({ icon, label, onPress, style, color, disabled }: FABProps) {
  const { colors } = useTheme();
  const bg = color ?? colors.brand.primary;

  return (
    <Pressable
      onPress={() => { if (!disabled) { haptics.medium(); onPress(); } }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        Shadow.lg,
        label ? styles.extended : styles.round,
        { transform: [{ scale: pressed && !disabled ? 0.95 : 1 }] },
        style,
      ]}
    >
      {icon}
      {label && (
        <ThemedText style={{ color: '#fff', fontWeight: '600', fontSize: 15, marginLeft: Spacing.sm }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: Spacing['2xl'],
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  round: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  extended: {
    height: 52,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
  },
});
