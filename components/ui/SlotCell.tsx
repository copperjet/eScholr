/**
 * SlotCell — M9
 * Renders a single timetable grid cell with full visual treatment:
 *  - Subject background color (from subject_colors or fallback palette)
 *  - Subject name + teacher/stream name + room code
 *  - Double-period bracket on left edge
 *  - Override badge (diagonal tint + corner tag)
 *  - Conflict border + shake-on-hover
 *  - Lock badge
 *  - Today column highlight + active-period border pulse
 *  - Break / assembly / free / study-hall variants
 *  - Color-blind mode (replaces color with icon + pattern)
 *
 * Used by TimetableGrid (admin editor) and StructuredGrid (read views).
 */
import React, { useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Animated,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { ConflictBadge } from './ConflictBadge';
import { OverrideBadge, type OverrideType } from './OverrideBadge';
import { LockBadge } from './LockBadge';

// ── Color-blind palette mapping ───────────────────────────────

export type ColorBlindMode = 'normal' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'monochrome';

const CB_OVERRIDES: Record<Exclude<ColorBlindMode, 'normal'>, string[]> = {
  deuteranopia: ['#0077BB','#EE7733','#BBBBBB','#CC3311','#009988','#EE3377','#33BBEE','#FFFFFF'],
  protanopia:   ['#0077BB','#EE7733','#BBBBBB','#EE3377','#009988','#CC3311','#33BBEE','#FFFFFF'],
  tritanopia:   ['#CC3311','#0077BB','#EE7733','#BBBBBB','#33BBEE','#EE3377','#009988','#FFFFFF'],
  monochrome:   ['#111','#333','#555','#777','#999','#BBB','#DDD','#EEE'],
};

function colorBlindBg(originalBg: string, originalFg: string, mode: ColorBlindMode, index: number): { bg: string; fg: string } {
  if (mode === 'normal') return { bg: originalBg, fg: originalFg };
  const palette = CB_OVERRIDES[mode];
  const bg = palette[index % palette.length];
  const fg = mode === 'monochrome' ? (index < 4 ? '#fff' : '#000') : '#fff';
  return { bg, fg };
}

// ── Slot types ────────────────────────────────────────────────

export type SlotCellType = 'lesson' | 'break' | 'assembly' | 'free' | 'study_hall' | 'empty';

export interface SlotCellData {
  slotId?: string;
  type: SlotCellType;
  subjectId?: string;
  subjectName?: string;
  subjectColor?: { bg: string; text: string };
  /** Used for color-blind palette index (deterministic from subjectId) */
  subjectIndex?: number;
  teacherOrStream?: string;   // last name or stream name
  roomCode?: string;
  isLocked?: boolean;
  isDouble?: boolean;
  isDoubleFirst?: boolean;   // first of a double pair
  isDoubleLast?: boolean;    // second of a double pair
  conflictCount?: number;    // >0 = show ConflictBadge
  override?: {
    type: OverrideType;
    label?: string;
    teacherOrStream?: string; // substitute teacher name
  };
  isCurrent?: boolean;       // current period (pulse)
  isToday?: boolean;         // today's column
}

interface SlotCellProps {
  data: SlotCellData;
  width: number;
  height: number;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  colorBlindMode?: ColorBlindMode;
  /** Show room-type icon in bottom-right corner */
  roomTypeIcon?: string; // Ionicons key
  style?: ViewStyle;
}

export function SlotCell({
  data, width, height, onPress, onLongPress,
  selected = false, colorBlindMode = 'normal',
  roomTypeIcon, style,
}: SlotCellProps) {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Shake on conflict (triggered by useEffect when conflictCount appears)
  React.useEffect(() => {
    if (data.conflictCount && data.conflictCount > 0) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 3,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -3, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 2,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [data.conflictCount]);

  // ── Non-lesson types ──────────────────────────────────────

  if (data.type === 'empty') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.base, { width, height }, style]}>
        <View style={[styles.emptyInner, data.isToday && styles.todayTint]} />
      </TouchableOpacity>
    );
  }

  if (data.type === 'break' || data.type === 'assembly') {
    const icon = data.type === 'assembly' ? 'megaphone-outline' : 'cafe-outline';
    const label = data.type === 'assembly' ? 'Assembly' : 'Break';
    return (
      <View style={[styles.base, styles.breakCell, { width, height }, style]}>
        <Ionicons name={icon as any} size={12} color="#9CA3AF" />
        <ThemedText style={styles.breakLabel}>{label}</ThemedText>
      </View>
    );
  }

  if (data.type === 'study_hall') {
    return (
      <View style={[styles.base, styles.studyHallCell, { width, height }, style]}>
        <Ionicons name="book-outline" size={12} color="#6B7280" />
        <ThemedText style={styles.breakLabel}>Study</ThemedText>
      </View>
    );
  }

  if (data.type === 'free') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}
        style={[styles.base, styles.freeCell, { width, height }, data.isToday && styles.todayTint, style]}>
        {selected && <View style={styles.selectedOverlay} />}
      </TouchableOpacity>
    );
  }

  // ── Lesson cell ───────────────────────────────────────────

  const idx = data.subjectIndex ?? 0;
  let col = data.subjectColor ?? { bg: '#EFF6FF', text: '#1D4ED8' };
  if (colorBlindMode !== 'normal') {
    const cb = colorBlindBg(col.bg, col.text, colorBlindMode, idx);
    col = { bg: cb.bg, text: cb.fg };
  }

  const hasConflict = (data.conflictCount ?? 0) > 0;
  const hasOverride = !!data.override;
  const teacher = hasOverride && data.override?.teacherOrStream
    ? data.override.teacherOrStream
    : data.teacherOrStream ?? '';

  return (
    <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.8}
        style={[
          styles.base,
          styles.lessonCell,
          {
            width,
            height,
            backgroundColor: col.bg,
            borderColor: hasConflict
              ? '#EF4444'
              : data.isCurrent
                ? col.text
                : 'transparent',
            borderWidth: hasConflict || data.isCurrent ? 1.5 : 0,
          },
          data.isToday && !hasConflict && !data.isCurrent && styles.todayTint,
          selected && styles.selectedOverlay,
          // Double-period: left bracket accent
          data.isDoubleFirst && { borderLeftWidth: 3, borderLeftColor: col.text + 'BB' },
          data.isDoubleLast  && { borderLeftWidth: 3, borderLeftColor: col.text + '55' },
          style,
        ]}
      >
        {/* Subject name */}
        <ThemedText style={[styles.subject, { color: col.text }]} numberOfLines={2}>
          {data.subjectName ?? '—'}
        </ThemedText>

        {/* Teacher / stream */}
        {teacher ? (
          <ThemedText style={[styles.secondary, { color: col.text + 'BB' }]} numberOfLines={1}>
            {teacher.split(' ').slice(-1)[0]}
          </ThemedText>
        ) : null}

        {/* Room code */}
        {data.roomCode ? (
          <ThemedText style={[styles.room, { color: col.text + '88' }]} numberOfLines={1}>
            {data.roomCode}
          </ThemedText>
        ) : null}

        {/* Room type icon (bottom-right) */}
        {roomTypeIcon ? (
          <View style={styles.roomIcon}>
            <Ionicons name={roomTypeIcon as any} size={8} color={col.text + '88'} />
          </View>
        ) : null}

        {/* Override overlay */}
        {hasOverride && data.override && (
          <OverrideBadge type={data.override.type} label={data.override.label} />
        )}

        {/* Conflict badge */}
        {hasConflict && (
          <View style={styles.conflictBadgePos}>
            <ConflictBadge count={data.conflictCount} />
          </View>
        )}

        {/* Lock badge */}
        {data.isLocked && <LockBadge color={col.text + 'AA'} />}

        {/* Double-period indicator */}
        {data.isDouble && (
          <View style={[styles.doubleDot, { backgroundColor: col.text + '66' }]} />
        )}

        {/* Selected overlay */}
        {selected && <View style={[StyleSheet.absoluteFillObject, styles.selectTint]} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    justifyContent:  'center',
    alignItems:      'center',
    padding:          3,
    overflow:        'hidden',
    position:        'relative',
  },
  lessonCell: {
    borderRadius: 0,
  },
  emptyInner: {
    flex: 1, width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB55',
    borderStyle: 'dashed',
    borderRadius: 2,
  },
  breakCell: {
    backgroundColor: '#F9FAFB',
    gap: 2,
  },
  studyHallCell: {
    backgroundColor: '#F3F4F6',
    gap: 2,
  },
  freeCell: {
    backgroundColor: 'transparent',
  },
  breakLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  todayTint: {
    backgroundColor: '#3B82F608',
  },
  selectedOverlay: {
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  selectTint: {
    backgroundColor: '#3B82F622',
  },
  subject: {
    fontSize:   11,
    fontWeight: '700',
    textAlign:  'center',
  },
  secondary: {
    fontSize:  9,
    textAlign: 'center',
    marginTop: 2,
  },
  room: {
    fontSize:  8,
    textAlign: 'center',
    marginTop: 1,
  },
  roomIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  conflictBadgePos: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  doubleDot: {
    position:     'absolute',
    top:          '50%',
    right:         2,
    width:         3,
    height:        3,
    borderRadius:  2,
  },
});
