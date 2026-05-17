/**
 * LockBadge — M9
 * Small lock icon shown on timetable slot cells that are locked
 * (immune to regeneration).
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LockBadgeProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export function LockBadge({ size = 10, color = '#6B7280', style }: LockBadgeProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Ionicons name="lock-closed" size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: '#F3F4F6CC',
    borderRadius: 4,
    padding: 1,
  },
});
