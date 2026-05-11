/**
 * HeatmapOverlay — M9
 * Toggleable heatmap layer that can be placed over a TimetableGrid.
 * Supports three modes:
 *   'teacher_load'   — heat by how many teachers are busy each period
 *   'room_usage'     — heat by how many rooms are occupied each period
 *   'subject_spread' — heat by subject frequency in each period column
 *
 * Renders a semi-transparent colour gradient per cell (green → amber → red).
 * Does NOT intercept touch events (pointerEvents="none").
 *
 * Usage:
 *   <View style={{ position: 'relative' }}>
 *     <TimetableGrid ... />
 *     {showHeatmap && <HeatmapOverlay mode="teacher_load" data={heatData} ... />}
 *   </View>
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';

export type HeatmapMode = 'teacher_load' | 'room_usage' | 'subject_spread';

/** Cell coordinate + normalised heat value 0–1 */
export interface HeatCell {
  day: number;
  periodIndex: number;
  value: number; // 0 = cool, 1 = hot
}

interface HeatmapOverlayProps {
  mode: HeatmapMode;
  cells: HeatCell[];
  /** Cell dimensions must match the underlying grid */
  cellWidth: number;
  cellHeight: number;
  labelWidth: number;   // width of the period-label column
  /** Days rendered in the grid (in order) */
  days: number[];
  /** All period indices rendered (in order, top to bottom) */
  periodIndices: number[];
  style?: ViewStyle;
}

/** Linear interpolation between two hex colours */
function lerpColor(cold: string, hot: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(cold);
  const [r2, g2, b2] = parse(hot);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

const COLD = '#22C55E'; // green
const MID  = '#F59E0B'; // amber
const HOT  = '#EF4444'; // red

function heatColor(value: number): string {
  if (value <= 0.5) return lerpColor(COLD, MID, value * 2);
  return lerpColor(MID, HOT, (value - 0.5) * 2);
}

export function HeatmapOverlay({
  mode, cells, cellWidth, cellHeight, labelWidth, days, periodIndices, style,
}: HeatmapOverlayProps) {
  const cellMap = new Map<string, number>();
  for (const c of cells) cellMap.set(`${c.day}:${c.periodIndex}`, c.value);

  return (
    <View style={[StyleSheet.absoluteFillObject, style]} pointerEvents="none">
      {/* Skip the label column */}
      <View style={{ marginLeft: labelWidth, flexDirection: 'column' }}>
        {/* Header row spacer (same height as grid header) */}
        <View style={{ height: 44 }} />

        {periodIndices.map((pi, rowIdx) => (
          <View key={pi} style={{ flexDirection: 'row' }}>
            {days.map((dow, colIdx) => {
              const value = cellMap.get(`${dow}:${pi}`) ?? 0;
              const color = heatColor(value);
              return (
                <View
                  key={dow}
                  style={[
                    styles.cell,
                    {
                      width:           cellWidth,
                      height:          cellHeight,
                      backgroundColor: color + '55', // 33% opacity
                    },
                  ]}
                >
                  {value > 0.1 && (
                    <ThemedText style={styles.label}>
                      {Math.round(value * 100)}
                    </ThemedText>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={[styles.legendSwatch, { backgroundColor: COLD + 'AA' }]} />
        <ThemedText style={styles.legendText}>Low</ThemedText>
        <View style={[styles.legendSwatch, { backgroundColor: MID + 'AA' }]} />
        <ThemedText style={styles.legendText}>Med</ThemedText>
        <View style={[styles.legendSwatch, { backgroundColor: HOT + 'AA' }]} />
        <ThemedText style={styles.legendText}>High</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    justifyContent: 'center',
    alignItems:     'center',
  },
  label: {
    fontSize:   8,
    color:      '#000',
    fontWeight: '700',
    opacity:    0.6,
  },
  legend: {
    position:       'absolute',
    bottom:          8,
    right:           8,
    flexDirection:  'row',
    alignItems:     'center',
    gap:             4,
    backgroundColor: '#FFFFFFCC',
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:    8,
  },
  legendSwatch: {
    width:        12,
    height:       12,
    borderRadius:  3,
  },
  legendText: {
    fontSize: 9,
    color:    '#374151',
  },
});
