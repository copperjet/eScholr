import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Card, ScreenHeader, BottomSheet, EmptyState, ErrorState,
  FormField, Chip, ListItemSkeleton, Button,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import {
  useECACategories, useECAActivities, useECAActivityDetail,
  useUpsertECACategory, useUpsertECAActivity,
  useSetEligibleStreams, useSetActivityPatrons, usePublishActivity,
  type ECACategory, type ECAActivity,
} from '../../../hooks/useECA';
import { supabase } from '../../../lib/supabase';
import { useQuery } from '@tanstack/react-query';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function useStreams(schoolId: string) {
  return useQuery({
    queryKey: ['streams-list', schoolId],
    enabled: !!schoolId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('streams')
        .select('id, name, grades(name, school_sections(name))')
        .eq('school_id', schoolId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; grades: { name: string; school_sections: { name: string } } | null }>;
    },
  });
}

function useStaff(schoolId: string) {
  return useQuery({
    queryKey: ['staff-list-light', schoolId],
    enabled: !!schoolId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    },
  });
}

interface CatForm { id?: string; name: string; description: string; max_choices: string; allow_paid: boolean }
const emptyCat = (): CatForm => ({ name: '', description: '', max_choices: '3', allow_paid: false });

interface ActForm {
  id?: string; category_id: string; name: string; description: string;
  capacity: string; day_of_week: string; start_time: string; end_time: string;
  location: string; fee_amount: string;
  choice_window_start: string; choice_window_end: string;
}
const emptyAct = (catId: string): ActForm => ({
  id: undefined, category_id: catId, name: '', description: '',
  capacity: '30', day_of_week: '1', start_time: '15:00', end_time: '16:30',
  location: '', fee_amount: '0', choice_window_start: '', choice_window_end: '',
});

type ActivityTab = 'details' | 'streams' | 'patrons';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft:     { bg: '#E5E7EB', fg: '#374151' },
  published: { bg: '#D1FAE5', fg: '#065F46' },
  closed:    { bg: '#FEF3C7', fg: '#92400E' },
  archived:  { bg: '#F3F4F6', fg: '#9CA3AF' },
};

export default function ECAConfigScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const catQuery  = useECACategories();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const actQuery  = useECAActivities(selectedCatId ?? undefined);
  const [selectedActId, setSelectedActId] = useState<string | null>(null);
  const actDetail = useECAActivityDetail(selectedActId ?? '');
  const streams   = useStreams(sid);
  const staff     = useStaff(sid);

  const upsertCat   = useUpsertECACategory();
  const upsertAct   = useUpsertECAActivity();
  const setStreamsM = useSetEligibleStreams();
  const setPatronsM = useSetActivityPatrons();
  const publishAct  = usePublishActivity();

  const [catSheet, setCatSheet]     = useState(false);
  const [actSheet, setActSheet]     = useState(false);
  const [catForm, setCatForm]       = useState<CatForm>(emptyCat());
  const [actForm, setActForm]       = useState<ActForm>(emptyAct(''));
  const [actTab, setActTab]         = useState<ActivityTab>('details');
  const [selStreams, setSelStreams] = useState<string[]>([]);
  const [selPatrons, setSelPatrons] = useState<Array<{ staff_id: string; is_primary: boolean }>>([]);

  const openNewCat  = () => { setCatForm(emptyCat()); setCatSheet(true); };
  const openEditCat = (cat: ECACategory) => {
    setCatForm({ id: cat.id, name: cat.name, description: cat.description ?? '', max_choices: String(cat.max_choices), allow_paid: cat.allow_paid });
    setCatSheet(true);
  };
  const openNewAct = useCallback(() => {
    if (!selectedCatId) return;
    setActForm(emptyAct(selectedCatId));
    setSelStreams([]); setSelPatrons([]); setActTab('details');
    setSelectedActId(null);
    setActSheet(true);
  }, [selectedCatId]);
  const openEditAct = (act: ECAActivity) => {
    setActForm({
      id: act.id, category_id: act.category_id, name: act.name, description: act.description ?? '',
      capacity: String(act.capacity), day_of_week: String(act.day_of_week),
      start_time: act.start_time ?? '', end_time: act.end_time ?? '',
      location: act.location ?? '', fee_amount: String(act.fee_amount),
      choice_window_start: act.choice_window_start ?? '', choice_window_end: act.choice_window_end ?? '',
    });
    setSelectedActId(act.id);
    setActTab('details');
    setActSheet(true);
  };

  React.useEffect(() => {
    if (actSheet && selectedActId && actDetail.data) {
      setSelStreams(actDetail.data.eca_activity_eligible_streams.map((s) => s.stream_id));
      setSelPatrons(actDetail.data.eca_activity_patrons.map((p) => ({ staff_id: p.staff_id, is_primary: p.is_primary })));
    }
  }, [actSheet, selectedActId, actDetail.data]);

  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    try {
      await upsertCat.mutateAsync({
        id: catForm.id, name: catForm.name.trim(),
        description: catForm.description || null,
        max_choices: parseInt(catForm.max_choices) || 3,
        allow_paid: catForm.allow_paid,
      } as any);
      setCatSheet(false);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Unknown error');
    }
  };

  const saveAct = async () => {
    if (!actForm.name.trim() || !actForm.category_id) {
      Alert.alert('Missing field', 'Activity name is required.');
      return;
    }
    try {
      const saved = await upsertAct.mutateAsync({
        id: actForm.id,
        category_id: actForm.category_id,
        name: actForm.name.trim(),
        description: actForm.description || null,
        capacity: parseInt(actForm.capacity) || 30,
        day_of_week: parseInt(actForm.day_of_week),
        start_time: actForm.start_time || null,
        end_time: actForm.end_time || null,
        location: actForm.location || null,
        fee_amount: parseFloat(actForm.fee_amount) || 0,
        choice_window_start: actForm.choice_window_start || null,
        choice_window_end: actForm.choice_window_end || null,
      } as any);
      const actId = saved.id as string;
      await Promise.all([
        setStreamsM.mutateAsync({ activityId: actId, streamIds: selStreams }),
        setPatronsM.mutateAsync({ activityId: actId, patrons: selPatrons }),
      ]);
      setActSheet(false);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Unknown error');
    }
  };

  const toggleStream = (id: string) =>
    setSelStreams((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const togglePatron = (staffId: string) => {
    setSelPatrons((prev) => {
      const exists = prev.find((p) => p.staff_id === staffId);
      if (exists) {
        const next = prev.filter((p) => p.staff_id !== staffId);
        // ensure primary still set if any remain
        if (exists.is_primary && next.length > 0) next[0].is_primary = true;
        return next;
      }
      return [...prev, { staff_id: staffId, is_primary: prev.length === 0 }];
    });
  };

  const setPrimary = (staffId: string) =>
    setSelPatrons((prev) => prev.map((p) => ({ ...p, is_primary: p.staff_id === staffId })));

  const handlePublish = (act: ECAActivity) => {
    const next = act.status === 'published' ? 'closed' : 'published';
    Alert.alert(
      next === 'published' ? 'Publish Activity' : 'Close Activity',
      next === 'published'
        ? 'Parents will be able to submit choices once the choice window opens.'
        : 'No new choices will be accepted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => publishAct.mutate({ activityId: act.id, status: next }) },
      ]
    );
  };

  const s = styles(colors);
  const categories = catQuery.data ?? [];
  const activities = actQuery.data ?? [];

  if (catQuery.isError) return <ErrorState title="Could not load ECA categories" onRetry={catQuery.refetch} />;

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader
        title="ECA Configuration"
        showBack
        right={
          <Pressable onPress={openNewCat} hitSlop={8} style={s.headerBtn}>
            <Ionicons name="add" size={20} color={colors.brand.primary} />
            <ThemedText style={[s.headerBtnText, { color: colors.brand.primary }]}>Category</ThemedText>
          </Pressable>
        }
      />

      <View style={s.body}>
        <View style={[s.catPanel, { borderRightColor: colors.border }]}>
          <ThemedText style={s.panelHeading}>CATEGORIES</ThemedText>
          {catQuery.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} />)
            : categories.length === 0
              ? <EmptyState icon="folder-outline" title="No categories" description="Tap Category above to add one." />
              : categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={[
                      s.catItem,
                      { borderBottomColor: colors.border },
                      selectedCatId === cat.id && { backgroundColor: colors.brand.primarySoft ?? '#DBEAFE' },
                    ]}
                    onPress={() => setSelectedCatId(cat.id)}
                    onLongPress={() => openEditCat(cat)}
                  >
                    <ThemedText style={s.catName}>{cat.name}</ThemedText>
                    <ThemedText style={s.catSub}>{cat.max_choices} choices · {cat.allow_paid ? 'Paid' : 'Free'}</ThemedText>
                  </Pressable>
                ))
          }
        </View>

        <View style={s.actPanel}>
          {selectedCatId === null
            ? <EmptyState icon="hand-left-outline" title="Select a category" description="Long-press a category to edit it." />
            : (
              <>
                <View style={s.actHeaderRow}>
                  <ThemedText style={s.actHeaderTitle}>
                    {categories.find((c) => c.id === selectedCatId)?.name ?? 'Activities'}
                  </ThemedText>
                  <Pressable onPress={openNewAct} hitSlop={8} style={s.headerBtn}>
                    <Ionicons name="add" size={18} color={colors.brand.primary} />
                    <ThemedText style={[s.headerBtnText, { color: colors.brand.primary }]}>Activity</ThemedText>
                  </Pressable>
                </View>
                {actQuery.isLoading
                  ? <View style={{ padding: Spacing.md }}>{Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} />)}</View>
                  : activities.length === 0
                    ? <EmptyState icon="football-outline" title="No activities" description="Add an activity to this category." />
                    : (
                      <ScrollView contentContainerStyle={{ padding: Spacing.sm, gap: Spacing.sm }}>
                        {activities.map((act) => {
                          const sc = STATUS_COLORS[act.status] ?? STATUS_COLORS.draft;
                          return (
                            <Card key={act.id}>
                              <View style={s.actRow}>
                                <View style={{ flex: 1 }}>
                                  <ThemedText style={s.actName}>{act.name}</ThemedText>
                                  <ThemedText style={s.actMeta}>
                                    {DAYS[act.day_of_week]} · {act.start_time ?? '—'} · cap {act.capacity}
                                    {act.location ? ` · ${act.location}` : ''}
                                  </ThemedText>
                                </View>
                                <View style={s.actActions}>
                                  <Pressable
                                    onPress={() => handlePublish(act)}
                                    style={[s.statusBtn, { backgroundColor: sc.bg }]}
                                  >
                                    <ThemedText style={[s.statusBtnText, { color: sc.fg }]}>{act.status}</ThemedText>
                                  </Pressable>
                                  <Pressable onPress={() => openEditAct(act)} style={s.editBtn} hitSlop={6}>
                                    <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                                  </Pressable>
                                </View>
                              </View>
                            </Card>
                          );
                        })}
                      </ScrollView>
                    )
                }
              </>
            )
          }
        </View>
      </View>

      {/* Category Sheet */}
      <BottomSheet visible={catSheet} onClose={() => setCatSheet(false)} title={catForm.id ? 'Edit Category' : 'New Category'}>
        <ScrollView contentContainerStyle={s.sheetContent}>
          <FormField label="Name" value={catForm.name} onChangeText={(v) => setCatForm((f) => ({ ...f, name: v }))} placeholder="e.g. Sports" />
          <FormField label="Description" value={catForm.description} onChangeText={(v) => setCatForm((f) => ({ ...f, description: v }))} placeholder="Optional" />
          <FormField label="Max Choices" value={catForm.max_choices} onChangeText={(v) => setCatForm((f) => ({ ...f, max_choices: v }))} keyboardType="numeric" />
          <View style={s.toggleRow}>
            <ThemedText>Allow Paid Activities</ThemedText>
            <Chip
              label={catForm.allow_paid ? 'Yes' : 'No'}
              selected={catForm.allow_paid}
              onPress={() => setCatForm((f) => ({ ...f, allow_paid: !f.allow_paid }))}
            />
          </View>
          <Button label={upsertCat.isPending ? 'Saving…' : 'Save Category'} onPress={saveCat} disabled={upsertCat.isPending} style={{ marginTop: Spacing.md }} />
        </ScrollView>
      </BottomSheet>

      {/* Activity Sheet */}
      <BottomSheet visible={actSheet} onClose={() => setActSheet(false)} title={actForm.id ? 'Edit Activity' : 'New Activity'} snapHeight={undefined}>
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          {(['details', 'streams', 'patrons'] as ActivityTab[]).map((t) => (
            <Pressable key={t} style={[s.tab, actTab === t && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 }]} onPress={() => setActTab(t)}>
              <ThemedText style={[s.tabLabel, actTab === t && { color: colors.brand.primary, fontWeight: '700' }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={s.sheetContent}>
          {actTab === 'details' && (
            <>
              <FormField label="Name" value={actForm.name} onChangeText={(v) => setActForm((f) => ({ ...f, name: v }))} placeholder="e.g. Football" />
              <FormField label="Description" value={actForm.description} onChangeText={(v) => setActForm((f) => ({ ...f, description: v }))} textarea />
              <FormField label="Capacity" value={actForm.capacity} onChangeText={(v) => setActForm((f) => ({ ...f, capacity: v }))} keyboardType="numeric" />
              <ThemedText style={s.fieldLabel}>Day of Week</ThemedText>
              <View style={s.row}>
                {DAYS.map((d, i) => (
                  <Chip
                    key={d}
                    label={d}
                    selected={actForm.day_of_week === String(i)}
                    onPress={() => setActForm((f) => ({ ...f, day_of_week: String(i) }))}
                  />
                ))}
              </View>
              <FormField label="Start Time (HH:MM)" value={actForm.start_time} onChangeText={(v) => setActForm((f) => ({ ...f, start_time: v }))} placeholder="15:00" />
              <FormField label="End Time (HH:MM)" value={actForm.end_time} onChangeText={(v) => setActForm((f) => ({ ...f, end_time: v }))} placeholder="16:30" />
              <FormField label="Location" value={actForm.location} onChangeText={(v) => setActForm((f) => ({ ...f, location: v }))} />
              <FormField label="Fee Amount" value={actForm.fee_amount} onChangeText={(v) => setActForm((f) => ({ ...f, fee_amount: v }))} keyboardType="decimal-pad" />
              <FormField label="Choice Window Start (ISO)" value={actForm.choice_window_start} onChangeText={(v) => setActForm((f) => ({ ...f, choice_window_start: v }))} placeholder="2026-01-01T08:00:00Z" helper="When parents can begin submitting choices" />
              <FormField label="Choice Window End (ISO)" value={actForm.choice_window_end} onChangeText={(v) => setActForm((f) => ({ ...f, choice_window_end: v }))} placeholder="2026-01-07T23:59:00Z" helper="Last moment parents can submit" />
            </>
          )}

          {actTab === 'streams' && (
            <>
              <ThemedText style={s.hint}>Select streams eligible for this activity</ThemedText>
              {streams.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} />)
                : (streams.data ?? []).map((stream) => (
                    <Pressable key={stream.id} style={[s.checkRow, { borderBottomColor: colors.border }]} onPress={() => toggleStream(stream.id)}>
                      <Ionicons
                        name={selStreams.includes(stream.id) ? 'checkbox' : 'square-outline'}
                        size={20} color={selStreams.includes(stream.id) ? colors.brand.primary : colors.icon}
                      />
                      <ThemedText style={{ marginLeft: 8, flex: 1 }}>
                        {stream.grades?.school_sections?.name} · {stream.grades?.name} · {stream.name}
                      </ThemedText>
                    </Pressable>
                  ))
              }
            </>
          )}

          {actTab === 'patrons' && (
            <>
              <ThemedText style={s.hint}>Assign staff as patrons. Tap "Set Primary" to mark the lead patron.</ThemedText>
              {staff.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} />)
                : (staff.data ?? []).map((m) => {
                    const isSelected = selPatrons.some((p) => p.staff_id === m.id);
                    const isPrimary  = selPatrons.find((p) => p.staff_id === m.id)?.is_primary ?? false;
                    return (
                      <View key={m.id} style={[s.checkRow, { borderBottomColor: colors.border }]}>
                        <Pressable style={s.checkRowLeft} onPress={() => togglePatron(m.id)}>
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={20} color={isSelected ? colors.brand.primary : colors.icon}
                          />
                          <ThemedText style={{ marginLeft: 8 }}>{m.full_name}</ThemedText>
                        </Pressable>
                        {isSelected && (
                          <Chip
                            label={isPrimary ? '★ Primary' : 'Set Primary'}
                            selected={isPrimary}
                            onPress={() => setPrimary(m.id)}
                          />
                        )}
                      </View>
                    );
                  })
              }
            </>
          )}

          <Button
            label={upsertAct.isPending ? 'Saving…' : 'Save Activity'}
            onPress={saveAct}
            disabled={upsertAct.isPending}
            style={{ marginTop: Spacing.lg }}
          />
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  body:          { flex: 1, flexDirection: 'row' },
  catPanel:      { width: 220, borderRightWidth: 1 },
  actPanel:      { flex: 1 },
  panelHeading:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, padding: Spacing.sm },
  catItem:       { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  catName:       { fontWeight: '600' },
  catSub:        { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actHeaderRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  actHeaderTitle:{ fontSize: 16, fontWeight: '700' },
  actRow:        { flexDirection: 'row', alignItems: 'center' },
  actName:       { fontWeight: '600' },
  actMeta:       { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actActions:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBtn:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBtnText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  editBtn:       { padding: 4 },
  headerBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerBtnText: { fontSize: 13, fontWeight: '600' },
  sheetContent:  { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  fieldLabel:    { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: 8 },
  toggleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: Spacing.sm },
  tabRow:        { flexDirection: 'row', borderBottomWidth: 1 },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabLabel:      { fontSize: 13, color: colors.textMuted },
  row:           { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: Spacing.sm },
  checkRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  checkRowLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  hint:          { fontSize: 12, color: colors.textMuted, marginBottom: Spacing.sm },
});
