/**
 * Grading Scales — admin/school_super_admin
 * Configure label + min/max percentage per grade. DB trigger validates
 * full 0–100 coverage and no overlaps; surfaces server errors inline.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState,
  ModuleGate, ModuleDisabledScreen,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import {
  useGradingScales, useUpsertGradingScale, useDeleteGradingScale,
  type GradingScale,
} from '../../../hooks/useGrading';

// ── Coverage analyser ─────────────────────────────────────────
function analyseCoverage(scales: GradingScale[]): { ok: boolean; msg: string; segments: { from: number; to: number; covered: boolean }[] } {
  if (scales.length === 0) return { ok: false, msg: 'No grades defined', segments: [{ from: 0, to: 100, covered: false }] };
  const sorted = [...scales].sort((a, b) => a.min_percentage - b.min_percentage);
  // Overlap check
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_percentage <= sorted[i - 1].max_percentage) {
      return { ok: false, msg: `Overlap: ${sorted[i - 1].grade_label} (${sorted[i - 1].min_percentage}–${sorted[i - 1].max_percentage}) and ${sorted[i].grade_label} (${sorted[i].min_percentage}–${sorted[i].max_percentage})`, segments: rangesToSegments(sorted) };
    }
  }
  // Gap check
  let prev = -1;
  for (const s of sorted) {
    if (prev === -1 && s.min_percentage > 0) return { ok: false, msg: `Gap: 0–${s.min_percentage - 1}`, segments: rangesToSegments(sorted) };
    if (prev !== -1 && s.min_percentage > prev + 1) return { ok: false, msg: `Gap: ${prev + 1}–${s.min_percentage - 1}`, segments: rangesToSegments(sorted) };
    prev = s.max_percentage;
  }
  if (prev < 100) return { ok: false, msg: `Gap: ${prev + 1}–100`, segments: rangesToSegments(sorted) };
  return { ok: true, msg: 'Full 0–100 coverage', segments: rangesToSegments(sorted) };
}

function rangesToSegments(sorted: GradingScale[]): { from: number; to: number; covered: boolean }[] {
  const segs: { from: number; to: number; covered: boolean }[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.min_percentage > cursor) segs.push({ from: cursor, to: s.min_percentage - 1, covered: false });
    segs.push({ from: s.min_percentage, to: s.max_percentage, covered: true });
    cursor = s.max_percentage + 1;
  }
  if (cursor <= 100) segs.push({ from: cursor, to: 100, covered: false });
  return segs;
}

// ── Coverage bar ───────────────────────────────────────────────
function CoverageBar({ segments, colors }: { segments: { from: number; to: number; covered: boolean }[]; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.border }}>
      {segments.map((s, i) => (
        <View
          key={i}
          style={{
            flex: Math.max(s.to - s.from + 1, 1),
            backgroundColor: s.covered ? '#10b981' : '#ef4444',
          }}
        />
      ))}
    </View>
  );
}

// ── Edit modal ─────────────────────────────────────────────────
interface SheetState {
  id?: string;
  grade_label: string;
  min: string;
  max: string;
  description: string;
  order_index: number;
}

const EMPTY_SHEET: SheetState = { grade_label: '', min: '', max: '', description: '', order_index: 0 };

function EditSheet({
  visible, initial, schoolId, onClose,
}: { visible: boolean; initial: SheetState; schoolId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const [form, setForm] = useState<SheetState>(initial);
  const upsert = useUpsertGradingScale(schoolId);

  useEffect(() => { setForm(initial); }, [initial]);

  const save = useCallback(async () => {
    const min = parseInt(form.min, 10);
    const max = parseInt(form.max, 10);
    if (!form.grade_label.trim()) { Alert.alert('Label required'); return; }
    if (isNaN(min) || min < 0 || min > 100) { Alert.alert('Min must be 0–100'); return; }
    if (isNaN(max) || max < 0 || max > 100) { Alert.alert('Max must be 0–100'); return; }
    if (min > max) { Alert.alert('Min cannot exceed max'); return; }
    try {
      haptics.medium();
      await upsert.mutateAsync({
        id:             form.id,
        grade_label:    form.grade_label.trim(),
        min_percentage: min,
        max_percentage: max,
        description:    form.description.trim() || null,
        order_index:    form.order_index,
      });
      haptics.success();
      onClose();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Save failed', e?.message ?? 'Coverage validation rejected the change. Adjust ranges so 0–100 is fully covered without overlaps.');
    }
  }, [form, upsert, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={{ color: colors.textMuted, fontWeight: '500' }}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={{ fontSize: 16, fontWeight: '700' }}>{form.id ? 'Edit Grade' : 'Add Grade'}</ThemedText>
            <TouchableOpacity onPress={save} disabled={upsert.isPending}>
              <ThemedText style={{ color: colors.brand.primary, fontWeight: '700' }}>
                {upsert.isPending ? 'Saving…' : 'Save'}
              </ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
            <View>
              <ThemedText style={styles.label}>Label</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={form.grade_label}
                onChangeText={(v) => setForm((f) => ({ ...f, grade_label: v }))}
                placeholder="A*, A, Pass, 1, Distinction…"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>Min %</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                  value={form.min}
                  onChangeText={(v) => setForm((f) => ({ ...f, min: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>Max %</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                  value={form.max}
                  onChangeText={(v) => setForm((f) => ({ ...f, max: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
            <View>
              <ThemedText style={styles.label}>Description (optional)</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Outstanding / Excellent / …"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function GradingScalesContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: scales = [], isLoading, isError, refetch } = useGradingScales(schoolId);
  const del = useDeleteGradingScale(schoolId);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editState, setEditState] = useState<SheetState>(EMPTY_SHEET);

  const coverage = useMemo(() => analyseCoverage(scales), [scales]);

  const openAdd = useCallback(() => {
    setEditState({ ...EMPTY_SHEET, order_index: scales.length });
    setSheetVisible(true);
  }, [scales.length]);

  const openEdit = useCallback((s: GradingScale) => {
    setEditState({
      id:           s.id,
      grade_label:  s.grade_label,
      min:          String(s.min_percentage),
      max:          String(s.max_percentage),
      description:  s.description ?? '',
      order_index:  s.order_index,
    });
    setSheetVisible(true);
  }, []);

  const handleDelete = useCallback((s: GradingScale) => {
    Alert.alert(
      `Delete "${s.grade_label}"?`,
      'Removing this grade may leave a gap in coverage; reports for percentages in this range will show no grade.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try { haptics.medium(); await del.mutateAsync(s.id); haptics.success(); }
            catch (e: any) { haptics.error(); Alert.alert('Error', e?.message ?? 'Could not delete.'); }
          },
        },
      ],
    );
  }, [del]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Grading Scales" showBack />
        <ErrorState title="Could not load" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Grading Scales" showBack />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        {/* Coverage */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <ThemedText style={{ fontSize: 13, fontWeight: '600' }}>Coverage 0–100</ThemedText>
            <ThemedText style={{ fontSize: 13, fontWeight: '700', color: coverage.ok ? '#10b981' : '#ef4444' }}>
              {coverage.ok ? 'OK' : 'Issue'}
            </ThemedText>
          </View>
          {!isLoading && <CoverageBar segments={coverage.segments} colors={colors} />}
          <ThemedText style={{ fontSize: 11, color: coverage.ok ? colors.textMuted : '#ef4444', marginTop: 6 }}>
            {coverage.msg}
          </ThemedText>
        </View>

        <TouchableOpacity onPress={openAdd} style={[styles.addBtn, { backgroundColor: colors.brand.primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Add Grade</ThemedText>
        </TouchableOpacity>

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={56} radius={Radius.lg} />)
        ) : scales.length === 0 ? (
          <EmptyState title="No grades configured" description="Add grades so reports show A/B/C/…" />
        ) : (
          scales.map((s) => (
            <View key={s.id} style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.pill, { backgroundColor: colors.brand.primarySoft }]}>
                  <ThemedText style={{ fontSize: 14, fontWeight: '800', color: colors.brand.primary }}>{s.grade_label}</ThemedText>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>{s.min_percentage}–{s.max_percentage}%</ThemedText>
                  {s.description ? <ThemedText style={{ fontSize: 12, color: colors.textMuted }}>{s.description}</ThemedText> : null}
                </View>
                <TouchableOpacity onPress={() => { haptics.light(); openEdit(s); }} style={styles.iconBtn}>
                  <Ionicons name="pencil-outline" size={18} color={colors.brand.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { haptics.light(); handleDelete(s); }} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <EditSheet visible={sheetVisible} initial={editState} schoolId={schoolId} onClose={() => setSheetVisible(false)} />
    </SafeAreaView>
  );
}

export default function GradingScalesScreen() {
  return (
    <ModuleGate module="exams" fallback={<ModuleDisabledScreen module="exams" />}>
      <GradingScalesContent />
    </ModuleGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { borderRadius: Radius.lg, padding: Spacing.base },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing.md, borderRadius: Radius.full },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, fontSize: 15,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, minWidth: 40, alignItems: 'center' },
  iconBtn: { padding: 6 },
});
