/**
 * ColorSwatchPicker — M9
 * Admin palette editor for subject_colors.
 * Shows a grid of 12 WCAG-AA swatch pairs; tapping one selects it.
 * Used in app/(app)/(admin)/timetable/colors.tsx.
 *
 * Also includes a contrast ratio display so admins can verify WCAG-AA.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';

// ── WCAG-AA palette (same as migration 079) ───────────────────

export const PALETTE_PRESETS: Array<{ bg: string; fg: string; name: string }> = [
  { bg: '#EFF6FF', fg: '#1D4ED8', name: 'Blue' },
  { bg: '#F0FDF4', fg: '#15803D', name: 'Green' },
  { bg: '#FFF7ED', fg: '#C2410C', name: 'Orange' },
  { bg: '#FDF4FF', fg: '#7E22CE', name: 'Purple' },
  { bg: '#FFFBEB', fg: '#92400E', name: 'Amber' },
  { bg: '#F0F9FF', fg: '#0369A1', name: 'Sky' },
  { bg: '#FFF1F2', fg: '#BE123C', name: 'Rose' },
  { bg: '#ECFDF5', fg: '#065F46', name: 'Emerald' },
  { bg: '#F5F3FF', fg: '#4C1D95', name: 'Violet' },
  { bg: '#FEF3C7', fg: '#78350F', name: 'Yellow' },
  { bg: '#E0F2FE', fg: '#075985', name: 'Cyan' },
  { bg: '#FCE7F3', fg: '#9D174D', name: 'Pink' },
];

/** Approximate WCAG contrast ratio (simplified luminance diff) */
function hexLum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = hexLum(hex1); const l2 = hexLum(hex2);
  const lighter = Math.max(l1, l2); const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

interface ColorSwatchPickerProps {
  /** Currently selected bg/fg pair */
  value?: { bg: string; fg: string };
  onChange: (swatch: { bg: string; fg: string }) => void;
  /** Show custom hex inputs (future). Default false. */
  showCustom?: boolean;
  style?: ViewStyle;
}

export function ColorSwatchPicker({ value, onChange, showCustom = false, style }: ColorSwatchPickerProps) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.grid}>
        {PALETTE_PRESETS.map((swatch, idx) => {
          const isSelected = value?.bg === swatch.bg && value?.fg === swatch.fg;
          const ratio      = contrastRatio(swatch.bg, swatch.fg);
          const isAAPass   = ratio >= 4.5;

          return (
            <TouchableOpacity
              key={swatch.name}
              onPress={() => onChange({ bg: swatch.bg, fg: swatch.fg })}
              style={[
                styles.swatch,
                { backgroundColor: swatch.bg, borderColor: isSelected ? swatch.fg : colors.border },
                isSelected && { borderWidth: 2 },
              ]}
              activeOpacity={0.7}
            >
              {/* Sample text in fg color */}
              <ThemedText style={[styles.swatchLabel, { color: swatch.fg }]}>
                Aa
              </ThemedText>
              <ThemedText style={[styles.swatchName, { color: swatch.fg + 'AA' }]}>
                {swatch.name}
              </ThemedText>

              {/* WCAG indicator */}
              {!isAAPass && (
                <View style={styles.warnBadge}>
                  <Ionicons name="warning-outline" size={8} color="#F59E0B" />
                </View>
              )}

              {/* Selected check */}
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: swatch.fg }]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Contrast info for selected */}
      {value && (
        <View style={[styles.contrastInfo, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.contrastSample, { backgroundColor: value.bg }]}>
            <ThemedText style={{ color: value.fg, fontWeight: '700', fontSize: 13 }}>
              Sample Text
            </ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.contrastLabel, { color: colors.textSecondary }]}>
              Contrast ratio: {contrastRatio(value.bg, value.fg).toFixed(2)}:1
            </ThemedText>
            <ThemedText style={[styles.contrastLabel, {
              color: contrastRatio(value.bg, value.fg) >= 4.5 ? '#15803D' : '#C2410C',
              fontWeight: '700',
            }]}>
              {contrastRatio(value.bg, value.fg) >= 4.5 ? 'WCAG AA ✓' : 'Fails WCAG AA'}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
  },
  swatch: {
    width:         68,
    height:        56,
    borderRadius:   8,
    borderWidth:    1,
    padding:        6,
    justifyContent: 'center',
    alignItems:     'center',
    position:       'relative',
    overflow:       'hidden',
  },
  swatchLabel: {
    fontSize:   16,
    fontWeight: '700',
  },
  swatchName: {
    fontSize:  9,
    marginTop: 2,
  },
  warnBadge: {
    position:        'absolute',
    top:              3,
    left:             3,
    backgroundColor: '#FEF3C7',
    borderRadius:     4,
    padding:          1,
  },
  checkBadge: {
    position:     'absolute',
    top:           3,
    right:         3,
    borderRadius: 99,
    padding:       1,
  },
  contrastInfo: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:             12,
    marginTop:       12,
    padding:         12,
    borderRadius:    8,
    borderWidth:     1,
  },
  contrastSample: {
    paddingHorizontal: 10,
    paddingVertical:    6,
    borderRadius:       6,
  },
  contrastLabel: {
    fontSize: 11,
  },
});
