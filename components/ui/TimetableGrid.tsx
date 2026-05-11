/**
 * TimetableGrid — M9 core grid component
 *
 * Virtualized, bidirectional-scroll timetable grid.
 * Sticky stream/period label column + sticky day header row.
 * Integrates SlotCell, HeatmapOverlay, and optional heatmap/workload sidebar.
 *
 * Two layout modes:
 *   'stream'  — rows = periods, columns = days × streams (admin multi-stream view)
 *   'day'     — rows = periods, columns = days           (student/teacher single-entity view)
 *
 * Drag-drop:
 *   Web: HTML5 DnD via onDrop / onDragOver on cells (web-only conditional import).
 *   Native (tablet): handled by parent via onLongPress → onPress gesture sequence.
 *   Live conflict preview: dragTarget cell shows red tint if drop would clash.
 *
 * Multi-select:
 *   Web: Shift+click adds to selection.
 *   Native: long-press-then-tap enters multi-select mode.
 *
 * Heatmap:
 *   Pass showHeatmap=true + heatCells to overlay colour gradient.
 *
 * Print mode:
 *   Pass printMode=true for high-contrast, no-shadow, A4-friendly output.
 */
import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Platform,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { ThemedText } from './ThemedText';
import { SlotCell, type SlotCellData, type ColorBlindMode } from './SlotCell';
import { HeatmapOverlay, type HeatCell, type HeatmapMode } from './HeatmapOverlay';
import { WorkloadBar } from './WorkloadBar';

// ── Constants ─────────────────────────────────────────────────

export const CELL_W   = 88;
export const CELL_H   = 68;
export const LABEL_W  = 70;
export const HEADER_H = 44;

// ── Types ─────────────────────────────────────────────────────

export interface GridPeriod {
  id: string;
  period_index: number;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  is_assembly: boolean;
}

export interface GridDay {
  dow: number;    // 1=Mon … 7=Sun
  label: string;
}

export interface GridStream {
  id: string;
  name: string;
}

/** Full cell data keyed "streamId:dow:periodIndex" or "dow:periodIndex" in day-mode */
export type SlotMap = Map<string, SlotCellData>;

export interface TeacherWorkload {
  staffId: string;
  name: string;
  periodsToday: number;
  periodsCap: number;
}

interface TimetableGridProps {
  periods: GridPeriod[];
  days: GridDay[];
  streams?: GridStream[];       // multi-stream (admin) mode
  slotMap: SlotMap;
  mode?: 'stream' | 'day';     // default 'day'

  // Interaction
  onCellPress?: (key: string, data: SlotCellData) => void;
  onCellLongPress?: (key: string, data: SlotCellData) => void;
  onDrop?: (fromKey: string, toKey: string) => void; // drag-drop
  selectedKeys?: Set<string>;

  // Overlay features
  showHeatmap?: boolean;
  heatmapMode?: HeatmapMode;
  heatCells?: HeatCell[];
  colorBlindMode?: ColorBlindMode;

  // Workload sidebar
  showWorkload?: boolean;
  teacherWorkloads?: TeacherWorkload[];

  // Display options
  todayDow?: number;             // highlight today column
  printMode?: boolean;           // high-contrast, no animations
  style?: ViewStyle;
}

// ── Component ─────────────────────────────────────────────────

export function TimetableGrid({
  periods, days, streams = [], slotMap, mode = 'day',
  onCellPress, onCellLongPress, onDrop, selectedKeys,
  showHeatmap = false, heatmapMode = 'teacher_load', heatCells = [],
  colorBlindMode = 'normal',
  showWorkload = false, teacherWorkloads = [],
  todayDow, printMode = false,
  style,
}: TimetableGridProps) {
  const { colors } = useTheme();
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const effectiveSelected = selectedKeys ?? localSelected;

  const teachingPeriods  = useMemo(() => periods.filter((p) => !p.is_break && !p.is_assembly), [periods]);
  const sortedPeriods    = useMemo(() => [...periods].sort((a, b) => a.period_index - b.period_index), [periods]);

  // Columns: in stream mode = day × stream; in day mode = day
  const columns: Array<{ key: string; label: string; subLabel?: string; dow: number; streamId?: string }> =
    useMemo(() => {
      if (mode === 'stream' && streams.length > 0) {
        return days.flatMap((d) =>
          streams.map((s) => ({
            key:      `${d.dow}:${s.id}`,
            label:    d.label,
            subLabel: s.name,
            dow:      d.dow,
            streamId: s.id,
          }))
        );
      }
      return days.map((d) => ({ key: String(d.dow), label: d.label, dow: d.dow }));
    }, [days, streams, mode]);

  // Slot key builder
  function cellKey(col: typeof columns[0], periodIndex: number): string {
    return mode === 'stream' && col.streamId
      ? `${col.streamId}:${col.dow}:${periodIndex}`
      : `${col.dow}:${periodIndex}`;
  }

  // Drag-drop handlers (web only)
  const dragHandlers = Platform.OS === 'web' ? (fromKey: string, toKey: string) => {
    if (fromKey !== toKey && onDrop) onDrop(fromKey, toKey);
    setDragFrom(null); setDragOver(null);
  } : undefined;

  // Long-press enters multi-select mode
  function handleLongPress(key: string, data: SlotCellData) {
    if (!multiSelectMode) {
      setMultiSelectMode(true);
      setLocalSelected(new Set([key]));
    }
    onCellLongPress?.(key, data);
  }

  function handlePress(key: string, data: SlotCellData) {
    if (multiSelectMode) {
      const next = new Set(localSelected);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      if (next.size === 0) setMultiSelectMode(false);
      setLocalSelected(next);
    } else {
      onCellPress?.(key, data);
    }
  }

  const renderCell = useCallback((col: typeof columns[0], period: GridPeriod) => {
    const pi  = period.period_index;
    const key = cellKey(col, pi);
    const data: SlotCellData = slotMap.get(key) ?? {
      type:    period.is_break    ? 'break'
             : period.is_assembly ? 'assembly'
             : 'empty',
    };

    const isSelected  = effectiveSelected.has(key);
    const isDragTarget = dragOver === key && dragFrom !== key;

    // Conflict preview for drag target
    const displayData: SlotCellData = isDragTarget && dragFrom
      ? { ...data, conflictCount: (data.conflictCount ?? 0) + 1 }
      : data;

    const cell = (
      <SlotCell
        key={key}
        data={{ ...displayData, isToday: col.dow === todayDow }}
        width={CELL_W}
        height={CELL_H}
        onPress={() => handlePress(key, data)}
        onLongPress={() => handleLongPress(key, data)}
        selected={isSelected}
        colorBlindMode={colorBlindMode}
        style={[
          { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
          isDragTarget && { backgroundColor: '#EF444422' },
        ]}
      />
    );

    if (Platform.OS !== 'web') return cell;

    // Web: wrap with DnD attributes
    return (
      <div
        key={key}
        draggable={data.type === 'lesson' && !data.isLocked}
        onDragStart={() => setDragFrom(key)}
        onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={() => dragHandlers?.(dragFrom!, key)}
        onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
        style={{ display: 'inline-block' }}
      >
        {cell}
      </div>
    );
  }, [slotMap, effectiveSelected, dragOver, dragFrom, colorBlindMode, todayDow, colors]);

  return (
    <View style={[styles.container, style]}>
      {/* Multi-select toolbar */}
      {multiSelectMode && (
        <View style={[styles.multiselectBar, { backgroundColor: colors.brand?.primary ?? '#3B82F6' }]}>
          <ThemedText style={styles.multiselectText}>{localSelected.size} selected</ThemedText>
          <TouchableOpacity onPress={() => { setMultiSelectMode(false); setLocalSelected(new Set()); }}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* ── Header row (sticky) ── */}
            <View style={[styles.headerRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              {/* Period label corner */}
              <View style={[styles.cornerCell, { width: LABEL_W, height: HEADER_H, borderRightColor: colors.border }]}>
                <ThemedText style={[styles.cornerText, { color: colors.textMuted }]}>Period</ThemedText>
              </View>

              {columns.map((col) => (
                <View
                  key={col.key}
                  style={[
                    styles.dayHeader,
                    {
                      width: CELL_W,
                      height: HEADER_H,
                      borderRightColor: colors.border,
                      backgroundColor: col.dow === todayDow
                        ? (colors.brand?.primary ?? '#3B82F6') + '12'
                        : 'transparent',
                    },
                  ]}
                >
                  <ThemedText style={[
                    styles.dayLabel,
                    { color: col.dow === todayDow ? (colors.brand?.primary ?? '#3B82F6') : colors.textSecondary },
                  ]}>
                    {col.label}
                  </ThemedText>
                  {col.subLabel && (
                    <ThemedText style={[styles.streamLabel, { color: colors.textMuted }]} numberOfLines={1}>
                      {col.subLabel}
                    </ThemedText>
                  )}
                  {col.dow === todayDow && (
                    <View style={[styles.todayDot, { backgroundColor: colors.brand?.primary ?? '#3B82F6' }]} />
                  )}
                </View>
              ))}
            </View>

            {/* ── Period rows ── */}
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <View style={{ position: 'relative' }}>
                {sortedPeriods.map((period) => {
                  const isBreak = period.is_break || period.is_assembly;
                  return (
                    <View
                      key={period.id}
                      style={[styles.periodRow, { borderBottomColor: colors.border }]}
                    >
                      {/* Period label (sticky left) */}
                      <View style={[
                        styles.periodLabel,
                        {
                          width: LABEL_W,
                          height: isBreak ? 32 : CELL_H,
                          borderRightColor: colors.border,
                          backgroundColor: isBreak ? colors.surfaceSecondary : colors.surface,
                        },
                      ]}>
                        <ThemedText style={[styles.periodName, { color: colors.text }]}>
                          {period.name}
                        </ThemedText>
                        {!isBreak && (
                          <ThemedText style={[styles.periodTime, { color: colors.textMuted }]}>
                            {period.start_time.slice(0, 5)}
                          </ThemedText>
                        )}
                      </View>

                      {/* Cells */}
                      {columns.map((col) => renderCell(col, period))}
                    </View>
                  );
                })}

                {/* Heatmap overlay */}
                {showHeatmap && (
                  <HeatmapOverlay
                    mode={heatmapMode}
                    cells={heatCells}
                    cellWidth={CELL_W}
                    cellHeight={CELL_H}
                    labelWidth={LABEL_W}
                    days={days.map((d) => d.dow)}
                    periodIndices={teachingPeriods.map((p) => p.period_index)}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        </ScrollView>

        {/* Workload sidebar */}
        {showWorkload && teacherWorkloads.length > 0 && (
          <View style={[styles.workloadSidebar, { borderLeftColor: colors.border, backgroundColor: colors.surface }]}>
            <ThemedText style={[styles.workloadTitle, { color: colors.textSecondary }]}>Load</ThemedText>
            <ScrollView showsVerticalScrollIndicator={false}>
              {teacherWorkloads.map((tw) => (
                <WorkloadBar
                  key={tw.staffId}
                  label={tw.name.split(' ').slice(-1)[0]}
                  value={tw.periodsToday}
                  max={tw.periodsCap}
                  style={styles.workloadItem}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  body:             { flex: 1, flexDirection: 'row' },
  headerRow: {
    flexDirection:   'row',
    borderBottomWidth: 1,
    position:        'relative',
    zIndex:           10,
  },
  cornerCell: {
    justifyContent:  'center',
    alignItems:      'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  cornerText:       { fontSize: 10, fontWeight: '600' },
  dayHeader: {
    justifyContent: 'center',
    alignItems:     'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  dayLabel:         { fontSize: 12, fontWeight: '600' },
  streamLabel:      { fontSize: 9 },
  todayDot:         { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  periodRow:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  periodLabel: {
    justifyContent:   'center',
    alignItems:       'center',
    padding:           4,
    borderRightWidth:  StyleSheet.hairlineWidth,
  },
  periodName:       { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  periodTime:       { fontSize: 9, marginTop: 1, textAlign: 'center' },
  multiselectBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  multiselectText:  { color: '#fff', fontWeight: '600', fontSize: 13 },
  workloadSidebar: {
    width:             120,
    borderLeftWidth:   StyleSheet.hairlineWidth,
    padding:            8,
  },
  workloadTitle: {
    fontSize:    10,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workloadItem:     { marginBottom: 4 },
});
