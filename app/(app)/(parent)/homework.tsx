import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { useStudentHomework } from '../../../hooks/useHomework';
import { ThemedText, Card, Skeleton, EmptyState, Button, CardSkeleton } from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

interface Child {
  id: string;
  full_name: string;
  photo_url: string | null;
  stream_id: string;
  grades: { name: string } | null;
  streams: { name: string } | null;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['parent-children', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, stream_id, grades(name), streams(name))')
        .eq('parent_id', parentId!)
        .eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.students).filter(Boolean) as Child[];
    },
  });
}

export default function ParentHomework() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const parentId = user?.parentId ?? null;

  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const [viewing, setViewing] = useState<any | null>(null);

  const { data: children, isLoading: childrenLoading } = useChildren(parentId, schoolId);
  const activeChild = children?.[selectedChildIdx];

  const { data: homeworkList, isLoading, refetch } = useStudentHomework(
    schoolId,
    activeChild?.id ?? null,
    null
  );

  if (childrenLoading) {
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

  if (!children?.length) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <ThemedText variant="h4">Homework</ThemedText>
        </View>
        <EmptyState
          title="No children linked"
          description="Contact the school to link your account to your children."
          icon="people-outline"
        />
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <ThemedText variant="h4">Homework</ThemedText>
      </View>

      {/* Child Selector */}
      {children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.picker}
        >
          {children.map((child, idx) => (
            <TouchableOpacity
              key={child.id}
              style={[
                styles.pill,
                {
                  backgroundColor:
                    idx === selectedChildIdx ? colors.brand.primary : colors.surfaceSecondary,
                },
              ]}
              onPress={() => {
                haptics.light();
                setSelectedChildIdx(idx);
              }}
            >
              <ThemedText
                variant="caption"
                style={{ color: idx === selectedChildIdx ? '#fff' : colors.textPrimary }}
              >
                {child.full_name}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={[...pending, ...submitted, ...late]}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.assignment.id}
        onRefresh={refetch}
        refreshing={isLoading}
        renderItem={({ item }) => {
          const isLate = new Date(item.assignment.due_date) < now && !item.submission;
          const isGraded = item.submission?.status === 'graded';

          return (
            <Card style={styles.card}>
              <TouchableOpacity onPress={() => setViewing(item)}>
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
                  {!isLate && !isGraded && item.submission && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.warning }}>
                      SUBMITTED
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
                  <ThemedText variant="caption" color="secondary">
                    {item.assignment.subjects?.name}
                  </ThemedText>
                </View>
                {item.submission?.score !== null && item.submission?.score !== undefined && (
                  <View style={styles.scoreBox}>
                    <ThemedText variant="caption" style={{ color: Colors.semantic.success }}>
                      Score: {item.submission.score}/{item.assignment.max_score}
                    </ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No homework"
            description={`${activeChild?.full_name} has no assigned homework.`}
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
              <View style={styles.metaRow}>
                <Ionicons name="school-outline" size={14} color={colors.textSecondary} />
                <ThemedText variant="caption" color="secondary">
                  Subject: {viewing?.assignment?.subjects?.name}
                </ThemedText>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
                <ThemedText variant="caption" color="secondary">
                  Teacher: {viewing?.assignment?.staff?.full_name || 'Unknown'}
                </ThemedText>
              </View>
              {viewing?.submission?.feedback && (
                <View style={styles.feedbackBox}>
                  <ThemedText variant="label" style={{ marginBottom: Spacing.xs }}>
                    Teacher Feedback
                  </ThemedText>
                  <ThemedText variant="bodySm">{viewing.submission.feedback}</ThemedText>
                  {viewing.submission.score !== null && (
                    <ThemedText variant="bodySm" style={{ marginTop: Spacing.sm, color: Colors.semantic.success }}>
                      Score: {viewing.submission.score}/{viewing.assignment.max_score}
                    </ThemedText>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  picker: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  list: { padding: Spacing.base, gap: Spacing.md, paddingBottom: TAB_BAR_HEIGHT },
  card: { marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  desc: { marginTop: Spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  scoreBox: {
    backgroundColor: Colors.semantic.successLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
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
  modalBody: { padding: Spacing.base },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  feedbackBox: {
    backgroundColor: Colors.semantic.infoLight,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
});
