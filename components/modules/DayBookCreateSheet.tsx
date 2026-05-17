import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText, Avatar, BottomSheet } from '../ui';
import { Spacing, Radius } from '../../constants/Typography';
import { type DayBookCategory, DAYBOOK_CATEGORY_META } from '../../hooks/useDayBook';

interface StudentOption {
  id: string;
  full_name: string;
  student_number: string;
  photo_url: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  students: StudentOption[];
  initialStudentId?: string | null;
  isSaving: boolean;
  onSubmit: (params: {
    studentId: string;
    category: DayBookCategory;
    note: string;
    sendToParent: boolean;
  }) => void;
  editEntry?: {
    id: string;
    note: string;
    sendToParent: boolean;
    category: DayBookCategory;
    studentId: string;
  } | null;
  onEditSubmit?: (params: { entryId: string; note: string; sendToParent: boolean }) => void;
}

const CATEGORIES = Object.entries(DAYBOOK_CATEGORY_META) as [DayBookCategory, typeof DAYBOOK_CATEGORY_META[DayBookCategory]][];

export function DayBookCreateSheet({
  visible, onClose, students, initialStudentId, isSaving, onSubmit, editEntry, onEditSubmit,
}: Props) {
  const { colors } = useTheme();
  const isEdit = !!editEntry;

  const [studentId, setStudentId] = useState<string>(initialStudentId ?? '');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [category, setCategory] = useState<DayBookCategory>('other');
  const [note, setNote] = useState('');
  const [sendToParent, setSendToParent] = useState(false);

  // Reset when opening
  React.useEffect(() => {
    if (visible) {
      if (isEdit && editEntry) {
        setStudentId(editEntry.studentId);
        setSelectedStudentIds([editEntry.studentId]);
        setCategory(editEntry.category);
        setNote(editEntry.note);
        setSendToParent(editEntry.sendToParent);
      } else {
        setStudentId(initialStudentId ?? '');
        setSelectedStudentIds(initialStudentId ? [initialStudentId] : []);
        setCategory('other');
        setNote('');
        setSendToParent(false);
      }
    }
  }, [visible, initialStudentId, editEntry]);

  const canSubmit = selectedStudentIds.length > 0 && note.trim().length >= 5;

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isEdit && editEntry && onEditSubmit) {
      onEditSubmit({ entryId: editEntry.id, note: note.trim(), sendToParent });
    } else {
      // For multiple students, create separate entries for each
      selectedStudentIds.forEach(id => {
        onSubmit({ studentId: id, category, note: note.trim(), sendToParent });
      });
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? 'Edit Entry' : 'New Day Book Entry'}
      snapHeight={620}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Student picker (hidden when editing or single student) */}
          {!isEdit && students.length > 1 && (
            <View style={{ marginBottom: Spacing.base }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <ThemedText variant="label" color="muted" style={styles.fieldLabel}>STUDENTS INVOLVED</ThemedText>
                <ThemedText variant="caption" color="muted">
                  {selectedStudentIds.length} {selectedStudentIds.length === 1 ? 'student' : 'students'} selected
                </ThemedText>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.base }}>
                <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
                  {students.map((s) => {
                    const isSelected = selectedStudentIds.includes(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => handleStudentToggle(s.id)}
                        style={[
                          styles.studentChip,
                          {
                            backgroundColor: isSelected ? colors.brand.primary + '15' : colors.surfaceSecondary,
                            borderColor: isSelected ? colors.brand.primary : colors.border,
                            borderWidth: isSelected ? 2 : 1,
                          },
                        ]}
                      >
                        <View style={{ position: 'relative' }}>
                          <Avatar name={s.full_name} photoUrl={s.photo_url} size={28} />
                          {isSelected && (
                            <View style={[
                              styles.selectedBadge,
                              { backgroundColor: colors.brand.primary, borderColor: colors.surface }
                            ]}>
                              <Ionicons name="checkmark" size={8} color="#fff" />
                            </View>
                          )}
                        </View>
                        <ThemedText
                          variant="caption"
                          style={{ 
                            marginLeft: 6, 
                            fontWeight: isSelected ? '700' : '400', 
                            color: isSelected ? colors.brand.primary : colors.textPrimary 
                          }}
                        >
                          {s.full_name.split(' ')[0]}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Category */}
          {!isEdit && (
            <View style={{ marginBottom: Spacing.base }}>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>CATEGORY</ThemedText>
              <View style={styles.catGrid}>
                {CATEGORIES.map(([val, meta]) => (
                  <TouchableOpacity
                    key={val}
                    onPress={() => setCategory(val)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: category === val ? meta.color + '18' : colors.surfaceSecondary,
                        borderColor: category === val ? meta.color : colors.border,
                      },
                    ]}
                  >
                    <Ionicons name={meta.icon as any} size={13} color={category === val ? meta.color : colors.textMuted} />
                    <ThemedText
                      variant="caption"
                      style={{ fontSize: 10, marginLeft: 4, color: category === val ? meta.color : colors.textMuted, fontWeight: category === val ? '700' : '400' }}
                    >
                      {meta.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Note */}
          <View style={{ marginBottom: Spacing.base }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>NOTE</ThemedText>
              <ThemedText variant="caption" color="muted">{note.length}/500</ThemedText>
            </View>
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 500))}
              placeholder="Write a note about this student…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                styles.noteInput,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary },
              ]}
            />
          </View>

          {/* Send to parent toggle */}
          <View style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>Send to parent</ThemedText>
              <ThemedText variant="caption" color="muted">Parent will receive a notification</ThemedText>
            </View>
            <Switch
              value={sendToParent}
              onValueChange={setSendToParent}
              trackColor={{ true: colors.brand.primary }}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit || isSaving}
            style={[
              styles.submitBtn,
              { backgroundColor: canSubmit && !isSaving ? colors.brand.primary : colors.border },
            ]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
              {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Entry'}
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  studentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  selectedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.base,
  },
  submitBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
  },
});
