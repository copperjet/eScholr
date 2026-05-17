import React, { useState } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Card, Chip, EmptyState, ErrorState,
  ListItemSkeleton, BottomSheet, Avatar, ModuleGate, ModuleDisabledScreen, Button,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import {
  useECACategories, useECAEligibleActivities, useECAStudentChoices,
  useECAStudentAssignments, useSubmitECAChoices,
  type ECAActivity, type ECACategory,
} from '../../../hooks/useECA';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

interface ChildRow {
  id: string;
  full_name: string;
  photo_url: string | null;
  student_number: string;
  stream_id: string;
}

function useChildren(parentId: string | null, schoolId: string) {
  return useQuery<ChildRow[]>({
    queryKey: ['parent-children-eca', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('student_parent_links')
        .select('students(id, full_name, photo_url, student_number, stream_id)')
        .eq('parent_id', parentId!)
        .eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.students).filter(Boolean) as ChildRow[];
    },
  });
}

function windowStatus(act: ECAActivity): 'open' | 'upcoming' | 'closed' | 'none' {
  if (!act.choice_window_start && !act.choice_window_end) return 'none';
  const now = Date.now();
  const start = act.choice_window_start ? new Date(act.choice_window_start).getTime() : 0;
  const end   = act.choice_window_end   ? new Date(act.choice_window_end).getTime()   : Infinity;
  if (now < start) return 'upcoming';
  if (now > end)   return 'closed';
  return 'open';
}

function anyWindowOpen(activities: ECAActivity[]): boolean {
  return activities.some((a) => {
    const ws = windowStatus(a);
    return ws === 'open' || ws === 'none';
  });
}

interface ChoicesSheetProps {
  visible: boolean;
  onClose: () => void;
  category: ECACategory;
  student: ChildRow;
  activities: ECAActivity[];
}

function ChoicesSheet({ visible, onClose, category, student, activities }: ChoicesSheetProps) {
  const { colors } = useTheme();
  const submitMutation = useSubmitECAChoices();
  const existingChoices = useECAStudentChoices(student.id, category.id);
  const [picks, setPicks] = useState<Array<string | null>>(Array(category.max_choices).fill(null));

  React.useEffect(() => {
    if (visible && existingChoices.data) {
      const arr = Array(category.max_choices).fill(null) as Array<string | null>;
      existingChoices.data.forEach((c) => {
        if (c.choice_rank >= 1 && c.choice_rank <= category.max_choices) {
          arr[c.choice_rank - 1] = c.activity_id;
        }
      });
      setPicks(arr);
    }
  }, [visible, existingChoices.data, category.max_choices]);

  const setPick = (rankIdx: number, actId: string | null) => {
    setPicks((prev) => {
      const next = [...prev];
      if (actId) { next.forEach((v, i) => { if (v === actId && i !== rankIdx) next[i] = null; }); }
      next[rankIdx] = actId;
      return next;
    });
  };

  const handleSubmit = async () => {
    const choices = picks
      .map((actId, i) => actId ? { rank: i + 1, activity_id: actId } : null)
      .filter(Boolean) as Array<{ rank: number; activity_id: string }>;

    if (!choices.length) {
      Alert.alert('No choices', 'Select at least one activity.');
      return;
    }

    try {
      const result = await submitMutation.mutateAsync({
        studentId: student.id, categoryId: category.id, choices,
      });
      const msg = result.status === 'waitlisted'
        ? 'All choices are full — you are on the waitlist.'
        : `Assigned to choice #${result.assigned_from_choice_rank ?? '?'}.`;
      Alert.alert('Submitted', msg);
      onClose();
    } catch (err: any) {
      const code = (err.message ?? '').toLowerCase();
      const human: Record<string, string> = {
        out_of_window:        'The choice window is not currently open.',
        not_eligible:         'Your child is not eligible for one of the selected activities.',
        invalid_choice_count: 'Invalid number of choices.',
        not_parent:           'Could not verify parent account.',
        not_linked:           'Your account is not linked to this student.',
        activity_not_found:   'One of the selected activities could not be found.',
        activity_not_published: 'One of the selected activities is not yet published.',
        category_not_found:   'Category not found.',
      };
      const matched = Object.keys(human).find((k) => code.includes(k));
      Alert.alert('Submission failed', matched ? human[matched] : (err.message ?? 'Unknown error'));
    }
  };

  const s = sheetStyles(colors);
  const openActivities = activities.filter((a) => {
    const ws = windowStatus(a);
    return ws === 'open' || ws === 'none';
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`${category.name} — ${student.full_name}`}>
      <ScrollView contentContainerStyle={s.content}>
        {Array.from({ length: category.max_choices }).map((_, i) => {
          const picked = picks[i];
          return (
            <View key={i} style={s.rankRow}>
              <View style={[s.rankBadge, { backgroundColor: colors.brand.primary }]}>
                <ThemedText style={s.rankNum}>{i + 1}</ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.rankLabel}>Choice {i + 1}</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={s.chipRow}>
                    <Chip label="None" selected={!picked} onPress={() => setPick(i, null)} />
                    {openActivities.map((act) => (
                      <Chip
                        key={act.id}
                        label={act.name}
                        selected={picked === act.id}
                        onPress={() => setPick(i, act.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          );
        })}
        {openActivities.length === 0 && (
          <ThemedText style={s.note}>No activities currently available in this category.</ThemedText>
        )}
        <Button
          label={submitMutation.isPending ? 'Submitting…' : 'Submit Choices'}
          onPress={handleSubmit}
          disabled={submitMutation.isPending || openActivities.length === 0}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const sheetStyles = (colors: any) => StyleSheet.create({
  content:   { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  rankRow:   { flexDirection: 'row', gap: 12, marginBottom: Spacing.md, alignItems: 'flex-start' },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rankNum:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  rankLabel: { fontWeight: '600', fontSize: 13 },
  chipRow:   { flexDirection: 'row', gap: 6 },
  note:      { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginVertical: Spacing.md },
});

function ParentECAContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const children = useChildren(user?.parentId ?? null, sid);
  const [activeChild, setActiveChild] = useState<ChildRow | null>(null);

  const child = activeChild ?? (children.data?.[0] ?? null);

  const categories  = useECACategories();
  const eligible    = useECAEligibleActivities(child?.id);
  const assignments = useECAStudentAssignments(child?.id);

  const [choiceSheet, setChoiceSheet] = useState<ECACategory | null>(null);

  React.useEffect(() => {
    if (!activeChild && children.data?.length) setActiveChild(children.data[0]);
  }, [children.data]);

  const s = styles(colors);
  const cats = categories.data ?? [];
  const acts = eligible.data ?? [];
  const asgns = assignments.data ?? [];

  if (children.isError) return <ErrorState title="Could not load children" onRetry={children.refetch} />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title="Extra-Curricular" />

      {(children.data ?? []).length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.childBar} contentContainerStyle={s.childBarContent}>
          {(children.data ?? []).map((c) => (
            <Pressable key={c.id} onPress={() => setActiveChild(c)} style={[s.childChip, child?.id === c.id && { borderColor: colors.brand.primary, backgroundColor: colors.brand.primarySoft }]}>
              <Avatar name={c.full_name} photoUrl={c.photo_url} size={28} />
              <ThemedText style={[s.childName, child?.id === c.id && { color: colors.brand.primary }]}>{c.full_name}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={s.content}>
        {categories.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} />)
          : !child
            ? <EmptyState icon="people-outline" title="No children linked" description="Your account has no children linked yet." />
            : cats.length === 0
              ? <EmptyState icon="football-outline" title="No ECA categories" description="No extra-curricular activities have been configured yet." />
              : cats.map((cat) => {
                const catActivities = acts.filter((a) => a.category_id === cat.id);
                const catAssignment = asgns.find((a) => a.category_id === cat.id);
                const open = anyWindowOpen(catActivities);

                return (
                  <Card key={cat.id} style={s.catCard}>
                    <View style={s.catHeader}>
                      <ThemedText style={s.catName}>{cat.name}</ThemedText>
                      {catAssignment ? (
                        <View style={[s.statusPill, { backgroundColor: catAssignment.status === 'assigned' ? '#D1FAE5' : '#FEF3C7' }]}>
                          <ThemedText style={[s.statusText, { color: catAssignment.status === 'assigned' ? '#065F46' : '#92400E' }]}>
                            {catAssignment.status === 'waitlisted' ? 'Waitlisted' : 'Assigned'}
                          </ThemedText>
                        </View>
                      ) : (
                        <View style={[s.statusPill, { backgroundColor: open ? '#DBEAFE' : '#F3F4F6' }]}>
                          <ThemedText style={[s.statusText, { color: open ? '#1E40AF' : '#6B7280' }]}>
                            {open ? 'Open' : 'Closed'}
                          </ThemedText>
                        </View>
                      )}
                    </View>

                    {(() => {
                      const soonest = catActivities.find((a) => windowStatus(a) === 'open') ?? catActivities.find((a) => windowStatus(a) === 'upcoming');
                      if (!soonest) return null;
                      const ws = windowStatus(soonest);
                      if (ws === 'open' && soonest.choice_window_end) {
                        return <ThemedText style={s.windowText}>Closes {formatDistanceToNow(new Date(soonest.choice_window_end), { addSuffix: true })}</ThemedText>;
                      }
                      if (ws === 'upcoming' && soonest.choice_window_start) {
                        return <ThemedText style={s.windowText}>Opens {formatDistanceToNow(new Date(soonest.choice_window_start), { addSuffix: true })}</ThemedText>;
                      }
                      return null;
                    })()}

                    {catAssignment?.eca_activities && (
                      <View style={s.assignedRow}>
                        <Ionicons name="checkmark-circle" size={16} color={catAssignment.status === 'assigned' ? '#10B981' : '#F59E0B'} />
                        <ThemedText style={s.assignedText}>
                          {catAssignment.status === 'assigned'
                            ? `${catAssignment.eca_activities.name} · choice #${catAssignment.assigned_from_choice_rank ?? '—'}`
                            : `Waitlisted for ${catAssignment.eca_activities.name}`
                          }
                        </ThemedText>
                      </View>
                    )}

                    {open && (
                      <Pressable
                        style={[s.chooseBtn, { borderColor: colors.brand.primary }]}
                        onPress={() => setChoiceSheet(cat)}
                      >
                        <ThemedText style={[s.chooseBtnText, { color: colors.brand.primary }]}>
                          {catAssignment ? 'Edit Choices' : 'Choose Activities'}
                        </ThemedText>
                      </Pressable>
                    )}

                    {catActivities.length > 0 && (
                      <View style={s.actList}>
                        {catActivities.slice(0, 4).map((act) => (
                          <View key={act.id} style={s.actItem}>
                            <ThemedText style={s.actName}>{act.name}</ThemedText>
                            {act.fee_amount > 0 && (
                              <ThemedText style={s.fee}>Fee: {act.fee_amount}</ThemedText>
                            )}
                          </View>
                        ))}
                        {catActivities.length > 4 && (
                          <ThemedText style={s.more}>+{catActivities.length - 4} more</ThemedText>
                        )}
                      </View>
                    )}
                  </Card>
                );
              })
        }
      </ScrollView>

      {choiceSheet && child && (
        <ChoicesSheet
          visible={!!choiceSheet}
          onClose={() => setChoiceSheet(null)}
          category={choiceSheet}
          student={child}
          activities={acts.filter((a) => a.category_id === choiceSheet.id)}
        />
      )}
    </SafeAreaView>
  );
}

export default function ParentECAScreen() {
  return (
    <ModuleGate
      module="eca"
      fallback={<ModuleDisabledScreen module="eca" />}
    >
      <ParentECAContent />
    </ModuleGate>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:            { flex: 1, backgroundColor: colors.background },
  childBar:        { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 56 },
  childBarContent: { padding: Spacing.sm, gap: Spacing.sm, flexDirection: 'row' },
  childChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  childName:       { fontSize: 13, fontWeight: '600' },
  content:         { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },
  catCard:         { gap: 8 },
  catHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName:         { fontSize: 16, fontWeight: '700' },
  statusPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText:      { fontSize: 11, fontWeight: '700' },
  windowText:      { fontSize: 12, color: colors.textMuted },
  assignedRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignedText:    { fontSize: 14, fontWeight: '500', flex: 1 },
  chooseBtn:       { borderWidth: 1, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  chooseBtnText:   { fontWeight: '600', fontSize: 14 },
  actList:         { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 },
  actItem:         { flexDirection: 'row', justifyContent: 'space-between' },
  actName:         { fontSize: 13, color: colors.textMuted },
  fee:             { fontSize: 12, color: colors.textMuted },
  more:            { fontSize: 12, color: colors.brand.primary },
});
