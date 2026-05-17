import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isAfter } from 'date-fns';
import { useTheme } from '../../lib/theme';
import { ThemedText, Avatar } from '../ui';
import { Spacing, Radius } from '../../constants/Typography';
import { type DayBookEntry, DAYBOOK_CATEGORY_META } from '../../hooks/useDayBook';

interface Props {
  entry: DayBookEntry;
  showStudent?: boolean;
  showStaff?: boolean;
  onPress?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
}

export function DayBookEntryCard({ entry, showStudent = true, showStaff = false, onPress, onEdit, onArchive }: Props) {
  const { colors } = useTheme();
  const meta = DAYBOOK_CATEGORY_META[entry.category] ?? DAYBOOK_CATEGORY_META.other;
  const editable = isAfter(parseISO(entry.edit_window_closes_at), new Date());

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Category stripe */}
      <View style={[styles.stripe, { backgroundColor: meta.color }]} />

      <View style={styles.body}>
        {/* Top row */}
        <View style={styles.topRow}>
          {showStudent && (
            <View style={styles.studentRow}>
              <Avatar name={entry.student.full_name} photoUrl={entry.student.photo_url} size={32} />
              <View style={{ marginLeft: Spacing.sm }}>
                <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>{entry.student.full_name}</ThemedText>
                <ThemedText variant="caption" color="muted">
                  {entry.student.grade_name} {entry.student.stream_name}
                </ThemedText>
              </View>
            </View>
          )}
          <View style={[styles.catBadge, { backgroundColor: meta.color + '18' }]}>
            <Ionicons name={meta.icon as any} size={12} color={meta.color} />
            <ThemedText variant="caption" style={{ color: meta.color, fontWeight: '600', marginLeft: 3, fontSize: 10 }}>
              {meta.label}
            </ThemedText>
          </View>
        </View>

        {/* Note */}
        <ThemedText variant="bodySm" color="secondary" style={{ marginTop: Spacing.xs, lineHeight: 18 }}>
          {entry.note}
        </ThemedText>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 }}>
            {showStaff && (
              <ThemedText variant="caption" color="muted">{entry.staff_name} ·</ThemedText>
            )}
            <ThemedText variant="caption" color="muted">
              {format(parseISO(entry.created_at), 'h:mm a')}
            </ThemedText>
            {entry.send_to_parent && (
              <View style={[styles.parentBadge, { backgroundColor: colors.brand.primary + '18' }]}>
                <Ionicons name="people-outline" size={10} color={colors.brand.primary} />
                <ThemedText variant="caption" style={{ color: colors.brand.primary, fontSize: 9, marginLeft: 2 }}>
                  Parent
                </ThemedText>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {onEdit && editable && (
              <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            {onArchive && (
              <TouchableOpacity onPress={onArchive} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="archive-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  stripe: { width: 4 },
  body: { flex: 1, padding: Spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  studentRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: Spacing.sm },
  catBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  parentBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
});
