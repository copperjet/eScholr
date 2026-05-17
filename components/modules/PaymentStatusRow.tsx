import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText, Avatar } from '../ui';
import { Spacing, Radius } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import { type FinanceRecord } from '../../hooks/useFinance';

interface Props {
  record: FinanceRecord;
  onPress: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function PaymentStatusRow({ record, onPress, selected = false, onToggleSelect }: Props) {
  const { colors } = useTheme();
  const paid = record.status === 'paid';
  const statusColor = paid ? Colors.semantic.success : Colors.semantic.error;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.row,
        {
          backgroundColor: selected ? Colors.semantic.success + '10' : colors.surface,
          borderColor: selected ? Colors.semantic.success : colors.border,
        },
      ]}
    >
      {onToggleSelect && (
        <TouchableOpacity onPress={onToggleSelect} style={styles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <View
            style={[
              styles.checkboxInner,
              { backgroundColor: selected ? Colors.semantic.success : 'transparent', borderColor: selected ? Colors.semantic.success : colors.border },
            ]}
          >
            {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        </TouchableOpacity>
      )}

      <Avatar name={record.student.full_name} photoUrl={record.student.photo_url} size={40} />

      <View style={styles.info}>
        <ThemedText variant="body" style={{ fontWeight: '600' }}>{record.student.full_name}</ThemedText>
        <ThemedText variant="caption" color="muted">
          {record.student.student_number}
          {record.student.grade_name ? ` · ${record.student.grade_name} ${record.student.stream_name}` : ''}
        </ThemedText>
      </View>

      <View style={styles.right}>
        {!paid && record.balance > 0 && (
          <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, fontWeight: '700', marginBottom: 2 }}>
            {record.balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </ThemedText>
        )}
        <View style={[styles.badge, { backgroundColor: statusColor + '15' }]}>
          <ThemedText variant="caption" style={{ color: statusColor, fontWeight: '700', fontSize: 10 }}>
            {paid ? 'PAID' : 'UNPAID'}
          </ThemedText>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  checkbox: { justifyContent: 'center', alignItems: 'center' },
  checkboxInner: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
});
