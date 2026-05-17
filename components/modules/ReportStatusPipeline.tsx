/**
 * ReportStatusPipeline — horizontal flow showing report counts at each stage.
 * Adapts to whether finance gate is enabled.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText } from '../ui';
import { Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import type { ReportStatus } from '../../hooks/useReports';

interface Props {
  counts: Partial<Record<ReportStatus, number>>;
  financeGateEnabled?: boolean;
}

interface Stage {
  status: ReportStatus;
  label: string;
  shortLabel: string;
  color: string;
}

const ALL_STAGES: Stage[] = [
  { status: 'draft',            label: 'Draft',    shortLabel: 'Draft',    color: '#9CA3AF' },
  { status: 'pending_approval', label: 'Pending',  shortLabel: 'Pending',  color: Colors.semantic.warning },
  { status: 'approved',         label: 'Approved', shortLabel: 'Approved', color: Colors.semantic.info },
  { status: 'finance_pending',  label: 'Finance',  shortLabel: 'Finance',  color: Colors.semantic.warning },
  { status: 'released',         label: 'Released', shortLabel: 'Released', color: Colors.semantic.success },
];

export function ReportStatusPipeline({ counts, financeGateEnabled = false }: Props) {
  const { colors } = useTheme();

  const stages = financeGateEnabled
    ? ALL_STAGES
    : ALL_STAGES.filter((s) => s.status !== 'finance_pending');

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {stages.map((stage, i) => {
        const count = counts[stage.status] ?? 0;
        const isLast = i === stages.length - 1;
        return (
          <React.Fragment key={stage.status}>
            <View style={styles.stageItem}>
              <View style={[
                styles.countBubble,
                {
                  backgroundColor: count > 0 ? stage.color + '20' : colors.surfaceSecondary,
                  borderColor: count > 0 ? stage.color + '60' : colors.border,
                },
              ]}>
                <ThemedText
                  variant="h4"
                  style={{ color: count > 0 ? stage.color : colors.textMuted, fontSize: 18 }}
                >
                  {count}
                </ThemedText>
              </View>
              <ThemedText
                variant="caption"
                style={{ color: count > 0 ? colors.textSecondary : colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' }}
              >
                {stage.shortLabel}
              </ThemedText>
            </View>
            {!isLast && (
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.border}
                style={styles.arrow}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  stageItem: { alignItems: 'center', minWidth: 48 },
  countBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { marginBottom: 18, marginHorizontal: 2 },
});
