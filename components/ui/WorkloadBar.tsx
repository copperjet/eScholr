/**
 * WorkloadBar — M9
 * Per-teacher or per-stream workload mini bar chart shown in the
 * timetable grid's collapsible sidebar.
 *
 * Usage:
 *   <WorkloadBar label="Mr Smith" value={6} max={8} warnAt={7} />
 *
 * Colors:
 *   normal  → brand primary fill
 *   warn    → amber
 *   danger  → red (above max)
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';

interface WorkloadBarProps {
  label: string;
  value: number;      // periods assigned
  max: number;        // max_periods_per_day or per_week cap
  warnAt?: number;    // value at which bar turns amber (default = max - 1)
  unit?: string;      // e.g. 'pd/day' or 'pd/wk'
  style?: ViewStyle;
}

export function WorkloadBar({ label, value, max, warnAt, unit = 'pd', style }: WorkloadBarProps) {
  const { colors } = useTheme();
  const warn = warnAt ?? max - 1;
  const ratio = Math.min(value / Math.max(max, 1), 1);

  const barColor = value > max
    ? '#EF4444'
    : value >= warn
      ? '#F59E0B'
      : colors.brand?.primary ?? '#3B82F6';

  return (
    <View style={[styles.row, style]}>
      <ThemedText style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </ThemedText>
      <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      <ThemedText style={[styles.value, { color: value > max ? '#EF4444' : colors.textMuted }]}>
        {value}/{max}
        {unit ? ` ${unit}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            6,
    paddingVertical: 3,
  },
  label: {
    width:    80,
    fontSize: 11,
  },
  track: {
    flex:         1,
    height:       6,
    borderRadius: 3,
    overflow:     'hidden',
  },
  fill: {
    height:       '100%',
    borderRadius: 3,
  },
  value: {
    fontSize: 10,
    minWidth:  40,
    textAlign: 'right',
  },
});
