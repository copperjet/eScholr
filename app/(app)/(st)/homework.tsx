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
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  useTeacherHomework,
  useHomeworkSubmissions,
  useCreateHomework,
  useGradeSubmission,
  useDeleteHomework,
} from '../../../hooks/useHomework';
import {
  ThemedText,
  Card,
  Skeleton,
  EmptyState,
  Button,
  CardSkeleton,
  DatePickerField,
} from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import { format, isPast, isToday, isTomorrow, addDays } from 'date-fns';

interface Assignment {
  subject_id: string;
  stream_id: string;
  semester_id: string;
  subjects: { name: string } | null;
  streams: { name: string; grades: { name: string } | null } | null;
}

// Helper functions for improved UI
const formatDueDate = (dueDate: string): string => {
  const date = new Date(dueDate);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isPast(date)) return 'Overdue';
  return format(date, 'MMM d');
};

const getDueDateStatus = (dueDate: string): string => {
  const date = new Date(dueDate);
  if (isPast(date)) return 'OVERDUE';
  if (isToday(date)) return 'DUE TODAY';
  if (isTomorrow(date)) return 'DUE TOMORROW';
  const daysUntil = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  return `${daysUntil} DAYS`;
};

const getDueDateColor = (dueDate: string, colors: any): string => {
  const date = new Date(dueDate);
  if (isPast(date)) return Colors.semantic.error;
  if (isToday(date)) return Colors.semantic.warning;
  if (isTomorrow(date)) return '#FF9800';
  return colors.brand.primary;
};

function useSTAssignments(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['st-homework-assignments', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('subject_teacher_assignments')
        .select(
          'subject_id, stream_id, semester_id, subjects(name), streams(name, grades(name))'
        )
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId);
      return (data ?? []) as unknown as Assignment[];
    },
  });
}

export default function STHomeworkScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? null;

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: assignments, isLoading: assignsLoading } = useSTAssignments(staffId, schoolId);
  const selected = assignments?.[selectedIdx] ?? null;
  const semesterId = selected?.semester_id ?? null;
  const subjectId = selected?.subject_id ?? null;
  const streamId = selected?.stream_id ?? null;

  const { data: homeworkList, isLoading, refetch } = useTeacherHomework(
    schoolId,
    staffId,
    semesterId
  );
  const { data: submissions, isLoading: subsLoading } = useHomeworkSubmissions(
    schoolId,
    viewingId
  );

  const createHomework = useCreateHomework(schoolId);
  const gradeSubmission = useGradeSubmission(schoolId);
  const deleteHomework = useDeleteHomework(schoolId);

  const filtered =
    homeworkList?.filter((h) => h.subject_id === subjectId && h.stream_id === streamId) ?? [];

  const handleCreate = useCallback(
    async (vals: { title: string; description: string; dueDate: string; maxScore: string }) => {
      if (!subjectId || !streamId || !semesterId || !staffId) return;
      try {
        await createHomework.mutateAsync({
          subjectId,
          streamId,
          semesterId,
          assignedBy: staffId,
          title: vals.title,
          description: vals.description,
          dueDate: vals.dueDate,
          maxScore: parseInt(vals.maxScore) || 100,
        });
        setShowCreate(false);
        Alert.alert('Success', 'Assigned');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed');
      }
    },
    [subjectId, streamId, semesterId, staffId, createHomework]
  );

  const handleGrade = useCallback(
    async (sid: string, score: number, feedback: string) => {
      if (!viewingId || !staffId) return;
      try {
        await gradeSubmission.mutateAsync({
          submissionId: sid,
          homeworkId: viewingId,
          score,
          feedback,
          gradedBy: staffId,
        });
        Alert.alert('Success', 'Graded');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed');
      }
    },
    [viewingId, staffId, gradeSubmission]
  );

  if (assignsLoading || isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Homework</ThemedText>
        </View>
        <Skeleton height={40} style={styles.skeleton} />
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
          title="No assignments"
          description="You need subject assignments to manage homework."
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
            setShowCreate(true);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.picker}
      >
        {assignments.map((a, idx) => (
          <TouchableOpacity
            key={`${a.subject_id}-${idx}`}
            style={[
              styles.pill,
              {
                backgroundColor:
                  idx === selectedIdx ? colors.brand.primary : colors.surfaceSecondary,
              },
            ]}
            onPress={() => {
              haptics.light();
              setSelectedIdx(idx);
            }}
          >
            <ThemedText
              variant="caption"
              style={{ color: idx === selectedIdx ? '#fff' : colors.textPrimary }}
            >
              {a.subjects?.name ?? 'Subject'}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        contentContainerStyle={styles.list}
        keyExtractor={(i) => i.id}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={({ item }) => (
          <Card style={[
              styles.card,
              {
                shadowColor: colors.textSecondary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }
            ]}>
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                setViewingId(item.id);
              }}
              style={{ padding: 4 }}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="body" numberOfLines={1} style={{ fontWeight: '700', fontSize: 16, color: colors.textPrimary }}>
                    {item.title}
                  </ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: getDueDateColor(item.due_date, colors) }
                    ]}>
                      <ThemedText variant="caption" style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                        {getDueDateStatus(item.due_date)}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => {
                    Alert.alert('Delete?', 'Are you sure?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteHomework.mutate({ homeworkId: item.id, streamId: streamId! }) },
                    ]);
                  }}
                  style={[
                    styles.deleteBtn,
                    { backgroundColor: Colors.semantic.error + '15' }
                  ]}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.semantic.error} />
                </TouchableOpacity>
              </View>
              <ThemedText variant="bodySm" color="secondary" numberOfLines={2} style={[styles.desc, { marginTop: 8 }]}>
                {item.description || 'No description provided'}
              </ThemedText>
              <View style={[styles.footer, { marginTop: 12 }]}>
                <View style={styles.meta}>
                  <View style={[
                    styles.metaItem,
                    { backgroundColor: colors.surfaceSecondary }
                  ]}>
                    <Ionicons name="calendar-outline" size={12} color={colors.brand.primary} />
                    <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '600' }}>
                      {formatDueDate(item.due_date)}
                    </ThemedText>
                  </View>
                  <View style={[
                    styles.metaItem,
                    { backgroundColor: colors.surfaceSecondary }
                  ]}>
                    <Ionicons name="star-outline" size={12} color={colors.textSecondary} />
                    <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '600' }}>
                      {item.max_score} pts
                    </ThemedText>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState title="No homework" description="Tap + to assign." icon="book-outline" />
        }
      />

      <Modal visible={showCreate} animationType="slide" transparent>
        <CreateModal
          colors={colors}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          loading={createHomework.isPending}
        />
      </Modal>

      <Modal visible={!!viewingId} animationType="slide" transparent>
        <SubmissionsModal
          colors={colors}
          homework={filtered.find((h) => h.id === viewingId)}
          submissions={submissions ?? []}
          loading={subsLoading}
          onClose={() => setViewingId(null)}
          onGrade={handleGrade}
          grading={gradeSubmission.isPending}
        />
      </Modal>
    </SafeAreaView>
  );
}

function CreateModal({
  colors,
  onClose,
  onSubmit,
  loading,
}: {
  colors: any;
  onClose: () => void;
  onSubmit: (v: any) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const [max, setMax] = useState('100');

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modal, { backgroundColor: colors.background }]}
      >
        <View style={styles.modalHeader}>
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
            style={[styles.input, styles.area, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Description"
            placeholderTextColor={colors.textSecondary}
            value={desc}
            onChangeText={setDesc}
            multiline
          />
          <DatePickerField
            label="Due Date"
            value={due}
            onChange={setDue}
            placeholder="Select due date"
            minimumDate={new Date().toISOString().slice(0, 10)}
          />
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Max Score"
            placeholderTextColor={colors.textSecondary}
            value={max}
            onChangeText={setMax}
            keyboardType="number-pad"
          />
        </ScrollView>
        <View style={styles.modalFooter}>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button
            label="Assign"
            loading={loading}
            onPress={() => {
              if (!title.trim()) { Alert.alert('Validation', 'Title is required'); return; }
              if (!due) { Alert.alert('Validation', 'Due date is required'); return; }
              onSubmit({ title, description: desc, dueDate: due, maxScore: max });
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
  onGrade: (id: string, s: number, f: string) => void;
  grading: boolean;
}) {
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');

  if (!homework) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View style={[styles.modal, { backgroundColor: colors.background, flex: 1 }]}>
        <View style={styles.modalHeader}>
          <ThemedText variant="h4" numberOfLines={1} style={{ flex: 1 }}>
            {homework.title}
          </ThemedText>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ThemedText variant="bodySm" color="secondary" style={styles.subtitle}>
          Due: {homework.due_date} · Max: {homework.max_score}
        </ThemedText>
        {loading ? (
          <CardSkeleton lines={3} />
        ) : (
          <FlatList
            data={submissions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.subList}
            renderItem={({ item }) => (
              <Card style={styles.subCard}>
                <View style={styles.subHeader}>
                  <ThemedText variant="body">{item.students?.full_name ?? 'Student'}</ThemedText>
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
                  <ThemedText variant="bodySm" style={styles.subText}>
                    {item.submission_text}
                  </ThemedText>
                )}
                {item.score !== null && (
                  <ThemedText variant="bodySm">Score: {item.score}/{homework.max_score}</ThemedText>
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
                      style={[styles.input, styles.area, { color: colors.textPrimary, borderColor: colors.border }]}
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
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <Button
                    label={item.score !== null ? 'Update' : 'Grade'}
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
                title="No submissions"
                description="Students appear here after submitting."
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
  picker: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
    height: 32,
    justifyContent: 'center' as const,
  },
  skeleton: { marginHorizontal: Spacing.base, marginBottom: Spacing.md },
  list: { padding: Spacing.base, gap: Spacing.md, paddingBottom: TAB_BAR_HEIGHT },
  card: { 
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    justifyContent: 'space-between' 
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: { 
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginTop: Spacing.sm 
  },
  meta: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: Spacing.sm 
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    gap: 4,
  },
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
  subtitle: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  modalBody: { padding: Spacing.base },
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
  area: { minHeight: 100, textAlignVertical: 'top' },
  subList: { padding: Spacing.base, paddingBottom: 50 },
  subCard: { marginBottom: Spacing.md },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subText: {
    marginTop: Spacing.sm,
    backgroundColor: '#f5f5f5',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  gradeBtn: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  gradeForm: { marginTop: Spacing.sm },
  gradeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
});
