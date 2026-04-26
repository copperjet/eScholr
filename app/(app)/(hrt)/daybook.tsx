/**
 * Day Book — /(app)/(hrt)/daybook
 * HRT creates daily notes per student (behaviour, achievement, academic concern, etc.)
 * with optional "send to parent" flag. 15-minute edit window enforced by DB trigger.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isAfter } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, BottomSheet, FAB,
  Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

const CATEGORIES = [
  { value: 'behaviour_minor', label: 'Minor Behaviour', icon: 'alert-outline', color: Colors.semantic.warning },
  { value: 'behaviour_serious', label: 'Serious Behaviour', icon: 'warning-outline', color: Colors.semantic.error },
  { value: 'academic_concern', label: 'Academic Concern', icon: 'school-outline', color: Colors.semantic.error },
  { value: 'achievement', label: 'Achievement', icon: 'star-outline', color: Colors.semantic.success },
  { value: 'attendance_note', label: 'Attendance Note', icon: 'calendar-outline', color: Colors.semantic.info },
  { value: 'health', label: 'Health', icon: 'medkit-outline', color: Colors.semantic.warning },
  { value: 'communication', label: 'Communication', icon: 'chatbox-outline', color: Colors.semantic.info },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#6B7280' },
] as const;

type CategoryValue = typeof CATEGORIES[number]['value'];

const TODAY = format(new Date(), 'yyyy-MM-dd');

function useDayBook(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['daybook-hrt', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data: assignment } = await supabase
        .from('hrt_assignments')
        .select('stream_id')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId)
        .limit(1)
        .single();
      if (!assignment) return { students: [], entries: [] };
      const { stream_id } = assignment as any;

      const [studentsRes, entriesRes] = await Promise.all([
        supabase.from('students').select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId).eq('stream_id', stream_id)
          .eq('status', 'active').order('full_name'),
        supabase.from('day_book_entries').select('id, student_id, category, description, send_to_parent, edit_window_closes_at, created_at, date')
          .eq('school_id', schoolId).eq('created_by', staffId!)
          .eq('date', TODAY).eq('archived', false).order('created_at', { ascending: false }),
      ]);

      return {
        students: (studentsRes.data ?? []) as any[],
        entries: (entriesRes.data ?? []) as any[],
      };
    },
  });
}

export default function DayBookScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>('behaviour_minor');
  const [description, setDescription] = useState('');
  const [sendToParent, setSendToParent] = useState(false);
  const [filter, setFilter] = useState<'students' | 'entries'>('entries');

  const { data, isLoading, isError, refetch } = useDayBook(user?.staffId ?? null, user?.schoolId ?? '');

  const updateEntry = useMutation({
    mutationFn: async ({ entryId, category, desc, sendParent }: { entryId: string; category: CategoryValue; desc: string; sendParent: boolean }) => {
      const { error } = await (supabase as any).from('day_book_entries').update({
        category,
        description: desc.trim(),
        send_to_parent: sendParent,
      }).eq('id', entryId).eq('school_id', user?.schoolId ?? '');
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['daybook-hrt'] });
      setSheetVisible(false);
      setDescription('');
      setSendToParent(false);
      setEditingEntry(null);
    },
    onError: () => haptics.error(),
  });

  const createEntry = useMutation({
    mutationFn: async () => {
      if (!selectedStudent || !description.trim()) throw new Error('Missing fields');
      const { error } = await supabase.from('day_book_entries').insert({
        school_id: user?.schoolId,
        student_id: selectedStudent.id,
        date: TODAY,
        category: selectedCategory,
        description: description.trim(),
        created_by: user?.staffId,
        send_to_parent: sendToParent,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['daybook-hrt'] });
      setSheetVisible(false);
      setDescription('');
      setSendToParent(false);
    },
    onError: () => haptics.error(),
  });

  const openEntry = useCallback((student: any) => {
    setEditingEntry(null);
    setSelectedStudent(student);
    setDescription('');
    setSendToParent(false);
    setSelectedCategory('behaviour_minor');
    setPickerVisible(false);
    setSheetVisible(true);
  }, []);

  const openEditEntry = useCallback((entry: any, student: any) => {
    setEditingEntry(entry);
    setSelectedStudent(student);
    setDescription(entry.description ?? '');
    setSendToParent(entry.send_to_parent ?? false);
    setSelectedCategory(entry.category ?? 'behaviour_minor');
    setSheetVisible(true);
  }, []);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load Day Book" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const entries = data?.entries ?? [];
  const students = data?.students ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title="Day Book"
          subtitle={format(new Date(), 'EEE, d MMM yyyy')}
          showBack
        />

        {/* Segment */}
        <View style={[styles.segmentRow, { backgroundColor: colors.surfaceSecondary }]}>
          <TouchableOpacity
            onPress={() => setFilter('entries')}
            style={[styles.segment, filter === 'entries' && { backgroundColor: colors.surface }]}
          >
            <ThemedText variant="bodySm" style={{ fontWeight: filter === 'entries' ? '700' : '500', color: filter === 'entries' ? colors.textPrimary : colors.textMuted }}>
              Today's Entries ({entries.length})
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('students')}
            style={[styles.segment, filter === 'students' && { backgroundColor: colors.surface }]}
          >
            <ThemedText variant="bodySm" style={{ fontWeight: filter === 'students' ? '700' : '500', color: filter === 'students' ? colors.textPrimary : colors.textMuted }}>
              All Students ({students.length})
            </ThemedText>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ padding: Spacing.base, gap: Spacing.md }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <Skeleton width={42} height={42} radius={21} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="80%" height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : filter === 'entries' ? (
          entries.length === 0 ? (
            <EmptyState
              title="No entries today"
              description="Tap a student from the list, or switch to All Students to create an entry."
            />
          ) : (
            <FlatList
              data={entries}
              keyExtractor={e => e.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: entry }) => {
                const cat = CATEGORIES.find(c => c.value === entry.category);
                const student = students.find(s => s.id === entry.student_id);
                const canEdit = entry.edit_window_closes_at ? isAfter(parseISO(entry.edit_window_closes_at), new Date()) : false;
                return (
                  <TouchableOpacity
                    onPress={() => canEdit ? openEditEntry(entry, student) : undefined}
                    activeOpacity={canEdit ? 0.75 : 1}
                    style={[styles.entryRow, { backgroundColor: colors.surface, borderColor: canEdit ? colors.brand.primary + '40' : colors.border }]}
                  >
                    <View style={[styles.catDot, { backgroundColor: cat?.color ?? colors.border }]} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.entryHeader}>
                        <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>{student?.full_name ?? '—'}</ThemedText>
                        {entry.send_to_parent && (
                          <View style={[styles.parentChip, { backgroundColor: Colors.semantic.successLight }]}>
                            <Ionicons name="mail-outline" size={11} color={Colors.semantic.success} />
                            <ThemedText variant="label" style={{ color: Colors.semantic.success, fontSize: 10 }}>Parent</ThemedText>
                          </View>
                        )}
                      </View>
                      <ThemedText variant="label" style={{ color: cat?.color, textTransform: 'uppercase', fontSize: 10 }}>{cat?.label}</ThemedText>
                      <ThemedText variant="bodySm" color="muted">{entry.description}</ThemedText>
                    </View>
                    {canEdit && (
                      <View style={[styles.editChip, { backgroundColor: colors.brand.primary + '14' }]}>
                        <Ionicons name="pencil-outline" size={12} color={colors.brand.primary} />
                        <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 10 }}>Edit</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )
        ) : (
          students.length === 0 ? (
            <EmptyState title="No students" description="No active students in your class." />
          ) : (
            <FlatList
              data={students}
              keyExtractor={s => s.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: student }) => {
                const studentEntries = entries.filter(e => e.student_id === student.id);
                return (
                  <TouchableOpacity
                    onPress={() => openEntry(student)}
                    activeOpacity={0.8}
                    style={[styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Avatar name={student.full_name} photoUrl={student.photo_url} size={40} />
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="body" style={{ fontWeight: '600' }}>{student.full_name}</ThemedText>
                      <ThemedText variant="caption" color="muted">
                        {studentEntries.length > 0 ? `${studentEntries.length} entr${studentEntries.length > 1 ? 'ies' : 'y'} today` : 'No entries today'}
                      </ThemedText>
                    </View>
                    <Ionicons name="add-circle-outline" size={22} color={colors.brand.primary} />
                  </TouchableOpacity>
                );
              }}
            />
          )
        )}

        {/* FAB — always visible, opens student-picker sheet directly */}
        <FAB
          icon={<Ionicons name="add" size={26} color="#fff" />}
          label="New Entry"
          onPress={() => setPickerVisible(true)}
          color={colors.brand.primary}
        />
      </KeyboardAvoidingView>

      {/* New Entry Sheet */}
      <BottomSheet
        visible={sheetVisible && !!selectedStudent}
        onClose={() => { setSheetVisible(false); setDescription(''); setEditingEntry(null); }}
        title={editingEntry ? `Edit Entry — ${selectedStudent?.full_name ?? ''}` : `New Entry — ${selectedStudent?.full_name ?? ''}`}
        snapHeight={580}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Category picker */}
          <ThemedText variant="label" color="muted" style={styles.fieldLabel}>CATEGORY</ThemedText>
          <View style={styles.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.value}
                onPress={() => setSelectedCategory(cat.value)}
                style={[
                  styles.catChip,
                  { borderColor: selectedCategory === cat.value ? cat.color : colors.border, backgroundColor: selectedCategory === cat.value ? cat.color + '18' : colors.surfaceSecondary },
                ]}
              >
                <Ionicons name={cat.icon as any} size={14} color={selectedCategory === cat.value ? cat.color : colors.textMuted} />
                <ThemedText variant="label" style={{ color: selectedCategory === cat.value ? cat.color : colors.textMuted, fontSize: 11, fontWeight: selectedCategory === cat.value ? '700' : '500' }}>
                  {cat.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Description */}
          <ThemedText variant="label" color="muted" style={styles.fieldLabel}>DESCRIPTION</ThemedText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what happened…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            style={[
              styles.descInput,
              { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            ]}
          />

          {/* Send to parent toggle */}
          <View style={styles.toggleRow}>
            <View>
              <ThemedText variant="body" style={{ fontWeight: '600' }}>Notify Parent</ThemedText>
              <ThemedText variant="caption" color="muted">Send this entry to the parent app</ThemedText>
            </View>
            <Switch
              value={sendToParent}
              onValueChange={setSendToParent}
              trackColor={{ true: colors.brand.primary }}
            />
          </View>

          <TouchableOpacity
            onPress={() => {
              if (editingEntry) {
                updateEntry.mutate({ entryId: editingEntry.id, category: selectedCategory, desc: description, sendParent: sendToParent });
              } else {
                createEntry.mutate();
              }
            }}
            disabled={!description.trim() || createEntry.isPending || updateEntry.isPending}
            style={[styles.saveBtn, { backgroundColor: !description.trim() ? colors.border : colors.brand.primary }]}
            activeOpacity={0.85}
          >
            <ThemedText variant="bodyLg" style={{ color: '#fff', fontWeight: '700' }}>
              {(createEntry.isPending || updateEntry.isPending) ? 'Saving…' : editingEntry ? 'Update Entry' : 'Save Entry'}
            </ThemedText>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheet>

      {/* Student picker sheet — opened by FAB, 1-tap to entry form */}
      <BottomSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title="Select Student"
        snapHeight={480}
      >
        {students.length === 0 ? (
          <EmptyState title="No students" description="No active students in your class." />
        ) : (
          <FlatList
            data={students}
            keyExtractor={s => s.id}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 380 }}
            renderItem={({ item: student }) => {
              const count = entries.filter((e: any) => e.student_id === student.id).length;
              return (
                <TouchableOpacity
                  onPress={() => openEntry(student)}
                  activeOpacity={0.8}
                  style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                >
                  <Avatar name={student.full_name} photoUrl={student.photo_url} size={38} />
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>{student.full_name}</ThemedText>
                    {count > 0 && (
                      <ThemedText variant="caption" color="muted">{count} entr{count > 1 ? 'ies' : 'y'} today</ThemedText>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  segmentRow: {
    flexDirection: 'row',
    margin: Spacing.base,
    borderRadius: Radius.lg,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 100 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  catDot: { width: 4, height: '100%', borderRadius: 2, minHeight: 40, marginTop: 2 },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  parentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  fieldLabel: {
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
    fontSize: 11,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  descInput: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.base,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  saveBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
});
