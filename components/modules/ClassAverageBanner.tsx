import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText, ProgressBar } from '../ui';
import { Spacing, Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';

interface ClassAverageBannerProps {
  average: number | null;
  entered: number;
  total: number;
}

export function ClassAverageBanner({ average, entered, total }: ClassAverageBannerProps) {
  const { colors } = useTheme();

  const pct = total > 0 ? Math.round((entered / total) * 100) : 0;
  const allEntered = entered === total && total > 0;

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* Average block */}
      <View style={styles.avgBlock}>
        <Ionicons name="stats-chart-outline" size={16} color={colors.brand.primary} />
        <View style={{ marginLeft: Spacing.sm }}>
          <ThemedText variant="label" color="muted" style={{ fontSize: 10 }}>CLASS AVG</ThemedText>
          <ThemedText variant="h4" style={{ color: average !== null ? colors.brand.primary : colors.textMuted }}>
            {average !== null ? `${average}` : '—'}
          </ThemedText>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Progress block */}
      <View style={styles.progressBlock}>
        <View style={styles.progressTop}>
          <ThemedText variant="caption" color="muted">
            {entered} of {total} marks entered
          </ThemedText>
          {allEntered && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.semantic.success} style={{ marginLeft: 6 }} />
          )}
        </View>
        <ProgressBar
          value={entered}
          max={total || 1}
          color={allEntered ? Colors.semantic.success : colors.brand.primary}
          height={4}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avgBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
  },
  progressBlock: {
    flex: 1,
    gap: 4,
  },
  progressTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
