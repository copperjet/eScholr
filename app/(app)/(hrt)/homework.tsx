import React, { useState, useCallback } from 'react';
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
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { useTeacherHomework, useHomeworkSubmissions, useCreateHomework, useGradeSubmission, useDeleteHomework } from '../../../hooks/useHomework';
import { ThemedText, Card, Skeleton, EmptyState, Button, CardSkeleton } from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

interface Assignment {
  subject_id: string;
  stream_id: string;
  semester_id: string;
  subjects: { name: string } | null;
  streams: { name: string; grades: { name: string } | null } | null;
}

function useAssignments(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['hrt-homework-assignments', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    queryFn: async () => {
      const db = supabase as any;
      const { data: hrtAssignment } = await db
        .from('hrt_assignments')
        .select('stream_id, semester_id')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId)
        .limit(1)
        .maybeSingle();

      if (!hrtAssignment) return [] as Assignment[];

      const { stream_id, semester_id } = hrtAssignment;

      const { data } = await db
        .from('subject_teacher_assignments')
        .select('subject_id, stream_id, semester_id, subjects(name), streams(name, grades(name))')
        .eq('stream_id', stream_id)
        .eq('semester_id', semester_id)
        .eq('school_id', schoolId);

      return (data ?? []) as unknown as Assignment[];
    },
  });
}

export default function HomeworkScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;

  const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingHomeworkId, setViewingHomeworkId] = useState<string | null>(null);

  const { data: assignments, isLoading: assignmentsLoading } = useAssignments(staffId, schoolId);

  const selectedAssignment = assignments?.[selectedAssignmentIdx] ?? null;
  const semesterId = selectedAssignment?.semester_id ?? null;
  const subjectId = selectedAssignment?.subject_id ?? null;
  const streamId = selectedAssignment?.stream_id ?? null;

  const { data: homeworkList, isLoading: homeworkLoading, refetch } = useTeacherHomework(
    schoolId,
    staffId,
    semesterId
  );

  const { data: submissions, isLoading: submissionsLoading } = useHomeworkSubmissions(
    schoolId,
    viewingHomeworkId
  );

  const createHomework = useCreateHomework(schoolId);
  const gradeSubmission = useGradeSubmission(schoolId);
  const deleteHomework = useDeleteHomework(schoolId);

  const filteredHomework = homeworkList?.filter(
    (h) => h.subject_id === subjectId && h.stream_id === streamId
  ) ?? [];

  const handleCreate = useCallback(
    async (values: {
      title: string;
      description: string;
      dueDate: string;
      maxScore: string;
    }) => {
      if (!subjectId || !streamId || !semesterId || !staffId) return;
      try {
        await createHomework.mutateAsync({
          subjectId,
          streamId,
          semesterId,
          assignedBy: staffId,
          title: values.title,
          description: values.description,
          dueDate: values.dueDate,
          maxScore: parseInt(values.maxScore) || 100,
        });
        setShowCreateModal(false);
        Alert.alert('Success', 'Homework assigned');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to create');
      }
    },
    [subjectId, streamId, semesterId, staffId, createHomework]
  );

  const handleGrade = useCallback(
    async (submissionId: string, score: number, feedback: string) => {
      if (!viewingHomeworkId || !staffId) return;
      try {
        await gradeSubmission.mutateAsync({
          submissionId,
          homeworkId: viewingHomeworkId,
          score,
          feedback,
          gradedBy: staffId,
        });
        Alert.alert('Success', 'Graded');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to grade');
      }
    },
    [viewingHomeworkId, staffId, gradeSubmission]
  );

  const handleDelete = useCallback(
    async (homeworkId: string) => {
      if (!streamId) return;
      Alert.alert('Delete?', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHomework.mutateAsync({ homeworkId, streamId });
              Alert.alert('Deleted');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete');
            }
          },
        },
      ]);
    },
    [streamId, deleteHomework]
  );

  if (assignmentsLoading || homeworkLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Homework</ThemedText>
        </View>
        <Skeleton height={40} style={styles.pickerSkeleton} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </SafeAreaView>
    );
  }

  if (!assignments?.length) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Homework</ThemedText>
        </View>
        <EmptyState
          title="No class assigned"
          description="You need to be assigned as HRT to manage homework."
          icon="book-outline"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <ThemedText variant="h4">Homework</ThemedText>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}
          onPress={() => {
            haptics.light();
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Subject Picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerScroll}
      >
        {assignments.map((a, idx) => (
          <TouchableOpacity
            key={`${a.subject_id}-${idx}`}
            style={[
              styles.pill,
              {
                backgroundColor:
                  idx === selectedAssignmentIdx ? colors.brand.primary : colors.surfaceSecondary,
              },
            ]}
            onPress={() => {
              haptics.light();
              setSelectedAssignmentIdx(idx);
            }}
          >
            <ThemedText
              variant="caption"
              style={{
                color: idx === selectedAssignmentIdx ? '#fff' : colors.textPrimary,
              }}
            >
              {a.subjects?.name ?? 'Subject'}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Homework List */}
      <FlatList
        data={filteredHomework}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        onRefresh={refetch}
        refreshing={homeworkLoading}
        renderItem={({ item }) => (
          <Card style={styles.homeworkCard}>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                setViewingHomeworkId(item.id);
              }}
            >
              <View style={styles.cardHeader}>
                <ThemedText variant="body" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
                  {item.title}
                </ThemedText>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Ionicons name="trash-outline" size={18} color={Colors.semantic.error} />
                </TouchableOpacity>
              </View>
              <ThemedText variant="bodySm" color="secondary" numberOfLines={2} style={styles.desc}>
                {item.description || 'No description'}
              </ThemedText>
              <View style={styles.cardFooter}>
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                  <ThemedText variant="caption" color="secondary">
                    Due: {item.due_date ? format(parseISO(item.due_date), 'dd/MM/yy') : '—'}
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="secondary">
                  Max: {item.max_score}
                </ThemedText>
              </View>
            </TouchableOpacity>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No homework yet"
            description="Tap + to assign homework."
            icon="book-outline"
          />
        }
      />

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <CreateHomeworkModal
          colors={colors}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          loading={createHomework.isPending}
        />
      </Modal>

      {/* Submissions Modal */}
      <Modal visible={!!viewingHomeworkId} animationType="slide" transparent>
        <SubmissionsModal
          colors={colors}
          homework={filteredHomework.find((h) => h.id === viewingHomeworkId)}
          submissions={submissions ?? []}
          loading={submissionsLoading}
          onClose={() => setViewingHomeworkId(null)}
          onGrade={handleGrade}
          grading={gradeSubmission.isPending}
        />
      </Modal>
    </SafeAreaView>
  );
}

function CreateHomeworkModal({
  colors,
  onClose,
  onSubmit,
  loading,
}: {
  colors: any;
  onClose: () => void;
  onSubmit: (values: any) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [maxScore, setMaxScore] = useState('100');

  return (
    <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContent, { backgroundColor: colors.background }]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <ThemedText variant="h4">Assign Homework</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Title"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              { color: colors.textPrimary, borderColor: colors.border },
            ]}
            placeholder="Description"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Due Date (YYYY-MM-DD)"
            placeholderTextColor={colors.textSecondary}
            value={dueDate}
            onChangeText={setDueDate}
          />
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Max Score"
            placeholderTextColor={colors.textSecondary}
            value={maxScore}
            onChangeText={setMaxScore}
            keyboardType="number-pad"
          />
        </ScrollView>

        <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button
            label="Assign"
            loading={loading}
            onPress={() => {
              if (!title.trim()) { Alert.alert('Validation', 'Title is required'); return; }
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || isNaN(Date.parse(dueDate))) {
                Alert.alert('Validation', 'Due date must be YYYY-MM-DD format');
                return;
              }
              onSubmit({ title, description, dueDate, maxScore });
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SubmissionsModal({
  colors,
  homework,
  submissions,
  loading,
  onClose,
  onGrade,
  grading,
}: {
  colors: any;
  homework: any;
  submissions: any[];
  loading: boolean;
  onClose: () => void;
  onGrade: (id: string, score: number, feedback: string) => void;
  grading: boolean;
}) {
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');

  if (!homework) return null;

  return (
    <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View style={[styles.modalContent, { backgroundColor: colors.background, flex: 1 }]}>
        <View style={styles.modalHeader}>
          <ThemedText variant="h4" numberOfLines={1} style={{ flex: 1 }}>
            {homework.title}
          </ThemedText>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ThemedText variant="bodySm" color="secondary" style={styles.modalSubtitle}>
          Due: {homework.due_date ? format(parseISO(homework.due_date), 'dd/MM/yy') : '—'} · Max: {homework.max_score}
        </ThemedText>

        {loading ? (
          <CardSkeleton lines={3} />
        ) : (
          <FlatList
            data={submissions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.submissionList}
            renderItem={({ item }) => (
              <Card style={styles.submissionCard}>
                <View style={styles.submissionHeader}>
                  <ThemedText variant="body">
                    {item.students?.full_name ?? 'Student'}
                  </ThemedText>
                  <ThemedText
                    variant="caption"
                    style={{
                      color:
                        item.status === 'graded'
                          ? Colors.semantic.success
                          : item.status === 'late'
                          ? Colors.semantic.error
                          : Colors.semantic.warning,
                    }}
                  >
                    {item.status.toUpperCase()}
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="secondary">
                  Submitted: {new Date(item.submitted_at).toLocaleDateString()}
                </ThemedText>
                {item.submission_text && (
                  <ThemedText variant="bodySm" style={styles.submissionText}>
                    {item.submission_text}
                  </ThemedText>
                )}
                {item.score !== null && (
                  <ThemedText variant="bodySm" style={styles.scoreText}>
                    Score: {item.score}/{homework.max_score}
                  </ThemedText>
                )}

                {gradingId === item.id ? (
                  <View style={styles.gradeForm}>
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                      placeholder="Score"
                      placeholderTextColor={colors.textSecondary}
                      value={score}
                      onChangeText={setScore}
                      keyboardType="number-pad"
                    />
                    <TextInput
                      style={[
                        styles.input,
                        styles.textArea,
                        { color: colors.textPrimary, borderColor: colors.border },
                      ]}
                      placeholder="Feedback"
                      placeholderTextColor={colors.textSecondary}
                      value={feedback}
                      onChangeText={setFeedback}
                      multiline
                    />
                    <View style={styles.gradeActions}>
                      <Button label="Cancel" variant="ghost" onPress={() => setGradingId(null)} />
                      <Button
                        label="Save"
                        loading={grading}
                        onPress={() => {
                          onGrade(item.id, parseInt(score) || 0, feedback);
                          setGradingId(null);
                          setScore('');
                          setFeedback('');
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <Button
                    label={item.score !== null ? 'Update Grade' : 'Grade'}
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setGradingId(item.id);
                      setScore(item.score?.toString() ?? '');
                      setFeedback(item.feedback ?? '');
                    }}
                    style={styles.gradeBtn}
                  />
                )}
              </Card>
            )}
            ListEmptyComponent={
              <EmptyState
                title="No submissions yet"
                description="Students will appear here after submitting."
                icon="document-text-outline"
              />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerScroll: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  pickerSkeleton: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  list: {
    padding: Spacing.base,
    gap: Spacing.md,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  cardSkeleton: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  homeworkCard: {
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  desc: {
    marginTop: Spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.base,
  },
  modalContent: {
    borderRadius: Radius.lg,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalSubtitle: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  modalBody: {
    padding: Spacing.base,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: Typography.body.fontSize,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submissionList: {
    padding: Spacing.base,
    paddingBottom: 50,
  },
  submissionCard: {
    marginBottom: Spacing.md,
  },
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submissionText: {
    marginTop: Spacing.sm,
    backgroundColor: '#f5f5f5',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  scoreText: {
    marginTop: Spacing.xs,
  },
  gradeBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  gradeForm: {
    marginTop: Spacing.sm,
  },
  gradeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
});
