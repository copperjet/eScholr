import React from 'react';
import { Pressable, View, StyleSheet, ScrollView, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, onPress, style }: ChipProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => { haptics.light(); onPress?.(); }}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary }
          : { backgroundColor: colors.surface, borderColor: colors.border },
        { opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: selected ? colors.brand.onPrimary : colors.textSecondary,
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

interface FilterChipRowProps {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  style?: ViewStyle;
}

export function FilterChipRow({ options, selected, onSelect, style }: FilterChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
    >
      {options.map((opt) => (
        <Chip
          key={opt}
          label={opt}
          selected={opt === selected}
          onPress={() => onSelect(opt)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screen,
    paddingVertical: Spacing.sm,
  },
});
