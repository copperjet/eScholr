import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useStudentHomework, useSubmitHomework } from '../../../hooks/useHomework';
import { ThemedText, Card, Skeleton, EmptyState, Button, CardSkeleton } from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

export default function StudentHomework() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const studentId = user?.studentId ?? null;

  const [viewing, setViewing] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState<any | null>(null);

  const { data: homeworkList, isLoading, refetch } = useStudentHomework(
    schoolId,
    studentId,
    null
  );
  const submitHomework = useSubmitHomework(schoolId);

  const handleSubmit = async (text: string) => {
    if (!submitting) return;
    try {
      await submitHomework.mutateAsync({
        homeworkId: submitting.assignment.id,
        studentId: studentId!,
        submissionText: text,
      });
      setSubmitting(null);
      Alert.alert('Success', 'Homework submitted');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Homework</ThemedText>
        </View>
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </SafeAreaView>
    );
  }

  const now = new Date();
  const pending = homeworkList?.filter(
    (h) => !h.submission && new Date(h.assignment.due_date) >= now
  ) ?? [];
  const late = homeworkList?.filter(
    (h) => !h.submission && new Date(h.assignment.due_date) < now
  ) ?? [];
  const submitted = homeworkList?.filter((h) => h.submission) ?? [];

  const renderItem = ({ item }: { item: any }) => {
    const isLate = new Date(item.assignment.due_date) < now && !item.submission;
    const isGraded = item.submission?.status === 'graded';

    return (
      <Card style={styles.card}>
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            setViewing(item);
          }}
        >
          <View style={styles.cardHeader}>
            <ThemedText variant="body" style={{ flex: 1, fontWeight: '600' }}>
              {item.assignment.title}
            </ThemedText>
            {isLate && (
              <ThemedText variant="caption" style={{ color: Colors.semantic.error }}>
                LATE
              </ThemedText>
            )}
            {isGraded && (
              <ThemedText variant="caption" style={{ color: Colors.semantic.success }}>
                GRADED
              </ThemedText>
            )}
          </View>
          <ThemedText variant="bodySm" color="secondary" numberOfLines={2} style={styles.desc}>
            {item.assignment.description || 'No description'}
          </ThemedText>
          <View style={styles.footer}>
            <View style={styles.meta}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <ThemedText variant="caption" color="secondary">
                Due: {item.assignment.due_date}
              </ThemedText>
            </View>
            {item.submission?.score !== null && item.submission?.score !== undefined && (
              <ThemedText variant="caption" style={{ color: Colors.semantic.success }}>
                {item.submission.score}/{item.assignment.max_score}
              </ThemedText>
            )}
          </View>
          {!item.submission && (
            <Button
              label="Submit"
              variant="tonal"
              size="sm"
              onPress={() => setSubmitting(item)}
              style={styles.submitBtn}
            />
          )}
        </TouchableOpacity>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <ThemedText variant="h4">Homework</ThemedText>
      </View>

      <FlatList
        data={[...pending, ...submitted, ...late]}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.assignment.id}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
            title="No homework"
            description="Your teachers will assign homework here."
            icon="book-outline"
          />
        }
      />

      {/* View Modal */}
      <Modal visible={!!viewing} animationType="slide" transparent>
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText variant="h4" numberOfLines={1} style={{ flex: 1 }}>
                {viewing?.assignment?.title}
              </ThemedText>
              <TouchableOpacity onPress={() => setViewing(null)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <ThemedText variant="body">{viewing?.assignment?.description || 'No description'}</ThemedText>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                <ThemedText variant="caption" color="secondary">
                  Due: {viewing?.assignment?.due_date}
                </ThemedText>
              </View>
              {viewing?.submission?.feedback && (
                <View style={styles.feedbackBox}>
                  <ThemedText variant="label" style={{ marginBottom: Spacing.xs }}>
                    Feedback
                  </ThemedText>
                  <ThemedText variant="bodySm">{viewing.submission.feedback}</ThemedText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Submit Modal */}
      <Modal visible={!!submitting} animationType="slide" transparent>
        <SubmitModal
          colors={colors}
          assignment={submitting?.assignment}
          onClose={() => setSubmitting(null)}
          onSubmit={handleSubmit}
          loading={submitHomework.isPending}
        />
      </Modal>
    </SafeAreaView>
  );
}

function SubmitModal({
  colors,
  assignment,
  onClose,
  onSubmit,
  loading,
}: {
  colors: any;
  assignment: any;
  onClose: () => void;
  onSubmit: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState('');

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modal, { backgroundColor: colors.background }]}
      >
        <View style={styles.modalHeader}>
          <ThemedText variant="h4">Submit Homework</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody}>
          <ThemedText variant="bodySm" color="secondary" style={{ marginBottom: Spacing.md }}>
            {assignment?.title}
          </ThemedText>
          <TextInput
            style={[styles.input, styles.area, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Enter your answer here..."
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
          />
        </ScrollView>
        <View style={styles.modalFooter}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button label="Submit" loading={loading} onPress={() => onSubmit(text)} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  list: { padding: Spacing.base, gap: Spacing.md, paddingBottom: TAB_BAR_HEIGHT },
  card: { marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  desc: { marginTop: Spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  submitBtn: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  overlay: { flex: 1, justifyContent: 'center', padding: Spacing.base },
  modal: { borderRadius: Radius.lg, maxHeight: '80%', overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalBody: { padding: Spacing.base },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  feedbackBox: {
    backgroundColor: Colors.semantic.successLight,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: Typography.body.fontSize,
  },
  area: { minHeight: 150, textAlignVertical: 'top' },
});

