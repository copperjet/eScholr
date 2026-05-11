/**
 * ConflictBadge — M9
 * Small error indicator placed on a timetable slot cell.
 * Shows an Ionicons warning icon + optional count in a red pill.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';

interface ConflictBadgeProps {
  count?: number;   // number of conflicts on this slot (default 1)
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function ConflictBadge({ count = 1, size = 'sm', style }: ConflictBadgeProps) {
  const iconSize = size === 'md' ? 14 : 10;
  const pillSize = size === 'md' ? 20 : 14;

  return (
    <View style={[styles.pill, { width: count > 1 ? undefined : pillSize, height: pillSize }, style]}>
      <Ionicons name="warning" size={iconSize} color="#fff" />
      {count > 1 && (
        <ThemedText style={styles.count}>{count}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#EF4444',
    borderRadius:    99,
    paddingHorizontal: 3,
    gap: 1,
  },
  count: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
});
