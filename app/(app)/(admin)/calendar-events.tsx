/**
 * Calendar & Events — School Super Admin
 * Tabs: Semesters · Holidays · Breaks · Events
 * Replaces the old "Semesters" + "Academic Calendar" screens.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, TextInput,
  Alert, Pressable, ScrollView, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, BottomSheet, FAB, Skeleton, EmptyState, ScreenHeader, Badge,
} from '../../../components/ui';
import {
  useSemesters, useCreateSemester, useActivateSemester, type Semester,
} from '../../../hooks/useAdmin';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type Tab = 'semesters' | 'holidays' | 'breaks' | 'events';
type EventType = 'holiday' | 'break' | 'event';

interface CalendarEvent {
  id: string;
  type: EventType | 'exam';
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  color: string | null;
  all_day: boolean;
}

const TABS: { value: Tab; label: string; icon: any; color: string }[] = [
  { value: 'semesters', label: 'Semesters', icon: 'calendar-number-outline', color: '#1D4ED8' },
  { value: 'holidays',  label: 'Holidays',  icon: 'sunny-outline',            color: '#EA580C' },
  { value: 'breaks',    label: 'Breaks',    icon: 'cafe-outline',             color: '#7C3AED' },
  { value: 'events',    label: 'Events',    icon: 'flag-outline',             color: '#0F766E' },
];

const TAB_TO_EVENT: Record<Exclude<Tab, 'semesters'>, EventType> = {
  holidays: 'holiday',
  breaks:   'break',
  events:   'event',
};

function useCalendarEvents(schoolId: string, type: EventType | null) {
  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', schoolId, type],
    enabled: !!schoolId && !!type,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('calendar_events')
        .select('id, type, title, description, start_date, end_date, color, all_day')
        .eq('school_id', schoolId)
        .eq('type', type)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CalendarEvent[];
    },
  });
}

function useSaveCalendarEvent(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id?: string;
      type: EventType;
      title: string;
      description?: string | null;
      start_date: string;
      end_date?: string | null;
    }) => {
      const db = supabase as any;
      const body = {
        school_id: schoolId,
        type: params.type,
        title: params.title,
        description: params.description ?? null,
        start_date: params.start_date,
        end_date: params.end_date ?? null,
        all_day: true,
      };
      if (params.id) {
        const { error } = await db.from('calendar_events').update(body).eq('id', params.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await db.from('calendar_events').insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events', schoolId] }),
  });
}

function useDeleteCalendarEvent(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = supabase as any;
      const { error } = await db.from('calendar_events').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events', schoolId] }),
  });
}

export default function CalendarEventsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const [tab, setTab] = useState<Tab>('semesters');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Calendar & Events" subtitle="Semesters, holidays, breaks & events" showBack />

      {/* Tab strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabStrip}>
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <Pressable
              key={t.value}
              onPress={() => { haptics.selection(); setTab(t.value); }}
              style={[styles.tabBtn, { backgroundColor: active ? t.color : colors.surfaceSecondary, borderColor: active ? t.color : colors.border }]}
            >
              <Ionicons name={t.icon} size={14} color={active ? '#fff' : t.color} />
              <ThemedText style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.textPrimary, marginLeft: 6 }}>
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'semesters'
        ? <SemestersPanel schoolId={schoolId} colors={colors} />
        : <EventsPanel tab={tab} schoolId={schoolId} colors={colors} />}
    </SafeAreaView>
  );
}

// ─── Semesters panel (existing logic) ───────────────────────────────────────

function SemestersPanel({ schoolId, colors }: { schoolId: string; colors: any }) {
  const { data: semesters = [], isLoading, refetch, isFetching } = useSemesters(schoolId);
  const createMutation = useCreateSemester(schoolId);
  const activateMutation = useActivateSemester(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reset = () => { setName(''); setStartDate(''); setEndDate(''); };

  const handleCreate = async () => {
    if (!name.trim() || !startDate || !endDate) return;
    haptics.medium();
    try {
      await createMutation.mutateAsync({ name: name.trim(), academicYear: academicYear.trim(), startDate, endDate });
      haptics.success();
      setSheetVisible(false); reset();
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not create semester.');
    }
  };

  const handleActivate = (sem: Semester) => {
    if (sem.is_active) return;
    Alert.alert('Activate Semester', `Set "${sem.name}" as active? All others will deactivate.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Activate', onPress: async () => { haptics.medium(); try { await activateMutation.mutateAsync(sem.id); haptics.success(); } catch { haptics.error(); } } },
    ]);
  };

  const canCreate = name.trim().length > 0 && startDate.length === 10 && endDate.length === 10;

  return (
    <>
      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} width="100%" height={80} radius={Radius.lg} />)}
        </View>
      ) : semesters.length === 0 ? (
        <EmptyState title="No semesters yet" description="Tap + to create one." icon="calendar-number-outline" />
      ) : (
        <FlatList
          data={semesters}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
          renderItem={({ item: sem }) => (
            <TouchableOpacity
              onPress={() => handleActivate(sem)}
              activeOpacity={0.85}
              style={[styles.row, { backgroundColor: sem.is_active ? colors.brand.primary + '08' : colors.surface, borderColor: sem.is_active ? colors.brand.primary : colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ThemedText style={{ fontWeight: '700' }}>{sem.name}</ThemedText>
                  {sem.is_active && <Badge label="ACTIVE" preset="success" />}
                </View>
                <ThemedText variant="caption" color="muted">AY {sem.academic_year}</ThemedText>
                <ThemedText variant="caption" color="muted">
                  {format(parseISO(sem.start_date), 'dd/MM/yy')} – {format(parseISO(sem.end_date), 'dd/MM/yy')}
                </ThemedText>
              </View>
              {!sem.is_active && (
                <View style={[styles.actionPill, { borderColor: colors.brand.primary }]}>
                  <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '700', fontSize: 11 }}>Set Active</ThemedText>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <FAB icon={<Ionicons name="add" size={24} color="#fff" />} onPress={() => { haptics.medium(); setSheetVisible(true); }} />

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title="New Semester" snapHeight={460}>
        <View style={{ gap: Spacing.md, padding: Spacing.base }}>
          <Field label="SEMESTER NAME" value={name} onChangeText={setName} placeholder="e.g. Term 1 2026" colors={colors} />
          <Field label="ACADEMIC YEAR" value={academicYear} onChangeText={setAcademicYear} keyboardType="numeric" colors={colors} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="START" value={startDate} onChangeText={setStartDate} placeholder="yyyy-mm-dd" colors={colors} isDate /></View>
            <View style={{ flex: 1 }}><Field label="END" value={endDate} onChangeText={setEndDate} placeholder="yyyy-mm-dd" colors={colors} isDate /></View>
          </View>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || createMutation.isPending}
            style={[styles.primaryBtn, { backgroundColor: canCreate ? colors.brand.primary : colors.border }]}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{createMutation.isPending ? 'Creating…' : 'Create Semester'}</ThemedText>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </>
  );
}

// ─── Generic events panel (holidays / breaks / events) ─────────────────────

function EventsPanel({ tab, schoolId, colors }: { tab: Exclude<Tab, 'semesters'>; schoolId: string; colors: any }) {
  const eventType = TAB_TO_EVENT[tab];
  const tabMeta = TABS.find(t => t.value === tab)!;

  const { data: events = [], isLoading, refetch, isFetching } = useCalendarEvents(schoolId, eventType);
  const saveMutation = useSaveCalendarEvent(schoolId);
  const deleteMutation = useDeleteCalendarEvent(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const openAdd = () => {
    setEditing(null); setTitle(''); setDesc(''); setStartDate(''); setEndDate('');
    setSheetVisible(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditing(ev);
    setTitle(ev.title);
    setDesc(ev.description ?? '');
    setStartDate(ev.start_date);
    setEndDate(ev.end_date ?? '');
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (!title.trim() || startDate.length !== 10) {
      Alert.alert('Validation', 'Title and start date are required.');
      return;
    }
    haptics.medium();
    try {
      await saveMutation.mutateAsync({
        id: editing?.id,
        type: eventType,
        title: title.trim(),
        description: desc.trim() || null,
        start_date: startDate,
        end_date: endDate.length === 10 ? endDate : null,
      });
      haptics.success();
      setSheetVisible(false);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message ?? 'Could not save.');
    }
  };

  const handleDelete = (ev: CalendarEvent) => {
    Alert.alert('Delete', `Delete "${ev.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteMutation.mutateAsync(ev.id); haptics.success(); } catch { haptics.error(); } } },
    ]);
  };

  return (
    <>
      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} width="100%" height={70} radius={Radius.lg} />)}
        </View>
      ) : events.length === 0 ? (
        <EmptyState title={`No ${tab} yet`} description={`Tap + to add a ${eventType}.`} icon={tabMeta.icon} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
          renderItem={({ item: ev }) => (
            <Pressable
              onPress={() => openEdit(ev)}
              onLongPress={() => handleDelete(ev)}
              delayLongPress={350}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: tabMeta.color + '40' }]}
            >
              <View style={[styles.eventDot, { backgroundColor: tabMeta.color }]} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '700' }}>{ev.title}</ThemedText>
                <ThemedText variant="caption" color="muted">
                  {format(parseISO(ev.start_date), 'dd/MM/yy')}
                  {ev.end_date ? ` – ${format(parseISO(ev.end_date), 'dd/MM/yy')}` : ''}
                </ThemedText>
                {ev.description ? <ThemedText variant="caption" color="muted" numberOfLines={2}>{ev.description}</ThemedText> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}

      <FAB icon={<Ionicons name="add" size={24} color="#fff" />} onPress={() => { haptics.medium(); openAdd(); }} />

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title={editing ? `Edit ${eventType}` : `New ${eventType}`} snapHeight={500}>
        <View style={{ gap: Spacing.md, padding: Spacing.base }}>
          <Field label="TITLE *" value={title} onChangeText={setTitle} placeholder={`e.g. ${eventType === 'holiday' ? 'Independence Day' : eventType === 'break' ? 'Mid-term break' : 'Sports Day'}`} colors={colors} />
          <Field label="DESCRIPTION (optional)" value={desc} onChangeText={setDesc} placeholder="Notes" colors={colors} multiline />
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="START *" value={startDate} onChangeText={setStartDate} placeholder="yyyy-mm-dd" colors={colors} isDate /></View>
            <View style={{ flex: 1 }}><Field label="END" value={endDate} onChangeText={setEndDate} placeholder="yyyy-mm-dd" colors={colors} isDate /></View>
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
            {editing && (
              <TouchableOpacity onPress={() => { setSheetVisible(false); handleDelete(editing); }} style={[styles.deleteBtn, { borderColor: Colors.semantic.error }]}>
                <ThemedText style={{ color: Colors.semantic.error, fontWeight: '700' }}>Delete</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saveMutation.isPending}
              style={[styles.primaryBtn, { backgroundColor: tabMeta.color, flex: 1 }]}
            >
              <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{saveMutation.isPending ? 'Saving…' : 'Save'}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

function Field({ label, value, onChangeText, placeholder, colors, keyboardType, multiline, isDate }: any) {
  if (isDate && Platform.OS === 'web') {
    return (
      <View>
        <ThemedText variant="label" color="muted" style={styles.fieldLabel}>{label}</ThemedText>
        <input
          type="date"
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          style={{
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
            color: colors.textPrimary,
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 8,
            padding: 12,
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          } as any}
        />
      </View>
    );
  }
  return (
    <View>
      <ThemedText variant="label" color="muted" style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary, minHeight: multiline ? 60 : undefined, textAlignVertical: multiline ? 'top' : undefined }, Platform.OS === 'web' ? { outlineStyle: 'none' } as any : undefined]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  tabStrip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.sm, alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, height: 36 },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: TAB_BAR_HEIGHT + Spacing.xl, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1.5, gap: Spacing.sm },
  eventDot: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  actionPill: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  primaryBtn: { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
  deleteBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
});
