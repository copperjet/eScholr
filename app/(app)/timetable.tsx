/**
 * Shared Timetable Viewer — all roles.
 *
 * Preference order:
 *   1. Structured published TT → rendered as read-only grid
 *   2. PDF / image upload fallback (existing useTimetableDocuments path)
 *
 * Structured modes:
 *   teacher  (owner='teacher', staffId present) → slots by staff_id
 *   stream   (student auto-resolves streamId; parent passes ?streamId=uuid)
 *
 * Navigation params:
 *   owner='teacher' | 'class'  — selects mode (default: class)
 *   streamId=uuid              — parent passes child's streamId directly
 */
import React, { useMemo } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  Image, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  ThemedText, Skeleton, EmptyState, ErrorState, PDFViewer,
} from '../../components/ui';
import { Spacing, Radius } from '../../constants/Typography';
import { useTimetableDocuments } from '../../hooks/useTimetable';
import {
  usePeriods,
  usePublishedTimetableForStream,
  useTeacherPublishedSchedule,
  useStudentStream,
  useTimetableSettings,
  type TimetableSlot,
  type Period,
} from '../../hooks/useTimetableBuilder';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Subject color palette (fallback only) ────────────────────

const PALETTE = [
  { bg: '#EFF6FF', text: '#1D4ED8' },
  { bg: '#F0FDF4', text: '#15803D' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FDF2F8', text: '#9D174D' },
  { bg: '#F5F3FF', text: '#6D28D9' },
  { bg: '#FFF7ED', text: '#C2410C' },
  { bg: '#F0FDFA', text: '#0F766E' },
  { bg: '#FFF1F2', text: '#BE123C' },
  { bg: '#F7FEE7', text: '#3F6212' },
  { bg: '#E0F2FE', text: '#0369A1' },
  { bg: '#FCE7F3', text: '#831843' },
  { bg: '#FEF9C3', text: '#854D0E' },
];

function fallbackSubjectColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ── Lookup hooks (shared, light) ──────────────────────────────

function useSubjectMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['tv-subjects', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('subjects').select('id, name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.name;
      return m;
    },
  });
}

function useStaffMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['tv-staff', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('staff').select('id, full_name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.full_name;
      return m;
    },
  });
}

function useStreamMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['tv-streams', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('streams').select('id, name').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const s of data ?? []) m[s.id] = s.name;
      return m;
    },
  });
}

function useRoomMap(schoolId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['tv-rooms', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any).from('rooms').select('id, code').eq('school_id', schoolId);
      const m: Record<string, string> = {};
      for (const r of data ?? []) m[r.id] = r.code;
      return m;
    },
  });
}

// R2.8: read subject_colors from DB (falls back to PALETTE if row absent)
function useSubjectColorMap(schoolId: string) {
  return useQuery<Record<string, { bg: string; text: string }>>({
    queryKey: ['tv-subject-colors', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 15,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('subject_colors')
        .select('subject_id, bg_color, fg_color')
        .eq('school_id', schoolId);
      const m: Record<string, { bg: string; text: string }> = {};
      for (const row of data ?? []) m[row.subject_id] = { bg: row.bg_color, text: row.fg_color };
      return m;
    },
  });
}

// ── Structured grid (read-only) ───────────────────────────────

const DOW_LABELS: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

const CELL_W  = 82;
const CELL_H  = 64;
const LABEL_W = 66;

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isActivePeriod(period: Period) {
  const [sh, sm] = period.start_time.split(':').map(Number);
  const [eh, em] = period.end_time.split(':').map(Number);
  const mins = currentMinutes();
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

interface GridProps {
  slots: TimetableSlot[];
  periods: Period[];
  subjects: Record<string, string>;
  personMap: Record<string, string>;  // staff names (stream mode) or stream names (teacher mode)
  rooms: Record<string, string>;
  colors: any;
  subjectColorMap?: Record<string, { bg: string; text: string }>; // R2.8: DB-sourced colors
  days?: Array<{ dow: number; label: string }>;                   // R0.7: dynamic working days
}

function StructuredGrid({ slots, periods, subjects, personMap, rooms, colors, subjectColorMap, days: daysProp }: GridProps) {
  // R0.7: use passed days or fallback to Mon–Fri
  const days = daysProp ?? [
    { dow: 1, label: 'Mon' }, { dow: 2, label: 'Tue' }, { dow: 3, label: 'Wed' },
    { dow: 4, label: 'Thu' }, { dow: 5, label: 'Fri' },
  ];

  // R2.8: resolve color — DB row first, fallback to hash-based palette
  function subjectColor(id: string) {
    return subjectColorMap?.[id] ?? fallbackSubjectColor(id);
  }
  const todayDow = new Date().getDay(); // 0=Sun, 1=Mon … 5=Fri

  const slotMap = useMemo(() => {
    const m: Record<string, TimetableSlot> = {};
    for (const s of slots) m[`${s.day_of_week}:${s.period_index}`] = s;
    return m;
  }, [slots]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header row */}
        <View style={[gStyles.headerRow, { backgroundColor: colors.surface }]}>
          <View style={[gStyles.periodLabel, { width: LABEL_W, borderRightColor: colors.border, borderBottomColor: colors.border }]}>
            <ThemedText style={[gStyles.headerText, { color: colors.textMuted }]}>Period</ThemedText>
          </View>
          {days.map((d) => (
            <View
              key={d.dow}
              style={[
                gStyles.dayHeader,
                { width: CELL_W, borderRightColor: colors.border, borderBottomColor: colors.border },
                todayDow === d.dow && { backgroundColor: (colors.brand?.primary ?? colors.primary) + '12' },
              ]}
            >
              <ThemedText style={[
                gStyles.dayLabel,
                { color: todayDow === d.dow ? (colors.brand?.primary ?? colors.primary) : colors.textSecondary },
              ]}>
                {d.label}
              </ThemedText>
              {todayDow === d.dow && (
                <View style={[gStyles.todayDot, { backgroundColor: colors.brand?.primary ?? colors.primary }]} />
              )}
            </View>
          ))}
        </View>

        {/* Period rows */}
        {periods.map((period) => {
          const isBreak    = period.is_break || period.is_assembly;
          const isCurrent  = !isBreak && isActivePeriod(period);
          const breakLabel = period.is_assembly ? 'Assembly' : 'Break / Lunch';

          return (
            <View key={period.id} style={[gStyles.periodRow, { borderBottomColor: colors.border }]}>
              {/* Period label */}
              <View style={[
                gStyles.periodLabel,
                { width: LABEL_W, borderRightColor: colors.border },
                isCurrent && { backgroundColor: '#FEF9C3' },
              ]}>
                <ThemedText style={gStyles.periodName}>{period.name}</ThemedText>
                <ThemedText style={[gStyles.periodTime, { color: colors.textMuted }]}>
                  {period.start_time.slice(0, 5)}
                </ThemedText>
                {isCurrent && <View style={gStyles.activeDot} />}
              </View>

              {/* Break: show across all cells */}
              {isBreak ? (
                days.map((d) => (
                  <View
                    key={d.dow}
                    style={[gStyles.cell, { width: CELL_W, height: CELL_H, backgroundColor: colors.surfaceSecondary, borderRightColor: colors.border }]}
                  >
                    <ThemedText style={[gStyles.breakLabel, { color: colors.textMuted }]}>{breakLabel}</ThemedText>
                  </View>
                ))
              ) : (
                days.map((d) => {
                  const slot = slotMap[`${d.dow}:${period.period_index}`];
                  if (!slot || slot.slot_type !== 'lesson' || !slot.subject_id) {
                    return (
                      <View
                        key={d.dow}
                        style={[
                          gStyles.cell,
                          { width: CELL_W, height: CELL_H, borderRightColor: colors.border, backgroundColor: colors.surface },
                          todayDow === d.dow && { backgroundColor: (colors.brand?.primary ?? colors.primary) + '08' },
                        ]}
                      />
                    );
                  }
                  const col = subjectColor(slot.subject_id);
                  const teacherOrStream = personMap[slot.staff_id ?? slot.stream_id] ?? '';
                  const roomCode = slot.room_id ? (rooms[slot.room_id] ?? '') : '';
                  return (
                    <View
                      key={d.dow}
                      style={[
                        gStyles.cell,
                        gStyles.lessonCell,
                        { width: CELL_W, height: CELL_H, backgroundColor: col.bg, borderRightColor: colors.border },
                        isCurrent && { borderWidth: 1.5, borderColor: col.text },
                      ]}
                    >
                      <ThemedText style={[gStyles.cellSubject, { color: col.text }]} numberOfLines={2}>
                        {subjects[slot.subject_id] ?? '—'}
                      </ThemedText>
                      {teacherOrStream ? (
                        <ThemedText style={[gStyles.cellSecondary, { color: col.text + 'BB' }]} numberOfLines={1}>
                          {teacherOrStream.split(' ').slice(-1)[0]}
                        </ThemedText>
                      ) : null}
                      {roomCode ? (
                        <ThemedText style={[gStyles.cellRoom, { color: col.text + '88' }]} numberOfLines={1}>
                          {roomCode}
                        </ThemedText>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          );
        })}
      </ScrollView>
    </ScrollView>
  );
}

const gStyles = StyleSheet.create({
  headerRow:    { flexDirection: 'row' },
  periodLabel:  { justifyContent: 'center', alignItems: 'center', padding: 4, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: 1, position: 'relative' },
  headerText:   { fontSize: 10, fontWeight: '600' },
  dayHeader:    { justifyContent: 'center', alignItems: 'center', height: 44, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: 1 },
  dayLabel:     { fontSize: 12, fontWeight: '600' },
  todayDot:     { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  periodRow:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  periodName:   { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  periodTime:   { fontSize: 9, marginTop: 1, textAlign: 'center' },
  activeDot:    { width: 5, height: 5, borderRadius: 3, backgroundColor: '#F59E0B', marginTop: 3 },
  cell:         { justifyContent: 'center', alignItems: 'center', padding: 3, borderRightWidth: StyleSheet.hairlineWidth, height: CELL_H },
  lessonCell:   { borderRadius: 0 },
  breakLabel:   { fontSize: 10, fontStyle: 'italic' },
  cellSubject:  { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cellSecondary:{ fontSize: 9, textAlign: 'center', marginTop: 2 },
  cellRoom:     { fontSize: 8, textAlign: 'center', marginTop: 1 },
});

// ── Main viewer ───────────────────────────────────────────────

const TEACHER_ROLES = new Set(['st', 'hrt', 'hod', 'coordinator', 'principal', 'admin', 'school_super_admin']);

export default function TimetableViewer() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { owner, streamId: paramStreamId } =
    useLocalSearchParams<{ owner?: 'class' | 'teacher'; streamId?: string }>();

  // ── Mode detection ────────────────────────────────────────
  const isTeacherMode =
    owner === 'teacher' &&
    TEACHER_ROLES.has(user?.activeRole ?? '') &&
    !!user?.staffId;

  // For student auto-resolve
  const isStudent = user?.activeRole === 'student';

  // ── Structured data ───────────────────────────────────────

  // Teacher: slots by staff_id in published TT
  const teacherSlotsQ = useTeacherPublishedSchedule(
    schoolId,
    isTeacherMode ? (user?.staffId ?? null) : null,
  );

  // Student: resolve stream first
  const streamQ = useStudentStream(
    schoolId,
    isStudent ? (user?.studentId ?? null) : null,
  );
  const resolvedStreamId = paramStreamId ?? (isStudent ? (streamQ.data ?? null) : null);

  // Stream-based slots (student + parent)
  const streamSlotsQ = usePublishedTimetableForStream(
    schoolId,
    resolvedStreamId ?? '',
  );

  // Periods (shared)
  const periodsQ = usePeriods(schoolId);

  // Lookup maps (only needed for structured view)
  const subjectsQ       = useSubjectMap(schoolId);
  const staffQ          = useStaffMap(schoolId);
  const streamsQ        = useStreamMap(schoolId);
  const roomsQ          = useRoomMap(schoolId);
  const subjectColorsQ  = useSubjectColorMap(schoolId);  // R2.8
  const settingsQ       = useTimetableSettings(schoolId); // R0.7

  // ── PDF fallback data ─────────────────────────────────────
  const { data: docs = [], isLoading: docsLoading, isError: docsError, refetch: docsRefetch } =
    useTimetableDocuments(schoolId);

  const ownerFilter = owner === 'teacher' ? 'teacher' : 'class';
  const filteredDocs = docs.filter((d) => {
    if ((d.owner_type ?? 'class') !== ownerFilter) return false;
    if (ownerFilter === 'teacher' && user?.staffId) return d.staff_id === user.staffId;
    return true;
  });
  const currentDocs = filteredDocs.filter((d) => d.is_current);

  // ── Derived ───────────────────────────────────────────────

  const structuredSlots = isTeacherMode
    ? (teacherSlotsQ.data ?? [])
    : (streamSlotsQ.data ?? []);

  const structuredLoading = isTeacherMode
    ? teacherSlotsQ.isLoading
    : (isStudent && streamQ.isLoading) || streamSlotsQ.isLoading;

  const hasStructured = structuredSlots.length > 0;

  const subjects = subjectsQ.data ?? {};
  const staff    = staffQ.data ?? {};
  const streams  = streamsQ.data ?? {};
  const rooms    = roomsQ.data ?? {};

  // teacher mode: personMap = stream names; stream mode: personMap = staff names
  const personMap = isTeacherMode ? streams : staff;

  const periods = periodsQ.data ?? [];

  // R0.7 + R2.8: dynamic working days from settings (falls back to Mon–Fri)
  const viewerDays = useMemo(
    () => (settingsQ.data?.working_days ?? [1, 2, 3, 4, 5]).map(
      (dow: number) => ({ dow, label: DOW_LABELS[dow] ?? `Day ${dow}` }),
    ),
    [settingsQ.data?.working_days],
  );

  // ── Loading skeleton ──────────────────────────────────────

  const isLoading = structuredLoading || periodsQ.isLoading || docsLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Timetable</ThemedText>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="100%" height={44} radius={Radius.md} />
          <Skeleton width="100%" height={320} radius={Radius.lg} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────

  const hasError = (isTeacherMode ? teacherSlotsQ.isError : streamSlotsQ.isError) && docsError;
  if (hasError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Could not load timetable"
          description="Try again."
          onRetry={() => { docsRefetch(); isTeacherMode ? teacherSlotsQ.refetch() : streamSlotsQ.refetch(); }}
        />
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Timetable</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Structured grid ── */}
      {hasStructured ? (
        <View style={{ flex: 1 }}>
          {/* Mode badge */}
          <View style={[styles.modeBadge, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
            <Ionicons
              name={isTeacherMode ? 'person-outline' : 'school-outline'}
              size={12}
              color={colors.textMuted}
            />
            <ThemedText style={[styles.modeText, { color: colors.textMuted }]}>
              {isTeacherMode ? 'Your schedule' : 'Class timetable'}
            </ThemedText>
            {streams[resolvedStreamId ?? ''] ? (
              <ThemedText style={[styles.modeText, { color: colors.textMuted }]}>
                · {streams[resolvedStreamId ?? '']}
              </ThemedText>
            ) : null}
          </View>
          <StructuredGrid
            slots={structuredSlots}
            periods={periods}
            subjects={subjects}
            personMap={personMap}
            rooms={rooms}
            colors={colors}
            subjectColorMap={subjectColorsQ.data}
            days={viewerDays}
          />
        </View>

      /* ── PDF / image fallback ── */
      ) : currentDocs.length === 0 ? (
        <EmptyState
          title="No timetable available"
          description="No timetable has been published yet."
          icon="calendar-outline"
        />
      ) : (
        <PDFFallback
          docs={currentDocs}
          colors={colors}
        />
      )}
    </SafeAreaView>
  );
}

// ── PDF fallback (extracted so structured path never mounts it) ─

interface DocItem {
  id: string;
  label: string;
  file_type: string;
  file_url: string;
  effective_from: string;
  is_current: boolean;
  owner_type?: string;
  staff_id?: string;
  staff_name?: string;
  grade_name?: string;
  stream_name?: string;
}

function PDFFallback({ docs, colors }: { docs: DocItem[]; colors: any }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedDoc = selectedId ? docs.find((d) => d.id === selectedId) ?? docs[0] : docs[0];

  return (
    <View style={{ flex: 1 }}>
      {docs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.switcher}
        >
          {docs.map((doc) => {
            const active = (selectedDoc?.id ?? '') === doc.id;
            return (
              <TouchableOpacity
                key={doc.id}
                onPress={() => setSelectedId(doc.id)}
                style={[
                  styles.switcherChip,
                  {
                    backgroundColor: active ? colors.brand?.primary + '18' : colors.surfaceSecondary,
                    borderColor:     active ? colors.brand?.primary       : colors.border,
                  },
                ]}
              >
                <ThemedText
                  variant="caption"
                  style={{
                    color:      active ? colors.brand?.primary : colors.textMuted,
                    fontWeight: active ? '700' : '400',
                    fontSize: 11,
                  }}
                >
                  {doc.owner_type === 'teacher'
                    ? (doc.staff_name ?? 'Teacher')
                    : `${doc.grade_name ?? 'School'}${doc.stream_name ? ` · ${doc.stream_name}` : ''}`}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selectedDoc && (
        <View style={[styles.infoBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Ionicons
            name={selectedDoc.file_type === 'pdf' ? 'document-text-outline' : 'image-outline'}
            size={14}
            color={colors.textMuted}
          />
          <ThemedText variant="caption" color="muted" style={{ flex: 1, marginLeft: 6 }} numberOfLines={1}>
            {selectedDoc.label}
          </ThemedText>
          <ThemedText variant="caption" color="muted">
            From {format(new Date(selectedDoc.effective_from), 'dd/MM/yy')}
          </ThemedText>
        </View>
      )}

      {selectedDoc && (
        selectedDoc.file_type === 'image' ? (
          <ScrollView
            style={{ flex: 1 }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', padding: Spacing.sm }}
          >
            <Image
              source={{ uri: selectedDoc.file_url }}
              style={{ width: SCREEN_W - Spacing.base * 2, aspectRatio: 1, borderRadius: Radius.lg }}
              resizeMode="contain"
            />
          </ScrollView>
        ) : (
          <PDFViewer
            uri={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(selectedDoc.file_url)}`}
            style={{ flex: 1 }}
          />
        )
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modeText: { fontSize: 11 },
  switcher: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs },
  switcherChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  infoBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
});
