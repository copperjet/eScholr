import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { useStudentHomework } from '../../../hooks/useHomework';
import {
  ThemedText, Avatar, Card, EmptyState, CardSkeleton,
  ScreenHeader, FastList, BottomSheet, Badge,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
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

  const { data: homeworkList, isLoading, isRefetching, refetch } = useStudentHomework(
    schoolId,
    activeChild?.id ?? null,
    null
  );

  if (childrenLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Homework" />
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <CardSkeleton lines={3} /><CardSkeleton lines={3} /><CardSkeleton lines={3} />
        </View>
      </SafeAreaView>
    );
  }

  if (!children?.length) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Homework" />
        <EmptyState
          title="No children linked"
          description="Contact the school to link your account to your children."
          icon="people-outline"
        />
      </SafeAreaView>
    );
  }

  const now = new Date();
  const pending   = (homeworkList ?? []).filter((h) => !h.submission && new Date(h.assignment.due_date) >= now);
  const late      = (homeworkList ?? []).filter((h) => !h.submission && new Date(h.assignment.due_date) < now);
  const submitted = (homeworkList ?? []).filter((h) => h.submission);

  type ListRow = { type: 'header'; label: string } | { type: 'item'; item: any; section: string };
  const listData: ListRow[] = [];
  if (pending.length)   { listData.push({ type: 'header', label: 'DUE' });       pending.forEach((i: any)   => listData.push({ type: 'item', item: i, section: 'pending' })); }
  if (late.length)      { listData.push({ type: 'header', label: 'LATE' });      late.forEach((i: any)      => listData.push({ type: 'item', item: i, section: 'late' })); }
  if (submitted.length) { listData.push({ type: 'header', label: 'SUBMITTED' }); submitted.forEach((i: any) => listData.push({ type: 'item', item: i, section: 'submitted' })); }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Homework"
        subtitle={activeChild?.full_name}
      />

      {/* ── Child Selector ── */}
      {children.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
          {children.map((child, idx) => (
            <Pressable
              key={child.id}
              onPress={() => { haptics.light(); setSelectedChildIdx(idx); }}
              style={[styles.childPill, { backgroundColor: idx === selectedChildIdx ? colors.brand.primary : colors.surfaceSecondary }]}
            >
              <Avatar name={child.full_name} photoUrl={child.photo_url} size={26} />
              <ThemedText variant="caption" style={{ color: idx === selectedChildIdx ? '#fff' : colors.textPrimary, fontWeight: '600' }}>
                {child.full_name.split(' ')[0]}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <CardSkeleton lines={3} /><CardSkeleton lines={3} />
        </View>
      ) : (
        <FastList
          data={listData}
          keyExtractor={(row: any) => row.type === 'header' ? `hdr-${row.label}` : row.item.assignment.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <EmptyState title="No homework" description={`${activeChild?.full_name ?? 'Your child'} has no assigned homework.`} icon="book-outline" />
          }
          renderItem={({ item: row }: { item: ListRow }) => {
            if (row.type === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <ThemedText variant="label" color="muted">{row.label}</ThemedText>
                </View>
              );
            }
            const { item, section } = row;
            const isLate   = section === 'late';
            const isGraded = item.submission?.status === 'graded';
            const hasSub   = !!item.submission;
            const dueDate  = item.assignment.due_date;
            const score    = item.submission?.score;

            return (
              <Pressable
                onPress={() => { haptics.light(); setViewing(item); }}
                style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
              >
                <Card
                  variant="elevated"
                  noPadding
                  accentColor={isLate ? Colors.semantic.error : isGraded ? Colors.semantic.success : colors.brand.primary}
                  accentSide="left"
                  style={styles.card}
                >
                  <View style={{ padding: Spacing.md }}>
                    <View style={styles.cardTop}>
                      <ThemedText style={{ flex: 1, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
                        {item.assignment.title}
                      </ThemedText>
                      {isLate  && <Badge label="Late"      preset="error"   variant="tonal" />}
                      {isGraded && <Badge label="Graded"    preset="success" variant="tonal" />}
                      {hasSub && !isGraded && <Badge label="Submitted" preset="info" variant="tonal" />}
                    </View>

                    <ThemedText variant="bodySm" color="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                      {item.assignment.description || 'No description'}
                    </ThemedText>

                    <View style={styles.cardMeta}>
                      <View style={styles.metaChip}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                        <ThemedText variant="caption" color="muted">
                          {dueDate ? format(parseISO(dueDate), 'dd MMM yy') : '—'}
                        </ThemedText>
                      </View>
                      {item.assignment.subjects?.name && (
                        <ThemedText variant="caption" color="muted">{item.assignment.subjects.name}</ThemedText>
                      )}
                    </View>

                    {score != null && (
                      <View style={[styles.scoreBox, { backgroundColor: Colors.semantic.successLight }]}>
                        <ThemedText variant="caption" style={{ color: Colors.semantic.success, fontWeight: '700' }}>
                          Score: {score}/{item.assignment.max_score}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      {/* ── View detail bottom sheet ── */}
      <BottomSheet
        visible={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.assignment?.title ?? ''}
        snapHeight={500}
      >
        <ThemedText variant="body" style={{ marginBottom: Spacing.md }}>
          {viewing?.assignment?.description || 'No description provided.'}
        </ThemedText>
        <View style={styles.metaChip}>
          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
          <ThemedText variant="caption" color="muted">
            Due: {viewing?.assignment?.due_date ? format(parseISO(viewing.assignment.due_date), 'EEEE, d MMM yyyy') : '—'}
          </ThemedText>
        </View>
        {viewing?.assignment?.subjects?.name && (
          <View style={[styles.metaChip, { marginTop: Spacing.sm }]}>
            <Ionicons name="school-outline" size={14} color={colors.textMuted} />
            <ThemedText variant="caption" color="muted">{viewing.assignment.subjects.name}</ThemedText>
          </View>
        )}
        {viewing?.submission?.score != null && (
          <View style={[styles.feedbackBox, { backgroundColor: Colors.semantic.successLight, marginTop: Spacing.md }]}>
            <ThemedText variant="label" style={{ marginBottom: 4 }}>Score</ThemedText>
            <ThemedText style={{ fontWeight: '700', color: Colors.semantic.success, fontSize: 18 }}>
              {viewing.submission.score}/{viewing.assignment.max_score}
            </ThemedText>
          </View>
        )}
        {viewing?.submission?.feedback && (
          <View style={[styles.feedbackBox, { backgroundColor: colors.brand.primarySoft, marginTop: Spacing.md }]}>
            <ThemedText variant="label" style={{ marginBottom: 4, color: colors.brand.primary }}>Teacher Feedback</ThemedText>
            <ThemedText variant="bodySm">{viewing.submission.feedback}</ThemedText>
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  picker:        { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.sm },
  childPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  list:          { padding: Spacing.screen, gap: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT + Spacing.lg },
  sectionHeader: { paddingVertical: Spacing.sm },
  card:          { marginBottom: 2 },
  cardTop:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardMeta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  metaChip:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreBox:      { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm, marginTop: Spacing.sm },
  feedbackBox:   { padding: Spacing.md, borderRadius: Radius.md },
});
