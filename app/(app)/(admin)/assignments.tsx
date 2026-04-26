/**
 * Admin Assignments — /(app)/(admin)/assignments
 * HRT stream assignments + Subject Teacher stream/subject assignments
 * for the active semester.
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Card, Avatar, FAB, BottomSheet,
  Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type Tab = 'hrt' | 'st';

// ── Data hooks ────────────────────────────────────────────────

function useAssignmentData(schoolId: string) {
  return useQuery({
    queryKey: ['admin-assignments', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const [semRes, staffRes, streamRes, subjectRes, hrtRes, staRes] = await Promise.all([
        supabase.from('semesters').select('id, name').eq('school_id', schoolId).eq('is_active', true).single(),
        supabase.from('staff').select('id, full_name, staff_number').eq('school_id', schoolId).eq('status', 'active').order('full_name'),
        supabase.from('streams').select('id, name, grades(name, school_sections(name))').eq('school_id', schoolId).order('name'),
        supabase.from('subjects').select('id, name, department').eq('school_id', schoolId).order('name'),
        supabase.from('hrt_assignments').select('id, staff_id, co_hrt_staff_id, stream_id').eq('school_id', schoolId),
        supabase.from('subject_teacher_assignments').select('id, staff_id, subject_id, stream_id').eq('school_id', schoolId),
      ]);
      if (semRes.error) throw semRes.error;
      return {
        semester: semRes.data as any,
        staff: (staffRes.data ?? []) as any[],
        streams: (streamRes.data ?? []) as any[],
        subjects: (subjectRes.data ?? []) as any[],
        hrtAssignments: (hrtRes.data ?? []) as any[],
        staAssignments: (staRes.data ?? []) as any[],
      };
    },
  });
}

// ── Main Screen ───────────────────────────────────────────────

export default function AssignmentsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const schoolId = user?.schoolId ?? '';

  const [tab, setTab] = useState<Tab>('hrt');
  const [addHRTVisible, setAddHRTVisible] = useState(false);
  const [addSTVisible, setAddSTVisible] = useState(false);

  // HRT form state
  const [hrtStaffId, setHrtStaffId] = useState('');
  const [coHrtStaffId, setCoHrtStaffId] = useState('');
  const [hrtStreamId, setHrtStreamId] = useState('');

  // ST form state
  const [stStaffId, setStStaffId] = useState('');
  const [stSubjectId, setStSubjectId] = useState('');
  const [stStreamId, setStStreamId] = useState('');

  const { data, isLoading, isError, refetch } = useAssignmentData(schoolId);

  // ── Mutations ─────────────────────────────────────────────

  const assignHRT = useMutation({
    mutationFn: async () => {
      if (!hrtStaffId || !hrtStreamId || !data?.semester?.id) throw new Error('All fields required');
      const payload: any = {
        school_id: schoolId,
        staff_id: hrtStaffId,
        stream_id: hrtStreamId,
        semester_id: data.semester.id,
      };
      if (coHrtStaffId) payload.co_hrt_staff_id = coHrtStaffId;
      const { error } = await supabase
        .from('hrt_assignments')
        .upsert(payload, { onConflict: 'staff_id,stream_id,semester_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] });
      setAddHRTVisible(false);
      setHrtStaffId(''); setCoHrtStaffId(''); setHrtStreamId('');
    },
    onError: () => haptics.error(),
  });

  const assignST = useMutation({
    mutationFn: async () => {
      if (!stStaffId || !stSubjectId || !stStreamId || !data?.semester?.id) throw new Error('All fields required');
      const { error } = await supabase
        .from('subject_teacher_assignments')
        .upsert({
          school_id: schoolId,
          staff_id: stStaffId,
          subject_id: stSubjectId,
          stream_id: stStreamId,
          semester_id: data.semester.id,
        } as any, { onConflict: 'staff_id,subject_id,stream_id,semester_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] });
      setAddSTVisible(false);
      setStStaffId(''); setStSubjectId(''); setStStreamId('');
    },
    onError: () => haptics.error(),
  });

  const removeHRT = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hrt_assignments').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => { haptics.success(); queryClient.invalidateQueries({ queryKey: ['admin-assignments'] }); },
    onError: () => haptics.error(),
  });

  const removeSTA = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subject_teacher_assignments').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => { haptics.success(); queryClient.invalidateQueries({ queryKey: ['admin-assignments'] }); },
    onError: () => haptics.error(),
  });

  // ── Helpers ───────────────────────────────────────────────

  const staffName = useCallback((id: string) =>
    data?.staff.find((s: any) => s.id === id)?.full_name ?? '—', [data]);
  const streamLabel = useCallback((id: string) => {
    const s = data?.streams.find((s: any) => s.id === id);
    if (!s) return '—';
    const grade = (s.grades as any)?.name ?? '';
    const section = (s.grades as any)?.school_sections?.name ?? '';
    return `${s.name} · ${grade} · ${section}`;
  }, [data]);
  const subjectName = useCallback((id: string) =>
    data?.subjects.find((s: any) => s.id === id)?.name ?? '—', [data]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load assignments" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Assignments"
        subtitle={data?.semester?.name}
        showBack
      />

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        {(['hrt', 'st'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 }]}
          >
            <ThemedText variant="body" style={{
              color: tab === t ? colors.brand.primary : colors.textMuted,
              fontWeight: tab === t ? '700' : '500',
            }}>
              {t === 'hrt' ? 'Class Teachers (HRT)' : 'Subject Teachers (ST)'}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="40%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : tab === 'hrt' ? (
        /* ── HRT Tab ─────────────────────────────────────────── */
        <>
          {data?.hrtAssignments.length === 0 ? (
            <EmptyState
              title="No HRT assignments"
              description="Tap + to assign a class teacher to a stream."
            />
          ) : (
            <FlatList
              data={data?.hrtAssignments ?? []}
              keyExtractor={(a: any) => a.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[styles.assignRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.assignIcon, { backgroundColor: colors.brand.primary + '14' }]}>
                    <Ionicons name="people" size={20} color={colors.brand.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>{staffName(item.staff_id)}</ThemedText>
                    <ThemedText variant="caption" color="muted">{streamLabel(item.stream_id)}</ThemedText>
                    {item.co_hrt_staff_id && (
                      <ThemedText variant="caption" color="muted">
                        Co-HRT: {staffName(item.co_hrt_staff_id)}
                      </ThemedText>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => removeHRT.mutate(item.id)}
                    disabled={removeHRT.isPending}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.semantic.error} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
          <FAB
            icon={<Ionicons name="add" size={24} color="#fff" />}
            label="Assign HRT"
            onPress={() => { haptics.light(); setAddHRTVisible(true); }}
          />
        </>
      ) : (
        /* ── ST Tab ──────────────────────────────────────────── */
        <>
          {data?.staAssignments.length === 0 ? (
            <EmptyState
              title="No subject teacher assignments"
              description="Tap + to assign a subject teacher."
            />
          ) : (
            <FlatList
              data={data?.staAssignments ?? []}
              keyExtractor={(a: any) => a.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[styles.assignRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.assignIcon, { backgroundColor: '#7C3AED14' }]}>
                    <Ionicons name="book" size={20} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>{staffName(item.staff_id)}</ThemedText>
                    <ThemedText variant="caption" color="muted">
                      {subjectName(item.subject_id)} · {streamLabel(item.stream_id)}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeSTA.mutate(item.id)}
                    disabled={removeSTA.isPending}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.semantic.error} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
          <FAB
            icon={<Ionicons name="add" size={24} color="#fff" />}
            label="Assign ST"
            onPress={() => { haptics.light(); setAddSTVisible(true); }}
          />
        </>
      )}

      {/* ── Add HRT Sheet ──────────────────────────────────── */}
      <BottomSheet
        visible={addHRTVisible}
        onClose={() => setAddHRTVisible(false)}
        title="Assign Class Teacher"
        snapHeight={500}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <PickerField
              label="Stream *"
              value={hrtStreamId}
              onSelect={setHrtStreamId}
              options={(data?.streams ?? []).map((s: any) => ({
                value: s.id,
                label: `${s.name} · ${(s.grades as any)?.name ?? ''}`,
              }))}
              placeholder="Select stream…"
              colors={colors}
            />
            <PickerField
              label="HRT (Primary) *"
              value={hrtStaffId}
              onSelect={setHrtStaffId}
              options={(data?.staff ?? []).map((s: any) => ({ value: s.id, label: s.full_name }))}
              placeholder="Select staff…"
              colors={colors}
            />
            <PickerField
              label="Co-HRT (optional)"
              value={coHrtStaffId}
              onSelect={setCoHrtStaffId}
              options={[{ value: '', label: 'None' }, ...(data?.staff ?? []).map((s: any) => ({ value: s.id, label: s.full_name }))]}
              placeholder="Select co-HRT…"
              colors={colors}
            />
            <TouchableOpacity
              onPress={() => assignHRT.mutate()}
              disabled={assignHRT.isPending || !hrtStaffId || !hrtStreamId}
              style={[styles.submitBtn, {
                backgroundColor: colors.brand.primary,
                opacity: assignHRT.isPending || !hrtStaffId || !hrtStreamId ? 0.5 : 1,
              }]}
            >
              <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700' }}>
                {assignHRT.isPending ? 'Saving…' : 'Assign HRT'}
              </ThemedText>
            </TouchableOpacity>
            {assignHRT.isError && (
              <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, textAlign: 'center' }}>
                {(assignHRT.error as any)?.message}
              </ThemedText>
            )}
          </View>
        </ScrollView>
      </BottomSheet>

      {/* ── Add ST Sheet ───────────────────────────────────── */}
      <BottomSheet
        visible={addSTVisible}
        onClose={() => setAddSTVisible(false)}
        title="Assign Subject Teacher"
        snapHeight={520}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <PickerField
              label="Subject Teacher *"
              value={stStaffId}
              onSelect={setStStaffId}
              options={(data?.staff ?? []).map((s: any) => ({ value: s.id, label: s.full_name }))}
              placeholder="Select staff…"
              colors={colors}
            />
            <PickerField
              label="Subject *"
              value={stSubjectId}
              onSelect={setStSubjectId}
              options={(data?.subjects ?? []).map((s: any) => ({ value: s.id, label: s.name }))}
              placeholder="Select subject…"
              colors={colors}
            />
            <PickerField
              label="Stream *"
              value={stStreamId}
              onSelect={setStStreamId}
              options={(data?.streams ?? []).map((s: any) => ({
                value: s.id,
                label: `${s.name} · ${(s.grades as any)?.name ?? ''}`,
              }))}
              placeholder="Select stream…"
              colors={colors}
            />
            <TouchableOpacity
              onPress={() => assignST.mutate()}
              disabled={assignST.isPending || !stStaffId || !stSubjectId || !stStreamId}
              style={[styles.submitBtn, {
                backgroundColor: '#7C3AED',
                opacity: assignST.isPending || !stStaffId || !stSubjectId || !stStreamId ? 0.5 : 1,
              }]}
            >
              <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700' }}>
                {assignST.isPending ? 'Saving…' : 'Assign Subject Teacher'}
              </ThemedText>
            </TouchableOpacity>
            {assignST.isError && (
              <ThemedText variant="bodySm" style={{ color: Colors.semantic.error, textAlign: 'center' }}>
                {(assignST.error as any)?.message}
              </ThemedText>
            )}
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── PickerField — scrollable option list ──────────────────────
function PickerField({ label, value, onSelect, options, placeholder, colors }: {
  label: string; value: string;
  onSelect: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string; colors: any;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={{ marginBottom: Spacing.md }}>
      <ThemedText variant="label" color="muted" style={{ marginBottom: 4 }}>{label}</ThemedText>
      <TouchableOpacity
        onPress={() => setOpen(p => !p)}
        style={[styles.pickerTrigger, { backgroundColor: colors.surfaceSecondary, borderColor: value ? colors.brand.primary : colors.border }]}
      >
        <ThemedText variant="body" style={{ flex: 1, color: value ? colors.textPrimary : colors.textMuted }}>
          {selected?.label ?? placeholder}
        </ThemedText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={[styles.pickerDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { onSelect(opt.value); setOpen(false); haptics.selection(); }}
              style={[styles.pickerOption, {
                backgroundColor: value === opt.value ? colors.brand.primary + '14' : 'transparent',
              }]}
            >
              {value === opt.value && (
                <Ionicons name="checkmark" size={14} color={colors.brand.primary} style={{ marginRight: 4 }} />
              )}
              <ThemedText variant="body" style={{
                color: value === opt.value ? colors.brand.primary : colors.textPrimary,
                fontWeight: value === opt.value ? '600' : '400',
                flex: 1,
              }}>
                {opt.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
  },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 120 },
  assignRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base,
    marginBottom: Spacing.sm, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.md,
  },
  assignIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  form: { gap: 4, paddingBottom: Spacing.xl },
  submitBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.base, borderRadius: Radius.lg, marginTop: Spacing.base,
  },
  pickerTrigger: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  pickerDropdown: {
    borderWidth: 1, borderRadius: Radius.md, marginTop: 4,
    maxHeight: 200, overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
});
