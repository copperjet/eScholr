/**
 * Admin Academic Calendar
 * View and manage calendar events, holidays, and exam periods.
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
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isFuture, isToday } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, BottomSheet, FAB, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type EventType = 'event' | 'holiday' | 'exam_period' | 'marks_window';

const EVENT_META: Record<EventType, { label: string; color: string; icon: string }> = {
  event:        { label: 'Event',        color: Colors.semantic.info,    icon: 'calendar-outline' },
  holiday:      { label: 'Holiday',      color: Colors.semantic.success, icon: 'sunny-outline' },
  exam_period:  { label: 'Exam Period',  color: Colors.semantic.error,   icon: 'school-outline' },
  marks_window: { label: 'Marks Window', color: '#8B5CF6',               icon: 'create-outline' },
};

const EVENT_TYPES: EventType[] = ['event', 'holiday', 'exam_period', 'marks_window'];

interface CalendarEvent {
  id: string;
  title: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  description: string | null;
  affects_attendance: boolean;
  is_active: boolean;
}

function useCalendarEvents(schoolId: string) {
  return useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('calendar_events')
        .select('id, title, event_type, start_date, end_date, description, affects_attendance, is_active')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarEvent[];
    },
  });
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const qc = useQueryClient();

  const { data: events = [], isLoading, isError, refetch } = useCalendarEvents(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [filterType, setFilterType] = useState<EventType | 'all'>('all');

  // Form state
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('event');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [affectsAttendance, setAffectsAttendance] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const db = supabase as any;
      const { error } = await db.from('calendar_events').insert({
        school_id: schoolId,
        title: title.trim(),
        event_type: eventType,
        start_date: startDate,
        end_date: endDate,
        description: description.trim() || null,
        affects_attendance: affectsAttendance,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events', schoolId] });
      haptics.success();
      setSheetVisible(false);
      setTitle(''); setDescription(''); setAffectsAttendance(false);
      setEventType('event');
    },
    onError: () => haptics.error(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const db = supabase as any;
      const { error } = await db.from('calendar_events').delete().eq('id', eventId).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events', schoolId] });
      haptics.success();
    },
  });

  const handleDelete = useCallback((id: string, eventTitle: string) => {
    Alert.alert('Delete Event', `Remove "${eventTitle}" from the calendar?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  }, [deleteMutation]);

  const filtered = filterType === 'all' ? events : events.filter((e) => e.event_type === filterType);

  const upcoming = filtered.filter((e) => isFuture(parseISO(e.end_date)) || isToday(parseISO(e.start_date)));
  const past     = filtered.filter((e) => !isFuture(parseISO(e.end_date)) && !isToday(parseISO(e.start_date)));

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load calendar" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Academic Calendar" showBack />

      {/* Filter chips */}
      <View style={styles.chips}>
        {(['all', ...EVENT_TYPES] as const).map((t) => {
          const meta = t === 'all' ? null : EVENT_META[t];
          const active = filterType === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setFilterType(t)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? (meta?.color ?? colors.brand.primary) + '18' : colors.surfaceSecondary,
                  borderColor: active ? (meta?.color ?? colors.brand.primary) : colors.border,
                },
              ]}
            >
              {meta && <Ionicons name={meta.icon as any} size={12} color={active ? meta.color : colors.textMuted} />}
              <ThemedText
                variant="caption"
                style={{ marginLeft: meta ? 4 : 0, fontWeight: active ? '700' : '400', color: active ? (meta?.color ?? colors.brand.primary) : colors.textMuted, fontSize: 11 }}
              >
                {t === 'all' ? 'All' : meta!.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={70} radius={Radius.lg} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState title="No events" description="Tap + to add events, holidays, or exam periods." icon="calendar-outline" />
      ) : (
        <FlatList
          data={[
            ...(upcoming.length ? [{ type: 'header', label: 'Upcoming', id: '_u' }] : []),
            ...upcoming.map((e) => ({ type: 'event', ...e })),
            ...(past.length ? [{ type: 'header', label: 'Past', id: '_p' }] : []),
            ...past.map((e) => ({ type: 'event', ...e })),
          ] as any[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <ThemedText variant="label" color="muted" style={{ fontSize: 10, letterSpacing: 0.5, marginTop: Spacing.md, marginBottom: Spacing.sm }}>
                  {item.label.toUpperCase()}
                </ThemedText>
              );
            }
            const meta = EVENT_META[item.event_type as EventType] ?? EVENT_META.event;
            const sameDay = item.start_date === item.end_date;
            return (
              <TouchableOpacity
                onLongPress={() => handleDelete(item.id, item.title)}
                activeOpacity={0.85}
                style={[styles.eventRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.colorStripe, { backgroundColor: meta.color }]} />
                <View style={{ flex: 1, padding: Spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <ThemedText variant="body" style={{ fontWeight: '600', flex: 1 }}>{item.title}</ThemedText>
                    <View style={[styles.typeBadge, { backgroundColor: meta.color + '15' }]}>
                      <ThemedText variant="caption" style={{ color: meta.color, fontSize: 10, fontWeight: '700' }}>
                        {meta.label.toUpperCase()}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
                    {sameDay
                      ? format(parseISO(item.start_date), 'dd MMM yyyy')
                      : `${format(parseISO(item.start_date), 'dd MMM')} – ${format(parseISO(item.end_date), 'dd MMM yyyy')}`}
                  </ThemedText>
                  {item.affects_attendance && (
                    <ThemedText variant="caption" style={{ color: Colors.semantic.info, marginTop: 2 }}>
                      ⚑ Affects attendance
                    </ThemedText>
                  )}
                  {item.description && (
                    <ThemedText variant="caption" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                      {item.description}
                    </ThemedText>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <FAB icon={<Ionicons name="add" size={24} color="#fff" />} onPress={() => { haptics.medium(); setSheetVisible(true); }} />

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title="Add Calendar Event" snapHeight={560}>
        <View style={{ gap: Spacing.md }}>
          {/* Type picker */}
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>TYPE</ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
              {EVENT_TYPES.map((t) => {
                const meta = EVENT_META[t];
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setEventType(t)}
                    style={[
                      styles.chip,
                      { backgroundColor: eventType === t ? meta.color + '18' : colors.surfaceSecondary, borderColor: eventType === t ? meta.color : colors.border },
                    ]}
                  >
                    <Ionicons name={meta.icon as any} size={12} color={eventType === t ? meta.color : colors.textMuted} />
                    <ThemedText variant="caption" style={{ marginLeft: 4, color: eventType === t ? meta.color : colors.textMuted, fontWeight: eventType === t ? '700' : '400', fontSize: 11 }}>
                      {meta.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Title */}
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>TITLE</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Event title…"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          {/* Dates */}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>START DATE</ThemedText>
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="yyyy-mm-dd"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>END DATE</ThemedText>
              <TextInput
                value={endDate}
                onChangeText={setEndDate}
                placeholder="yyyy-mm-dd"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              />
            </View>
          </View>

          {/* Description */}
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary, minHeight: 60, textAlignVertical: 'top' }]}
            />
          </View>

          {/* Affects attendance toggle */}
          <View style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>Affects attendance</ThemedText>
              <ThemedText variant="caption" color="muted">Attendance is optional on these days</ThemedText>
            </View>
            <Switch value={affectsAttendance} onValueChange={setAffectsAttendance} trackColor={{ true: colors.brand.primary }} />
          </View>

          <TouchableOpacity
            onPress={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
            style={[styles.saveBtn, { backgroundColor: title.trim() && !createMutation.isPending ? colors.brand.primary : colors.border }]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
              {createMutation.isPending ? 'Saving…' : 'Add Event'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </BottomSheet>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  list: { paddingHorizontal: Spacing.base, paddingBottom: TAB_BAR_HEIGHT },
  eventRow: { flexDirection: 'row', borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: Spacing.sm },
  colorStripe: { width: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
});
