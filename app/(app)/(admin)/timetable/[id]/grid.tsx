/**
 * Timetable Grid Editor
 * Virtualized stream × (day, period) grid. Tap cell → SlotEditSheet.
 * Sticky stream column + sticky header row.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../../lib/supabase';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import { haptics } from '../../../../../lib/haptics';
import {
  ThemedText, ScreenHeader, BottomSheet, Button,
  Skeleton, EmptyState, ErrorState, Badge,
  type ColorBlindMode,
} from '../../../../../components/ui';
import { Spacing, Radius } from '../../../../../constants/Typography';
import {
  useTimetable, usePeriods, useUpdateSlot, useTimetableConflicts, useTimetableSettings,
  type TimetableSlot, type SlotType,
} from '../../../../../hooks/useTimetableBuilder';

// ── Supplemental data ─────────────────────────────────────────

interface Stream   { id: string; name: string; grade_id: string; }
interface Subject  { id: string; name: string; }
interface Staff    { id: string; full_name: string; }
interface Room     { id: string; name: string; code: string; }
interface Timetable { id: string; name: string; status: string; school_id: string; }

function useTimetableMeta(id: string, schoolId: string) {
  return useQuery<{
    timetable: Timetable;
    streams: Stream[];
    subjects: Subject[];
    staff: Staff[];
    rooms: Room[];
  }>({
    queryKey: ['ttb-meta', id, schoolId],
    enabled: !!id && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const [ttRes, stRes, subRes, staffRes, roomRes] = await Promise.all([
        db.from('timetables').select('id, name, status, school_id').eq('id', id).single(),
        db.from('streams').select('id, name, grade_id').eq('school_id', schoolId).order('name'),
        db.from('subjects').select('id, name').eq('school_id', schoolId).order('name'),
        db.from('staff').select('id, full_name').eq('school_id', schoolId).eq('is_active', true).order('full_name'),
        db.from('rooms').select('id, name, code').eq('school_id', schoolId).eq('is_active', true).order('code'),
      ]);
      if (ttRes.error) throw ttRes.error;
      return {
        timetable: ttRes.data as Timetable,
        streams:   (stRes.data  ?? []) as Stream[],
        subjects:  (subRes.data ?? []) as Subject[],
        staff:     (staffRes.data ?? []) as Staff[],
        rooms:     (roomRes.data ?? []) as Room[],
      };
    },
  });
}

// ── Constants ─────────────────────────────────────────────────

/** Maps ISODOW (1=Mon…7=Sun) → short label. */
const DAY_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

const CELL_W  = 88;
const CELL_H  = 64;
const LABEL_W = 100;

const SLOT_TYPE_COLORS: Record<SlotType, { bg: string; text: string }> = {
  lesson:     { bg: '#EFF6FF', text: '#1D4ED8' },
  break:      { bg: '#F3F4F6', text: '#6B7280' },
  free:       { bg: '#FAFAFA', text: '#9CA3AF' },
  assembly:   { bg: '#FEF3C7', text: '#92400E' },
  study_hall: { bg: '#F0FDF4', text: '#15803D' },
};

// ── Cell component ────────────────────────────────────────────

interface CellProps {
  slot: TimetableSlot | undefined;
  hasConflict: boolean;
  isHighlighted: boolean;
  subjects: Record<string, string>;
  staff: Record<string, string>;
  colors: any;
  onPress: () => void;
}

const GridCell = React.memo(function GridCell({ slot, hasConflict, isHighlighted, subjects, staff, colors, onPress }: CellProps) {
  const theme = slot?.slot_type ? SLOT_TYPE_COLORS[slot.slot_type] : null;
  const bg = isHighlighted ? '#FEF9C3' : hasConflict ? '#FEE2E2' : (theme?.bg ?? colors.surface);
  const border = isHighlighted ? '#F59E0B' : hasConflict ? '#EF4444' : colors.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.cell, { width: CELL_W, height: CELL_H, backgroundColor: bg, borderColor: border }]}
      activeOpacity={0.7}
    >
      {slot?.slot_type === 'lesson' && slot.subject_id ? (
        <>
          <ThemedText style={[styles.cellSubject, { color: theme?.text ?? colors.primary }]} numberOfLines={2}>
            {subjects[slot.subject_id] ?? '?'}
          </ThemedText>
          {slot.staff_id ? (
            <ThemedText style={[styles.cellTeacher, { color: colors.textSecondary }]} numberOfLines={1}>
              {(staff[slot.staff_id] ?? '').split(' ').slice(-1)[0]}
            </ThemedText>
          ) : null}
          {slot.is_locked ? (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={8} color={colors.textSecondary} />
            </View>
          ) : null}
        </>
      ) : slot?.slot_type === 'break' ? (
        <ThemedText style={[styles.cellBreak, { color: '#9CA3AF' }]}>Break</ThemedText>
      ) : slot?.slot_type === 'assembly' ? (
        <ThemedText style={[styles.cellBreak, { color: '#92400E' }]}>Assembly</ThemedText>
      ) : (
        <Ionicons name="add" size={18} color={colors.border} />
      )}
      {hasConflict ? (
        <View style={styles.conflictDot}>
          <Ionicons name="alert-circle" size={10} color="#EF4444" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

// ── Edit sheet ────────────────────────────────────────────────

interface EditSheetProps {
  slot: TimetableSlot | null;
  subjects: Subject[];
  staff: Staff[];
  rooms: Room[];
  timetableId: string;
  schoolId: string;
  onClose: () => void;
  colors: any;
}

const SLOT_TYPES: SlotType[] = ['lesson', 'free', 'study_hall', 'break', 'assembly'];

function SlotEditSheet({ slot, subjects, staff, rooms, timetableId, schoolId, onClose, colors }: EditSheetProps) {
  const updateSlot = useUpdateSlot(timetableId, schoolId);

  const [slotType, setSlotType]     = useState<SlotType>(slot?.slot_type ?? 'lesson');
  const [subjectId, setSubjectId]   = useState(slot?.subject_id ?? '');
  const [staffId, setStaffId]       = useState(slot?.staff_id ?? '');
  const [roomId, setRoomId]         = useState(slot?.room_id ?? '');
  const [isLocked, setIsLocked]     = useState(slot?.is_locked ?? false);
  const [subSearch, setSubSearch]   = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [panel, setPanel]           = useState<'type' | 'subject' | 'teacher' | 'room'>('type');

  const filteredSubjects = useMemo(
    () => subjects.filter((s) => s.name.toLowerCase().includes(subSearch.toLowerCase())),
    [subjects, subSearch],
  );
  const filteredStaff = useMemo(
    () => staff.filter((s) => s.full_name.toLowerCase().includes(staffSearch.toLowerCase())),
    [staff, staffSearch],
  );

  async function save() {
    if (!slot) return;
    try {
      await updateSlot.mutateAsync({
        id:         slot.id,
        slot_type:  slotType,
        subject_id: slotType === 'lesson' ? (subjectId || null) : null,
        staff_id:   slotType === 'lesson' ? (staffId   || null) : null,
        room_id:    slotType === 'lesson' ? (roomId    || null) : null,
        is_locked:  isLocked,
      });
      haptics('success');
      onClose();
    } catch (e: any) {
      if (e.name === 'TeacherClashError') {
        Alert.alert('Teacher clash', e.message ?? 'Teacher already assigned at this time slot');
      } else if (e.name === 'RoomClashError') {
        Alert.alert('Room clash', e.message ?? 'Room already booked at this time slot');
      } else {
        Alert.alert('Error', e.message ?? 'Failed to save slot');
      }
    }
  }

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const selectedStaff   = staff.find((s) => s.id === staffId);
  const selectedRoom    = rooms.find((r) => r.id === roomId);

  return (
    <ScrollView style={{ padding: Spacing.md }}>
      {/* Slot type */}
      <ThemedText style={[styles.sheetLabel, { color: colors.textSecondary }]}>Slot type</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
        <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
          {SLOT_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => { haptics('light'); setSlotType(t); }}
              style={[
                styles.typeChip,
                {
                  backgroundColor: slotType === t ? colors.primary : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <ThemedText style={{ color: slotType === t ? '#fff' : colors.text, fontSize: 13 }}>
                {t.replace('_', ' ')}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {slotType === 'lesson' ? (
        <>
          {/* Subject */}
          <ThemedText style={[styles.sheetLabel, { color: colors.textSecondary }]}>Subject</ThemedText>
          <TouchableOpacity
            onPress={() => setPanel(panel === 'subject' ? 'type' : 'subject')}
            style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ThemedText style={{ flex: 1, fontSize: 14 }}>
              {selectedSubject?.name ?? 'Select subject…'}
            </ThemedText>
            <Ionicons name={panel === 'subject' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          {panel === 'subject' ? (
            <View style={[styles.pickerPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.searchInput, { borderBottomColor: colors.border }]}>
                <Ionicons name="search" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                <ThemedText
                  style={{ flex: 1, fontSize: 13, color: colors.textSecondary }}
                  onPress={() => {}}
                >
                  {subSearch || 'Search subjects…'}
                </ThemedText>
              </View>
              <ScrollView style={{ maxHeight: 160 }}>
                <TouchableOpacity
                  onPress={() => { setSubjectId(''); setPanel('type'); }}
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                >
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>— None —</ThemedText>
                </TouchableOpacity>
                {filteredSubjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => { setSubjectId(s.id); setPanel('type'); haptics('light'); }}
                    style={[
                      styles.pickerItem,
                      { borderBottomColor: colors.border },
                      subjectId === s.id && { backgroundColor: colors.primary + '15' },
                    ]}
                  >
                    <ThemedText style={{ fontSize: 13 }}>{s.name}</ThemedText>
                    {subjectId === s.id ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Teacher */}
          <ThemedText style={[styles.sheetLabel, { color: colors.textSecondary }]}>Teacher</ThemedText>
          <TouchableOpacity
            onPress={() => setPanel(panel === 'teacher' ? 'type' : 'teacher')}
            style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ThemedText style={{ flex: 1, fontSize: 14 }}>
              {selectedStaff?.full_name ?? 'Select teacher…'}
            </ThemedText>
            <Ionicons name={panel === 'teacher' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          {panel === 'teacher' ? (
            <View style={[styles.pickerPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <ScrollView style={{ maxHeight: 160 }}>
                <TouchableOpacity
                  onPress={() => { setStaffId(''); setPanel('type'); }}
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                >
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>— None —</ThemedText>
                </TouchableOpacity>
                {filteredStaff.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => { setStaffId(s.id); setPanel('type'); haptics('light'); }}
                    style={[
                      styles.pickerItem,
                      { borderBottomColor: colors.border },
                      staffId === s.id && { backgroundColor: colors.primary + '15' },
                    ]}
                  >
                    <ThemedText style={{ fontSize: 13 }}>{s.full_name}</ThemedText>
                    {staffId === s.id ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Room */}
          <ThemedText style={[styles.sheetLabel, { color: colors.textSecondary }]}>Room</ThemedText>
          <TouchableOpacity
            onPress={() => setPanel(panel === 'room' ? 'type' : 'room')}
            style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ThemedText style={{ flex: 1, fontSize: 14 }}>
              {selectedRoom ? `${selectedRoom.code} — ${selectedRoom.name}` : 'Select room…'}
            </ThemedText>
            <Ionicons name={panel === 'room' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          {panel === 'room' ? (
            <View style={[styles.pickerPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <ScrollView style={{ maxHeight: 160 }}>
                <TouchableOpacity
                  onPress={() => { setRoomId(''); setPanel('type'); }}
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                >
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 13 }}>— None —</ThemedText>
                </TouchableOpacity>
                {rooms.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => { setRoomId(r.id); setPanel('type'); haptics('light'); }}
                    style={[
                      styles.pickerItem,
                      { borderBottomColor: colors.border },
                      roomId === r.id && { backgroundColor: colors.primary + '15' },
                    ]}
                  >
                    <ThemedText style={{ fontSize: 13 }}>{r.code} — {r.name}</ThemedText>
                    {roomId === r.id ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Lock toggle */}
      <TouchableOpacity
        onPress={() => { haptics('light'); setIsLocked((v) => !v); }}
        style={[styles.lockRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <Ionicons name={isLocked ? 'lock-closed' : 'lock-open'} size={16} color={isLocked ? colors.primary : colors.textSecondary} />
        <ThemedText style={{ fontSize: 14, flex: 1 }}>Lock slot (skip regenerator)</ThemedText>
        <View style={[
          styles.lockIndicator,
          { backgroundColor: isLocked ? colors.primary : colors.border },
        ]} />
      </TouchableOpacity>

      <Button
        label="Save slot"
        onPress={save}
        loading={updateSlot.isPending}
        style={{ marginTop: Spacing.lg, marginBottom: Spacing.xl }}
      />
    </ScrollView>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function GridScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id, slotId: deepSlotId } = useLocalSearchParams<{ id: string; slotId?: string }>();
  const sid = user?.schoolId ?? '';

  const metaQuery      = useTimetableMeta(id, sid);
  const slotsQuery     = useTimetable(id, sid);
  const periodsQuery   = usePeriods(sid);
  const settingsQuery  = useTimetableSettings(sid);
  const conflictsQuery = useTimetableConflicts(id, sid);

  const [editSlot, setEditSlot]         = useState<TimetableSlot | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [filterStreamId, setFilterStreamId] = useState<string | null>(null);
  const [highlightSlotId, setHighlightSlotId] = useState<string | null>(null);

  // M9: visualization state
  const [showHeatmap, setShowHeatmap]       = useState(false);
  const [showWorkload, setShowWorkload]     = useState(false);
  const [colorBlindMode, setColorBlindMode] = useState<ColorBlindMode>('normal');
  const cbModes: ColorBlindMode[] = ['normal', 'deuteranopia', 'protanopia', 'tritanopia', 'monochrome'];
  const cbLabels: Record<ColorBlindMode, string> = {
    normal:     'Normal',
    deuteranopia: 'Deut',
    protanopia:   'Prot',
    tritanopia:   'Trit',
    monochrome:   'Mono',
  };

  // ── Deep-link highlight ───────────────────────────────────

  const slots = slotsQuery.data ?? [];

  useEffect(() => {
    if (!deepSlotId || slots.length === 0) return;
    const target = slots.find((s) => s.id === deepSlotId);
    if (!target) return;
    setFilterStreamId(target.stream_id);
    setHighlightSlotId(deepSlotId);
    const timer = setTimeout(() => setHighlightSlotId(null), 2500);
    return () => clearTimeout(timer);
  }, [deepSlotId, slots]);

  // ── Derived ───────────────────────────────────────────────

  const meta      = metaQuery.data;
  const periods   = periodsQuery.data ?? [];
  const conflicts = conflictsQuery.data ?? [];

  /** Working-day list derived from school settings; falls back to Mon–Fri. */
  const days = useMemo(() => {
    const wd = settingsQuery.data?.working_days ?? [1, 2, 3, 4, 5];
    return wd.map((v) => ({ value: v, label: DAY_LABELS[v] ?? `Day ${v}` }));
  }, [settingsQuery.data?.working_days]);

  const teachingPeriods = useMemo(
    () => periods.filter((p) => !p.is_break && !p.is_assembly),
    [periods],
  );

  const allBreakPeriods = useMemo(
    () => new Set(periods.filter((p) => p.is_break || p.is_assembly).map((p) => p.period_index)),
    [periods],
  );

  const streams = useMemo(() => {
    const all = meta?.streams ?? [];
    return filterStreamId ? all.filter((s) => s.id === filterStreamId) : all;
  }, [meta?.streams, filterStreamId]);

  // slot map: `${streamId}:${day}:${periodIndex}`
  const slotMap = useMemo(() => {
    const m: Record<string, TimetableSlot> = {};
    for (const s of slots) {
      m[`${s.stream_id}:${s.day_of_week}:${s.period_index}`] = s;
    }
    return m;
  }, [slots]);

  // conflict set by slot id
  const conflictSlotIds = useMemo(
    () => new Set(conflicts.flatMap((c) => [c.slot_id, c.conflicting_slot_id].filter(Boolean))),
    [conflicts],
  );

  const subjectMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of meta?.subjects ?? []) m[s.id] = s.name;
    return m;
  }, [meta?.subjects]);

  const staffMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of meta?.staff ?? []) m[s.id] = s.full_name;
    return m;
  }, [meta?.staff]);

  // ── Handlers ─────────────────────────────────────────────

  // M9: Print mode (web only)
  const printGrid = useCallback(() => {
    if (Platform.OS !== 'web') return;
    haptics('light');
    // Inject a minimal print stylesheet and trigger window.print()
    const style = document.createElement('style');
    style.id = 'tt-print-style';
    style.textContent = `
      @media print {
        body > *:not(#tt-print-root) { display: none !important; }
        #tt-print-root { display: block !important; }
        * { box-shadow: none !important; -webkit-print-color-adjust: exact; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  }, []);

  const exportIcal = useCallback(async () => {
    haptics('light');
    try {
      const { data: session } = await (supabase as any).auth.getSession();
      const token: string = session?.session?.access_token ?? '';
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/export-timetable`;
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ timetable_id: id, school_id: sid, format: 'ical' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ical = await res.text();
      if (Platform.OS === 'web') {
        const blob = new Blob([ical], { type: 'text/calendar' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'timetable.ics';
        a.click();
        URL.revokeObjectURL(blobUrl);
      } else {
        // On mobile, share as plain text so the OS can handle .ics
        const { Share } = await import('react-native');
        await Share.share({ message: ical, title: 'timetable.ics' });
      }
    } catch (e: any) {
      Alert.alert('Export failed', e.message ?? 'Could not export timetable');
    }
  }, [id, sid]);

  const openSlot = useCallback((slot: TimetableSlot | undefined, streamId: string, day: number, periodIndex: number) => {
    haptics('light');
    if (slot) {
      setEditSlot(slot);
    } else {
      // Stub for new slot — caller must create it first in real flow
      // For now open with a synthetic empty shell for the picker
      setEditSlot({
        id: '', school_id: sid, timetable_id: id,
        stream_id: streamId, day_of_week: day, period_id: null,
        period_index: periodIndex, subject_id: null, staff_id: null,
        room_id: null, slot_type: 'lesson', is_double: false,
        pair_slot_id: null, is_locked: false, notes: null,
        updated_at: '',
      });
    }
    setSheetVisible(true);
  }, [sid, id]);

  // ── Loading / error ───────────────────────────────────────

  const isLoading = metaQuery.isLoading || slotsQuery.isLoading || periodsQuery.isLoading || settingsQuery.isLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Grid" showBack />
        <View style={{ padding: Spacing.lg, gap: 12 }}>
          {[1,2,3,4,5].map((i) => <Skeleton key={i} height={56} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (metaQuery.isError || !meta) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Grid" showBack />
        <ErrorState message="Failed to load timetable" onRetry={metaQuery.refetch} />
      </SafeAreaView>
    );
  }

  const conflictCount = conflicts.filter((c) => !c.resolved).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={meta.timetable.name}
        subtitle={meta.timetable.status.toUpperCase()}
        showBack
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            {conflictCount > 0 ? (
              <TouchableOpacity onPress={() => router.push(`/(app)/(admin)/timetable/${id}/conflicts` as any)}>
                <Badge label={`${conflictCount} conflicts`} variant="error" />
              </TouchableOpacity>
            ) : null}
            {Platform.OS === 'web' ? (
              <TouchableOpacity onPress={printGrid} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="print-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={exportIcal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="share-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/(app)/(admin)/timetable/${id}/compare` as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="git-compare-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/(app)/(admin)/timetable/${id}/publish` as any)}>
              <ThemedText style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Publish</ThemedText>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Stream filter chips */}
      {meta.streams.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.streamFilter}>
          <TouchableOpacity
            onPress={() => setFilterStreamId(null)}
            style={[
              styles.streamChip,
              { backgroundColor: !filterStreamId ? colors.primary : colors.surface, borderColor: colors.border },
            ]}
          >
            <ThemedText style={{ color: !filterStreamId ? '#fff' : colors.text, fontSize: 12 }}>All</ThemedText>
          </TouchableOpacity>
          {meta.streams.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => setFilterStreamId(filterStreamId === s.id ? null : s.id)}
              style={[
                styles.streamChip,
                { backgroundColor: filterStreamId === s.id ? colors.primary : colors.surface, borderColor: colors.border },
              ]}
            >
              <ThemedText style={{ color: filterStreamId === s.id ? '#fff' : colors.text, fontSize: 12 }}>{s.name}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {/* M9: Visualization toolbar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vizToolbar}>
        {/* Heatmap toggle */}
        <TouchableOpacity
          onPress={() => { haptics('light'); setShowHeatmap((v) => !v); }}
          style={[
            styles.vizChip,
            { backgroundColor: showHeatmap ? colors.primary : colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="flame-outline" size={14} color={showHeatmap ? '#fff' : colors.textSecondary} />
          <ThemedText style={{ color: showHeatmap ? '#fff' : colors.text, fontSize: 11 }}>Heatmap</ThemedText>
        </TouchableOpacity>

        {/* Workload sidebar toggle */}
        <TouchableOpacity
          onPress={() => { haptics('light'); setShowWorkload((v) => !v); }}
          style={[
            styles.vizChip,
            { backgroundColor: showWorkload ? colors.primary : colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="bar-chart-outline" size={14} color={showWorkload ? '#fff' : colors.textSecondary} />
          <ThemedText style={{ color: showWorkload ? '#fff' : colors.text, fontSize: 11 }}>Load</ThemedText>
        </TouchableOpacity>

        {/* Color-blind mode picker */}
        {cbModes.map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => { haptics('light'); setColorBlindMode(mode); }}
            style={[
              styles.vizChip,
              { backgroundColor: colorBlindMode === mode ? '#6B7280' : colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="eye-outline" size={13} color={colorBlindMode === mode ? '#fff' : colors.textSecondary} />
            <ThemedText style={{ color: colorBlindMode === mode ? '#fff' : colors.text, fontSize: 11 }}>
              {cbLabels[mode]}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {streams.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No streams" description="Set up streams in school structure first" />
      ) : teachingPeriods.length === 0 ? (
        <EmptyState icon="time-outline" title="No periods" description="Configure periods in Timetable → Periods" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <ScrollView>
            {/* Column header: Period label + Day×Period headers */}
            <View style={[styles.headerRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.streamColHeader, { width: LABEL_W, borderRightColor: colors.border, borderBottomColor: colors.border }]}>
                <ThemedText style={[styles.headerText, { color: colors.textSecondary }]}>Stream</ThemedText>
              </View>
              {days.map((d) =>
                teachingPeriods.map((p) => (
                  <View
                    key={`${d.value}-${p.period_index}`}
                    style={[styles.colHeader, { width: CELL_W, borderRightColor: colors.border, borderBottomColor: colors.border }]}
                  >
                    <ThemedText style={[styles.colHeaderDay, { color: colors.textSecondary }]}>{d.label}</ThemedText>
                    <ThemedText style={[styles.colHeaderPeriod, { color: colors.text }]}>{p.name}</ThemedText>
                  </View>
                ))
              )}
            </View>

            {/* Stream rows */}
            {streams.map((stream) => (
              <View key={stream.id} style={[styles.streamRow, { borderBottomColor: colors.border }]}>
                {/* Sticky stream label */}
                <View style={[styles.streamLabel, { width: LABEL_W, borderRightColor: colors.border, backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.streamName} numberOfLines={2}>{stream.name}</ThemedText>
                </View>

                {/* Cells */}
                {days.map((d) =>
                  teachingPeriods.map((p) => {
                    const key = `${stream.id}:${d.value}:${p.period_index}`;
                    const slot = slotMap[key];
                    const hasConflict = slot ? conflictSlotIds.has(slot.id) : false;
                    const isHighlighted = !!slot && slot.id === highlightSlotId;
                    return (
                      <GridCell
                        key={key}
                        slot={slot}
                        hasConflict={hasConflict}
                        isHighlighted={isHighlighted}
                        subjects={subjectMap}
                        staff={staffMap}
                        colors={colors}
                        onPress={() => openSlot(slot, stream.id, d.value, p.period_index)}
                      />
                    );
                  })
                )}
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      )}

      {/* Slot edit sheet */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editSlot
          ? `${days.find((d) => d.value === editSlot.day_of_week)?.label ?? DAY_LABELS[editSlot.day_of_week] ?? ''} · ${periods.find((p) => p.period_index === editSlot.period_index)?.name ?? ''}`
          : 'Edit Slot'}
      >
        {editSlot && sheetVisible ? (
          <SlotEditSheet
            slot={editSlot}
            subjects={meta.subjects}
            staff={meta.staff}
            rooms={meta.rooms}
            timetableId={id}
            schoolId={sid}
            onClose={() => setSheetVisible(false)}
            colors={colors}
          />
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow:        { flexDirection: 'row', position: 'sticky' as any },
  streamColHeader:  { justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderBottomWidth: 1, height: 48 },
  colHeader:        { justifyContent: 'center', alignItems: 'center', height: 48, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: 1 },
  colHeaderDay:     { fontSize: 10 },
  colHeaderPeriod:  { fontSize: 12, fontWeight: '600' },
  headerText:       { fontSize: 11, fontWeight: '600' },
  streamRow:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  streamLabel:      { justifyContent: 'center', paddingHorizontal: Spacing.xs, borderRightWidth: 1 },
  streamName:       { fontSize: 12, fontWeight: '600' },
  cell: {
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    padding: 4,
  },
  cellSubject:   { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cellTeacher:   { fontSize: 10, marginTop: 2, textAlign: 'center' },
  cellBreak:     { fontSize: 11 },
  lockBadge: {
    position: 'absolute', top: 3, right: 3,
  },
  conflictDot: {
    position: 'absolute', bottom: 2, right: 2,
  },
  streamFilter:  { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, maxHeight: 44 },
  vizToolbar:    { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, maxHeight: 40 },
  vizChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, marginRight: Spacing.xs,
  },
  streamChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, marginRight: Spacing.xs,
  },
  sheetLabel:   { fontSize: 12, fontWeight: '500', marginBottom: Spacing.xs, marginTop: Spacing.sm },
  typeChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.sm, borderWidth: 1,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pickerPanel: {
    borderWidth: 1, borderRadius: Radius.md,
    marginBottom: Spacing.md, overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderBottomWidth: 1,
  },
  lockRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  lockIndicator: { width: 10, height: 10, borderRadius: 5 },
});
