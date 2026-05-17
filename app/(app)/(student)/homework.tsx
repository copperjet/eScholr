import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, TextInput, Pressable, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { useStudentHomework, useSubmitHomework } from '../../../hooks/useHomework';
import {
  ThemedText, Card, EmptyState, Button, CardSkeleton,
  ScreenHeader, FastList, BottomSheet, Badge,
} from '../../../components/ui';
import { Spacing, Radius, Typography, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const SECTION_ORDER = ['pending', 'late', 'submitted'] as const;
const SECTION_LABEL: Record<string, string> = {
  pending:   'Due',
  late:      'Late',
  submitted: 'Submitted',
};
const SECTION_PRESET: Record<string, 'warning' | 'error' | 'success'> = {
  pending:   'warning',
  late:      'error',
  submitted: 'success',
};

type ListRow = { type: 'header'; section: string } | { type: 'item'; item: any; section: string };

export default function StudentHomework() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId  = user?.schoolId ?? '';
  const studentId = user?.studentId ?? null;

  const [viewing,    setViewing]    = useState<any | null>(null);
  const [submitting, setSubmitting] = useState<any | null>(null);
  const [submitText, setSubmitText] = useState('');

  const { data: homeworkList, isLoading, refetch, isRefetching } = useStudentHomework(schoolId, studentId, null);
  const submitHomework = useSubmitHomework(schoolId);

  const now = new Date();
  const pending   = (homeworkList ?? []).filter((h) => !h.submission && new Date(h.assignment.due_date) >= now);
  const late      = (homeworkList ?? []).filter((h) => !h.submission && new Date(h.assignment.due_date) < now);
  const submitted = (homeworkList ?? []).filter((h) => h.submission);

  const listData: ListRow[] = [];
  for (const section of SECTION_ORDER) {
    const items = section === 'pending' ? pending : section === 'late' ? late : submitted;
    if (items.length === 0) continue;
    listData.push({ type: 'header', section });
    items.forEach((item: any) => listData.push({ type: 'item', item, section }));
  }

  const handleSubmit = async () => {
    if (!submitting) return;
    try {
      await submitHomework.mutateAsync({
        homeworkId: submitting.assignment.id,
        studentId:  studentId!,
        submissionText: submitText,
      });
      setSubmitting(null);
      setSubmitText('');
      Alert.alert('Submitted', 'Your homework has been submitted.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Homework" />

      {isLoading ? (
        <View style={{ padding: Spacing.screen, gap: Spacing.md }}>
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </View>
      ) : (
        <FastList
          data={listData}
          keyExtractor={(row: any) => row.type === 'header' ? `hdr-${row.section}` : row.item.assignment.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <EmptyState title="No homework" description="Your teachers will assign homework here." icon="book-outline" />
          }
          renderItem={({ item: row }: { item: ListRow }) => {
            if (row.type === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <ThemedText variant="label" color="muted">{SECTION_LABEL[row.section].toUpperCase()}</ThemedText>
                  <Badge
                    label={row.section === 'pending' ? String(pending.length) : row.section === 'late' ? String(late.length) : String(submitted.length)}
                    preset={SECTION_PRESET[row.section]}
                    variant="tonal"
                  />
                </View>
              );
            }
            const { item, section } = row;
            const isLate    = section === 'late';
            const isGraded  = item.submission?.status === 'graded';
            const dueDate   = item.assignment.due_date;
            const hasSub    = !!item.submission;
            const score     = item.submission?.score;

            return (
              <Pressable
                onPress={() => { haptics.light(); setViewing(item); }}
                style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
              >
              <Card
                variant="elevated"
                style={styles.card}
              >
                <View style={styles.cardInner}>
                  {/* left accent */}
                  <View style={[styles.cardAccent, {
                    backgroundColor: isLate ? Colors.semantic.error : isGraded ? Colors.semantic.success : colors.brand.primary,
                  }]} />

                  <View style={{ flex: 1, padding: Spacing.md }}>
                    <View style={styles.cardTop}>
                      <ThemedText style={{ flex: 1, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
                        {item.assignment.title}
                      </ThemedText>
                      {isLate && <Badge label="Late" preset="error" variant="tonal" />}
                      {isGraded && <Badge label="Graded" preset="success" variant="tonal" />}
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
                      {score != null && (
                        <ThemedText variant="caption" style={{ color: Colors.semantic.success, fontWeight: '700' }}>
                          {score}/{item.assignment.max_score}
                        </ThemedText>
                      )}
                    </View>

                    {!hasSub && (
                      <Button
                        label="Submit Answer"
                        variant="tonal"
                        size="sm"
                        onPress={() => { setSubmitting(item); setSubmitText(''); }}
                        style={{ alignSelf: 'flex-start', marginTop: Spacing.sm }}
                      />
                    )}
                  </View>
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
        snapHeight={460}
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

      {/* ── Submit bottom sheet ── */}
      <BottomSheet
        visible={!!submitting}
        onClose={() => setSubmitting(null)}
        title="Submit Homework"
        snapHeight={420}
      >
        <ThemedText variant="bodySm" color="secondary" style={{ marginBottom: Spacing.md }}>
          {submitting?.assignment?.title}
        </ThemedText>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
          placeholder="Type your answer here…"
          placeholderTextColor={colors.textMuted}
          value={submitText}
          onChangeText={setSubmitText}
          multiline
        />
        <View style={styles.sheetFooter}>
          <Button label="Cancel" variant="ghost" onPress={() => setSubmitting(null)} />
          <Button label="Submit" loading={submitHomework.isPending} onPress={handleSubmit} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  list:          { padding: Spacing.screen, gap: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT + Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, marginBottom: 4 },
  card:          { padding: 0, overflow: 'hidden' },
  cardInner:     { flexDirection: 'row' },
  cardAccent:    { width: 4 },
  cardTop:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardMeta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  metaChip:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedbackBox:   { padding: Spacing.md, borderRadius: Radius.md },
  input:         { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, minHeight: 130, textAlignVertical: 'top', fontSize: Typography.body.fontSize },
  sheetFooter:   { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, paddingTop: Spacing.md },
});

