/**
 * CREED Entry — HRT view
 * Grid: students as rows, 5 traits as columns.
 * Tap any cell → BottomSheet with rating options (Cambridge or Developmental).
 * Locked after report approval.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, Avatar, BottomSheet, FAB, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  CREED_TRAITS, CAMBRIDGE_RATINGS, DEVELOPMENTAL_RATINGS,
  useCharacterFramework, useCreedForStream, useUpdateCreed,
  type TraitKey,
} from '../../../hooks/useCreed';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

// Color map for Cambridge grades
const CAMBRIDGE_COLORS: Record<string, string> = {
  'A*': Colors.semantic.success,
  'A':  Colors.semantic.success,
  'B':  '#22C55E',
  'C':  Colors.semantic.info,
  'D':  Colors.semantic.warning,
  'E':  '#FB923C',
  'F':  Colors.semantic.error,
  'G':  Colors.semantic.error,
  'U':  '#6B7280',
};

const DEV_COLORS: Record<string, string> = {
  'Exceeding':   Colors.semantic.success,
  'Secure':      Colors.semantic.info,
  'Developing':  Colors.semantic.warning,
  'Emerging':    Colors.semantic.error,
};

function getRatingColor(value: string | null | undefined): string {
  if (!value) return '#9CA3AF';
  return CAMBRIDGE_COLORS[value] ?? DEV_COLORS[value] ?? '#9CA3AF';
}

function useHRTStream(staffId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['hrt-stream-for-creed', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from('hrt_assignments')
        .select('stream_id, semester_id, streams ( name )')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId)
        .limit(1)
        .single();
      return data as any ?? null;
    },
  });
}

export default function CreedScreen() {
  const { colors, scheme } = useTheme();
  const { user } = useAuthStore();

  const { data: hrtAssignment } = useHRTStream(user?.staffId ?? null, user?.schoolId ?? '');
  const { data: framework } = useCharacterFramework(user?.schoolId ?? '');
  const { data, isLoading, isError, refetch } = useCreedForStream(
    hrtAssignment?.stream_id,
    hrtAssignment?.semester_id,
    user?.schoolId ?? '',
  );
  const updateCreed = useUpdateCreed(user?.schoolId ?? '');

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetStudent, setSheetStudent] = useState<{ id: string; name: string } | null>(null);
  const [sheetTrait, setSheetTrait] = useState<TraitKey>('creativity');
  const [sheetCurrentVal, setSheetCurrentVal] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<string, Record<string, string>>>({});

  const ratings: readonly string[] = framework?.rating_scale === 'developmental'
    ? DEVELOPMENTAL_RATINGS
    : CAMBRIDGE_RATINGS;

  const getEffectiveValue = useCallback(
    (studentId: string, trait: TraitKey): string | null => {
      const local = localEdits[studentId]?.[trait];
      if (local !== undefined) return local;
      return data?.records?.[studentId]?.[trait] ?? null;
    },
    [localEdits, data?.records],
  );

  const openSheet = useCallback(
    (studentId: string, studentName: string, trait: TraitKey) => {
      const record = data?.records?.[studentId];
      if (record?.is_locked) { haptics.error(); return; }
      haptics.selection();
      setSheetStudent({ id: studentId, name: studentName });
      setSheetTrait(trait);
      setSheetCurrentVal(getEffectiveValue(studentId, trait));
      setSheetVisible(true);
    },
    [data?.records, getEffectiveValue],
  );

  const handleSelectRating = useCallback(
    async (value: string) => {
      if (!sheetStudent) return;
      haptics.selection();
      // Optimistic
      setLocalEdits((prev) => ({
        ...prev,
        [sheetStudent.id]: { ...prev[sheetStudent.id], [sheetTrait]: value },
      }));
      setSheetVisible(false);

      const existingRecord = data?.records?.[sheetStudent.id];
      try {
        await updateCreed.mutateAsync({
          studentId:  sheetStudent.id,
          semesterId: hrtAssignment!.semester_id,
          enteredBy:  user!.staffId!,
          trait:      sheetTrait,
          value,
          existingId: existingRecord?.id,
        });
      } catch {
        haptics.error();
        // Revert optimistic
        setLocalEdits((prev) => {
          const next = { ...prev };
          if (next[sheetStudent.id]) {
            const copy = { ...next[sheetStudent.id] };
            delete copy[sheetTrait];
            next[sheetStudent.id] = copy;
          }
          return next;
        });
      }
    },
    [sheetStudent, sheetTrait, data?.records, hrtAssignment, user, updateCreed],
  );

  const students = data?.students ?? [];
  const traitLabels = (framework?.value_names?.length === 5
    ? framework.value_names
    : CREED_TRAITS.map((t) => t.label)) as string[];

  const completedCount = useMemo(() => {
    return students.filter((s) =>
      CREED_TRAITS.every((t) => !!getEffectiveValue(s.id, t.key)),
    ).length;
  }, [students, getEffectiveValue]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load CREED data" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="CREED Ratings"
        subtitle={`${hrtAssignment?.streams?.name ?? '—'} · ${completedCount}/${students.length} complete`}
        showBack
      />

      {/* Scale badge */}
      <View style={[styles.scaleBadge, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
        <Ionicons name="ribbon-outline" size={13} color={colors.brand.primary} />
        <ThemedText variant="caption" style={{ color: colors.brand.primary, marginLeft: 6 }}>
          {framework?.rating_scale === 'developmental' ? 'Developmental scale' : 'Cambridge scale'} · Tap a cell to grade
        </ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={36} height={36} radius={18} />
              <View style={{ flex: 1, gap: 6, marginLeft: Spacing.md }}>
                <Skeleton width="40%" height={13} />
              </View>
              {Array.from({ length: 5 }).map((__, j) => (
                <Skeleton key={j} width={36} height={28} radius={Radius.sm} style={{ marginLeft: 4 }} />
              ))}
            </View>
          ))}
        </View>
      ) : students.length === 0 ? (
        <EmptyState
          title="No students"
          description="There are no active students in your class."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Column header row */}
          <View style={[styles.headerRow, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
            <View style={styles.studentHeaderCell}>
              <ThemedText variant="label" color="muted" style={{ fontSize: 10 }}>STUDENT</ThemedText>
            </View>
            {traitLabels.map((label, i) => (
              <View key={i} style={styles.traitHeaderCell}>
                <ThemedText variant="label" color="muted" style={{ fontSize: 9, textAlign: 'center' }} numberOfLines={2}>
                  {label.toUpperCase()}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Student rows */}
          {students.map((student, idx) => {
            const record = data?.records?.[student.id];
            const isLocked = record?.is_locked ?? false;

            return (
              <View
                key={student.id}
                style={[
                  styles.studentRow,
                  {
                    backgroundColor: idx % 2 === 0 ? colors.background : colors.surface,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                {/* Student info */}
                <View style={styles.studentCell}>
                  <Avatar name={student.full_name} photoUrl={student.photo_url} size={30} />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
                      {student.full_name}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted" style={{ fontSize: 10 }}>
                      {student.student_number}
                    </ThemedText>
                  </View>
                  {isLocked && <Ionicons name="lock-closed" size={12} color={colors.textMuted} />}
                </View>

                {/* Trait cells */}
                {CREED_TRAITS.map((trait) => {
                  const value = getEffectiveValue(student.id, trait.key);
                  const ratingColor = getRatingColor(value);

                  return (
                    <TouchableOpacity
                      key={trait.key}
                      onPress={() => openSheet(student.id, student.full_name, trait.key)}
                      disabled={isLocked}
                      activeOpacity={isLocked ? 1 : 0.7}
                      style={[
                        styles.traitCell,
                        {
                          backgroundColor: value ? ratingColor + '20' : colors.surfaceSecondary,
                          borderColor: value ? ratingColor + '60' : colors.border,
                        },
                      ]}
                    >
                      <ThemedText
                        variant="label"
                        style={{
                          color: value ? ratingColor : colors.textMuted,
                          fontWeight: '800',
                          fontSize: framework?.rating_scale === 'developmental' ? 8 : 12,
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {value
                          ? framework?.rating_scale === 'developmental'
                            ? value.slice(0, 3).toUpperCase()
                            : value
                          : '—'}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Rating picker sheet */}
      <BottomSheet
        visible={sheetVisible && !!sheetStudent}
        onClose={() => setSheetVisible(false)}
        title={`${sheetStudent?.name ?? ''} — ${CREED_TRAITS.find((t) => t.key === sheetTrait)?.label ?? ''}`}
        snapHeight={Math.min(560, ratings.length * 56 + 100)}
      >
        <View style={styles.ratingOptions}>
          {ratings.map((rating) => {
            const isActive = sheetCurrentVal === rating || localEdits[sheetStudent?.id ?? '']?.[sheetTrait] === rating;
            const rColor = getRatingColor(rating);
            return (
              <TouchableOpacity
                key={rating}
                onPress={() => handleSelectRating(rating)}
                style={[
                  styles.ratingOption,
                  {
                    backgroundColor: isActive ? rColor + '18' : colors.surfaceSecondary,
                    borderColor: isActive ? rColor : colors.border,
                  },
                ]}
              >
                <View style={[styles.ratingDot, { backgroundColor: rColor }]} />
                <ThemedText variant="bodyLg" style={{ color: rColor, fontWeight: '700', flex: 1 }}>
                  {rating}
                </ThemedText>
                {isActive && <Ionicons name="checkmark-circle" size={18} color={rColor} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scaleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonList: { padding: Spacing.base, gap: Spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  studentHeaderCell: { flex: 1, minWidth: 120 },
  traitHeaderCell: { width: 44, alignItems: 'center' },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  studentCell: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 120, paddingRight: 4 },
  traitCell: {
    width: 40,
    height: 32,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  ratingOptions: { gap: 8 },
  ratingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  ratingDot: { width: 10, height: 10, borderRadius: 5 },
});
