import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText, ProgressBar } from '../ui';
import { Spacing, Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';

interface AttendanceSummaryCardProps {
  present: number;
  absent: number;
  late: number;
  ap: number;
  sick: number;
  totalDays: number;
  percentage: number;
  /** If true, shows a red threshold alert badge */
  belowThreshold?: boolean;
  /** Compact mode: fewer rows, tighter spacing */
  compact?: boolean;
}

export function AttendanceSummaryCard({
  present,
  absent,
  late,
  ap,
  sick,
  totalDays,
  percentage,
  belowThreshold = false,
  compact = false,
}: AttendanceSummaryCardProps) {
  const { colors } = useTheme();

  const recorded = present + absent + late + ap + sick;
  const pctColor =
    percentage >= 85
      ? Colors.semantic.success
      : percentage >= 75
      ? Colors.semantic.warning
      : Colors.semantic.error;

  const rows = [
    { label: 'Present',             count: present, color: Colors.attendance.present, icon: 'checkmark-circle-outline' as const },
    { label: 'Late',                count: late,    color: Colors.attendance.late,    icon: 'time-outline'             as const },
    { label: 'Absent',              count: absent,  color: Colors.attendance.absent,  icon: 'close-circle-outline'     as const },
    { label: 'Auth. Absence (AP)',  count: ap,      color: Colors.attendance.ap,      icon: 'shield-checkmark-outline' as const },
    { label: 'Sick / Medical',      count: sick,    color: Colors.attendance.sick,    icon: 'medkit-outline'           as const },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header row: percentage + threshold alert */}
      <View style={styles.headerRow}>
        <View>
          <ThemedText variant="h2" style={{ color: pctColor }}>{percentage.toFixed(1)}%</ThemedText>
          <ThemedText variant="caption" color="muted">attendance rate</ThemedText>
        </View>
        {belowThreshold && (
          <View style={[styles.alertBadge, { backgroundColor: Colors.semantic.errorLight }]}>
            <Ionicons name="alert-circle" size={14} color={Colors.semantic.error} />
            <ThemedText variant="label" style={{ color: Colors.semantic.error, marginLeft: 4 }}>
              Below threshold
            </ThemedText>
          </View>
        )}
        <View style={styles.totalBlock}>
          <ThemedText variant="h4" style={{ textAlign: 'right' }}>{recorded}</ThemedText>
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'right' }}>
            of {totalDays} days
          </ThemedText>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <ProgressBar
          value={percentage}
          max={100}
          color={pctColor}
          height={6}
        />
      </View>

      {/* Status breakdown */}
      {!compact && (
        <View style={[styles.breakdownGrid, { borderTopColor: colors.border }]}>
          {rows.map((row) => (
            <View key={row.label} style={styles.breakdownRow}>
              <Ionicons name={row.icon} size={16} color={row.color} />
              <ThemedText variant="bodySm" style={{ flex: 1, marginLeft: Spacing.sm }}>
                {row.label}
              </ThemedText>
              <ThemedText variant="bodySm" style={{ color: row.color, fontWeight: '700' }}>
                {row.count}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {compact && (
        <View style={styles.compactChips}>
          {rows.map((row) => (
            row.count > 0 ? (
              <View key={row.label} style={[styles.compactChip, { borderColor: row.color + '50', backgroundColor: row.color + '14' }]}>
                <ThemedText variant="label" style={{ color: row.color, fontSize: 11 }}>
                  {row.count} {row.label.split(' ')[0]}
                </ThemedText>
              </View>
            ) : null
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  totalBlock: { alignItems: 'flex-end' },
  progressRow: { marginTop: 2 },
  breakdownGrid: {
    gap: 6,
    paddingTop: Spacing.sm,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 4,
  },
  compactChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
