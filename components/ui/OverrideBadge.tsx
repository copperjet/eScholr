/**
 * OverrideBadge — M9
 * Diagonal stripe overlay + corner "SUB" or "CANCEL" tag for slots
 * that have a live daily override applied.
 *
 * Usage: wrap a slot cell's content with this (as absolute-positioned overlay).
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';

export type OverrideType = 'substitute' | 'swap' | 'cancel' | 'room_change' | 'added_lesson';

interface OverrideBadgeProps {
  type: OverrideType;
  /** Corner tag label override. Defaults derived from type. */
  label?: string;
  style?: ViewStyle;
}

const TYPE_COLORS: Record<OverrideType, { stripe: string; tag: string; text: string }> = {
  substitute:   { stripe: '#F59E0B44', tag: '#F59E0B', text: '#fff' },
  swap:         { stripe: '#3B82F644', tag: '#3B82F6', text: '#fff' },
  cancel:       { stripe: '#EF444444', tag: '#EF4444', text: '#fff' },
  room_change:  { stripe: '#8B5CF644', tag: '#8B5CF6', text: '#fff' },
  added_lesson: { stripe: '#10B98144', tag: '#10B981', text: '#fff' },
};

const TYPE_LABELS: Record<OverrideType, string> = {
  substitute:   'SUB',
  swap:         'SWAP',
  cancel:       'CXL',
  room_change:  'RM',
  added_lesson: 'ADD',
};

export function OverrideBadge({ type, label, style }: OverrideBadgeProps) {
  const col = TYPE_COLORS[type] ?? TYPE_COLORS.substitute;
  const tag = label ?? TYPE_LABELS[type] ?? 'OVR';

  return (
    <View style={[StyleSheet.absoluteFillObject, style]} pointerEvents="none">
      {/* Diagonal stripe lines */}
      <View style={[styles.stripeOverlay, { backgroundColor: col.stripe }]} />

      {/* Corner tag */}
      <View style={[styles.cornerTag, { backgroundColor: col.tag }]}>
        <ThemedText style={[styles.tagText, { color: col.text }]}>{tag}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stripeOverlay: {
    ...StyleSheet.absoluteFillObject,
    // CSS-only diagonal stripes aren't natively supported;
    // using a semi-transparent color overlay as the "stripe tint"
  },
  cornerTag: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderBottomLeftRadius: 4,
  },
  tagText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
