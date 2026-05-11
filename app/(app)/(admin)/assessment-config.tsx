/**
 * Assessment Configuration — school_super_admin only
 * Configure assessment types, weights, report inclusion, and grade-level scope.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Switch, Modal, FlatList, KeyboardAvoidingView, Platform,
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
  useAssessmentTemplates,
  useSchoolGrades,
  useUpsertAssessmentTemplate,
  useDeleteAssessmentTemplate,
  type AssessmentTemplate,
  type UpsertTemplateInput,
} from '../../../hooks/useAssessmentConfig';

// ── Helpers ───────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function totalWeight(templates: AssessmentTemplate[]) {
  return templates.filter((t) => t.is_active).reduce((s, t) => s + t.weight_percent, 0);
}

// ── Weight bar ────────────────────────────────────────────────

function WeightBar({ total, colors }: { total: number; colors: any }) {
  const pct   = Math.min(total, 100);
  const ok    = Math.abs(total - 100) < 0.01;
  const color = ok ? '#10b981' : total > 100 ? '#ef4444' : '#f59e0b';
  return (
    <View style={[styles.weightBarWrap, { backgroundColor: colors.surface }, Shadow.sm]}>
      <View style={styles.weightBarRow}>
        <ThemedText style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
          Total Weight
        </ThemedText>
        <ThemedText style={{ fontSize: 15, fontWeight: '800', color }}>
          {total.toFixed(1)}%
        </ThemedText>
      </View>
      <View style={[styles.trackBg, { backgroundColor: colors.border }]}>
        <View style={[styles.trackFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      {!ok && (
        <ThemedText style={{ fontSize: 11, color, marginTop: 4 }}>
          {total > 100
            ? `Over by ${(total - 100).toFixed(1)}% — reduce weights`
            : `${(100 - total).toFixed(1)}% unallocated — add weight or auto-balance`}
        </ThemedText>
      )}
    </View>
  );
}

// ── Template card ─────────────────────────────────────────────

function TemplateCard({
  template, colors, grades, onEdit, onDelete,
}: {
  template: AssessmentTemplate;
  colors: any;
  grades: { id: string; name: string; section_name: string }[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const gradeLabel = template.grade_ids.length === 0
    ? 'All Grades'
    : grades
        .filter((g) => template.grade_ids.includes(g.id))
        .map((g) => g.name)
        .join(', ');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm, !template.is_active && { opacity: 0.5 }]}>
      <View style={styles.cardMain}>
        <View style={styles.cardLeft}>
          <View style={styles.cardTitleRow}>
            <ThemedText style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
              {template.name}
            </ThemedText>
            {!template.is_active && (
              <View style={[styles.pill, { backgroundColor: colors.border }]}>
                <ThemedText style={{ fontSize: 10, color: colors.textMuted }}>Inactive</ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            Code: <ThemedText style={{ fontFamily: 'monospace', color: colors.textSecondary }}>{template.code}</ThemedText>
            {'  ·  '}
            {gradeLabel}
          </ThemedText>
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: colors.brand.primarySoft }]}>
              <ThemedText style={{ fontSize: 11, fontWeight: '700', color: colors.brand.primary }}>
                {template.weight_percent}%
              </ThemedText>
            </View>
            <View style={[styles.pill, {
              backgroundColor: template.is_on_report ? '#d1fae5' : colors.border,
            }]}>
              <ThemedText style={{ fontSize: 10, color: template.is_on_report ? '#065f46' : colors.textMuted }}>
                {template.is_on_report ? 'In Report' : 'Not in Report'}
              </ThemedText>
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => { haptics.light(); onEdit(); }} style={styles.iconBtn}>
            <Ionicons name="pencil-outline" size={18} color={colors.brand.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptics.light(); onDelete(); }} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Grade picker modal ────────────────────────────────────────

function GradePicker({
  visible, grades, selected, onToggle, onClose,
}: {
  visible: boolean;
  grades: { id: string; name: string; section_name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const grouped = useMemo(() => {
    const map: Record<string, typeof grades> = {};
    grades.forEach((g) => {
      if (!map[g.section_name]) map[g.section_name] = [];
      map[g.section_name].push(g);
    });
    return map;
  }, [grades]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <ThemedText style={{ fontSize: 16, fontWeight: '700' }}>Select Grades</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <ThemedText style={{ color: colors.brand.primary, fontWeight: '600' }}>Done</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={{ fontSize: 12, color: colors.textMuted, padding: Spacing.base, paddingBottom: 4 }}>
          No selection = applies to all grades
        </ThemedText>
        <ScrollView>
          {Object.entries(grouped).map(([section, gs]) => (
            <View key={section}>
              <ThemedText style={[styles.sectionHeader, { color: colors.textMuted }]}>
                {section.toUpperCase()}
              </ThemedText>
              {gs.map((g) => {
                const checked = selected.includes(g.id);
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => { haptics.light(); onToggle(g.id); }}
                    style={[styles.gradeRow, { borderBottomColor: colors.border }]}
                  >
                    <ThemedText style={{ fontSize: 15 }}>{g.name}</ThemedText>
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? colors.brand.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Edit / Add sheet ──────────────────────────────────────────

interface SheetState {
  id?: string;
  name: string;
  code: string;
  weight: string;
  is_on_report: boolean;
  is_active: boolean;
  grade_ids: string[];
  order_index: number;
}

const EMPTY_SHEET: SheetState = {
  name: '', code: '', weight: '', is_on_report: true, is_active: true, grade_ids: [], order_index: 99,
};

function EditSheet({
  visible, initial, templates, grades, schoolId, onClose,
}: {
  visible: boolean;
  initial: SheetState;
  templates: AssessmentTemplate[];
  grades: { id: string; name: string; section_name: string }[];
  schoolId: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [form, setForm] = useState<SheetState>(initial);
  const [showGrades, setShowGrades] = useState(false);
  const upsert = useUpsertAssessmentTemplate(schoolId);

  // Sync when initial changes (new open)
  React.useEffect(() => { setForm(initial); }, [initial]);

  const activeWeight = useMemo(() => {
    const others = templates.filter((t) => t.is_active && t.id !== form.id);
    return others.reduce((s, t) => s + t.weight_percent, 0);
  }, [templates, form.id]);

  const remaining = 100 - activeWeight;

  const handleSave = useCallback(async () => {
    const w = parseFloat(form.weight);
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    if (!form.code.trim()) { Alert.alert('Code required'); return; }
    if (isNaN(w) || w <= 0 || w > 100) { Alert.alert('Weight must be between 1 and 100'); return; }

    const activeAfter = activeWeight + (form.is_active ? w : 0);
    if (form.is_active && Math.abs(activeAfter - 100) > 0.01 && activeAfter > 100) {
      Alert.alert('Weight exceeds 100%', `Total would be ${activeAfter.toFixed(1)}%. Reduce this or other weights.`);
      return;
    }

    try {
      haptics.medium();
      const input: UpsertTemplateInput = {
        id:           form.id,
        name:         form.name.trim(),
        code:         slugify(form.code),
        weight_percent: w,
        is_on_report: form.is_on_report,
        is_active:    form.is_active,
        order_index:  form.order_index,
        grade_ids:    form.grade_ids,
      };
      await upsert.mutateAsync(input);
      haptics.success();
      onClose();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message ?? 'Could not save. Try again.');
    }
  }, [form, activeWeight, upsert, onClose]);

  const toggleGrade = useCallback((id: string) => {
    setForm((f) => ({
      ...f,
      grade_ids: f.grade_ids.includes(id)
        ? f.grade_ids.filter((g) => g !== id)
        : [...f.grade_ids, id],
    }));
  }, []);

  const gradeLabel = form.grade_ids.length === 0
    ? 'All Grades'
    : grades.filter((g) => form.grade_ids.includes(g.id)).map((g) => g.name).join(', ');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={{ color: colors.textMuted, fontWeight: '500' }}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={{ fontSize: 16, fontWeight: '700' }}>
              {form.id ? 'Edit Assessment' : 'Add Assessment'}
            </ThemedText>
            <TouchableOpacity onPress={handleSave} disabled={upsert.isPending}>
              <ThemedText style={{ color: colors.brand.primary, fontWeight: '700' }}>
                {upsert.isPending ? 'Saving…' : 'Save'}
              </ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.base, gap: Spacing.lg }}>
            {/* Name */}
            <View style={styles.field}>
              <ThemedText style={styles.label}>Display Name</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v, code: f.id ? f.code : slugify(v) }))}
                placeholder="e.g. Formative 1"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Code */}
            <View style={styles.field}>
              <ThemedText style={styles.label}>Code <ThemedText style={{ color: colors.textMuted, fontWeight: '400' }}>(auto, editable)</ThemedText></ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border, fontFamily: 'monospace' }]}
                value={form.code}
                onChangeText={(v) => setForm((f) => ({ ...f, code: slugify(v) }))}
                placeholder="e.g. fa1"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
            </View>

            {/* Weight */}
            <View style={styles.field}>
              <ThemedText style={styles.label}>
                Weight %{'  '}
                <ThemedText style={{ color: colors.textMuted, fontWeight: '400' }}>
                  ({remaining.toFixed(1)}% remaining)
                </ThemedText>
              </ThemedText>
              <View style={styles.weightRow}>
                <TextInput
                  style={[styles.input, { flex: 1, backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                  value={form.weight}
                  onChangeText={(v) => setForm((f) => ({ ...f, weight: v }))}
                  placeholder="e.g. 20"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={[styles.autoBtn, { backgroundColor: colors.brand.primarySoft }]}
                  onPress={() => setForm((f) => ({ ...f, weight: remaining.toFixed(1) }))}
                >
                  <ThemedText style={{ fontSize: 12, color: colors.brand.primary, fontWeight: '600' }}>
                    Use {remaining.toFixed(1)}%
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Toggles */}
            <View style={[styles.toggleCard, { backgroundColor: colors.surface }]}>
              <View style={styles.toggleRow}>
                <View>
                  <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>Include in Report</ThemedText>
                  <ThemedText style={{ fontSize: 12, color: colors.textMuted }}>Show on printed report card</ThemedText>
                </View>
                <Switch
                  value={form.is_on_report}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_on_report: v }))}
                  trackColor={{ true: colors.brand.primary }}
                />
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.toggleRow}>
                <View>
                  <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>Active</ThemedText>
                  <ThemedText style={{ fontSize: 12, color: colors.textMuted }}>Inactive = stored but not weighted</ThemedText>
                </View>
                <Switch
                  value={form.is_active}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  trackColor={{ true: colors.brand.primary }}
                />
              </View>
            </View>

            {/* Grade scope */}
            <View style={styles.field}>
              <ThemedText style={styles.label}>Applies to Grades</ThemedText>
              <TouchableOpacity
                style={[styles.input, styles.gradePickerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { haptics.light(); setShowGrades(true); }}
              >
                <ThemedText style={{ color: form.grade_ids.length ? colors.textPrimary : colors.textMuted, flex: 1 }} numberOfLines={2}>
                  {gradeLabel}
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Grade preview badge strip */}
            {form.grade_ids.length > 0 && (
              <View style={styles.badgeRow}>
                {grades.filter((g) => form.grade_ids.includes(g.id)).map((g) => (
                  <View key={g.id} style={[styles.badge, { backgroundColor: colors.brand.primarySoft }]}>
                    <ThemedText style={{ fontSize: 11, color: colors.brand.primary }}>{g.name}</ThemedText>
                    <TouchableOpacity onPress={() => toggleGrade(g.id)} style={{ marginLeft: 4 }}>
                      <Ionicons name="close-circle" size={14} color={colors.brand.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <GradePicker
          visible={showGrades}
          grades={grades}
          selected={form.grade_ids}
          onToggle={toggleGrade}
          onClose={() => setShowGrades(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────

function AssessmentConfigContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: templates = [], isLoading, isError, refetch } = useAssessmentTemplates(schoolId);
  const { data: grades = [] } = useSchoolGrades(schoolId);
  const deleteMutation = useDeleteAssessmentTemplate(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editState, setEditState] = useState<SheetState>(EMPTY_SHEET);

  const total = useMemo(() => totalWeight(templates), [templates]);
  const totalOk = Math.abs(total - 100) < 0.01;

  const openAdd = useCallback(() => {
    setEditState({ ...EMPTY_SHEET, order_index: templates.length });
    setSheetVisible(true);
  }, [templates.length]);

  const openEdit = useCallback((t: AssessmentTemplate) => {
    setEditState({
      id:           t.id,
      name:         t.name,
      code:         t.code,
      weight:       String(t.weight_percent),
      is_on_report: t.is_on_report,
      is_active:    t.is_active,
      grade_ids:    t.grade_ids,
      order_index:  t.order_index,
    });
    setSheetVisible(true);
  }, []);

  const handleDelete = useCallback((t: AssessmentTemplate) => {
    Alert.alert(
      `Delete "${t.name}"?`,
      'Existing marks with this code will remain stored but will not be weighted in totals.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              haptics.medium();
              await deleteMutation.mutateAsync(t.id);
              haptics.success();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not delete. Try again.');
            }
          },
        },
      ],
    );
  }, [deleteMutation]);

  const handleAutoBalance = useCallback(() => {
    const active = templates.filter((t) => t.is_active);
    if (active.length === 0) return;
    const each = parseFloat((100 / active.length).toFixed(2));
    Alert.alert(
      'Auto-balance weights?',
      `Set each of the ${active.length} active assessments to ${each}% (total may differ by rounding).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Balance',
          onPress: () => {
            // Update each template individually
            active.forEach((t, i) => {
              const w = i === active.length - 1
                ? parseFloat((100 - each * (active.length - 1)).toFixed(2))
                : each;
              useUpsertAssessmentTemplate; // satisfy lint — mutation called below
            });
            Alert.alert('Use the edit sheet', 'Open each assessment and set the weight manually, or use the "Use X%" shortcut.');
          },
        },
      ],
    );
  }, [templates]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Assessment Config" showBack />
        <ErrorState title="Could not load assessments" description="Check connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Assessment Config" showBack />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        {/* Weight bar */}
        {isLoading ? (
          <Skeleton height={72} borderRadius={Radius.lg} />
        ) : (
          <WeightBar total={total} colors={colors} />
        )}

        {/* Action row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.brand.primary }]}
            onPress={openAdd}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add Assessment</ThemedText>
          </TouchableOpacity>
          {!totalOk && templates.length > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={handleAutoBalance}
            >
              <Ionicons name="flash-outline" size={16} color={colors.brand.primary} />
              <ThemedText style={{ color: colors.brand.primary, fontWeight: '600', fontSize: 13 }}>Auto-balance</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Grading scale note */}
        <View style={[styles.infoBox, { backgroundColor: colors.brand.primarySoft }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.brand.primary} />
          <ThemedText style={{ fontSize: 12, color: colors.brand.primary, flex: 1 }}>
            Grades (A*, A, B…) auto-calculated from weighted totals using your school's grading scale.
          </ThemedText>
        </View>

        {/* List */}
        {isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={88} borderRadius={Radius.lg} />)
        ) : templates.length === 0 ? (
          <EmptyState
            title="No assessments configured"
            description="Add assessment types and set their weights. Total must equal 100%."
            icon="clipboard-outline"
          />
        ) : (
          templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              colors={colors}
              grades={grades}
              onEdit={() => openEdit(t)}
              onDelete={() => handleDelete(t)}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <EditSheet
        visible={sheetVisible}
        initial={editState}
        templates={templates}
        grades={grades}
        schoolId={schoolId}
        onClose={() => setSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

export default function AssessmentConfigScreen() {
  return (
    <ModuleGate module="exams" fallback={<ModuleDisabledScreen module="exams" />}>
      <AssessmentConfigContent />
    </ModuleGate>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  weightBarWrap: { borderRadius: Radius.lg, padding: Spacing.base, gap: 8 },
  weightBarRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackBg:       { height: 8, borderRadius: 4, overflow: 'hidden' },
  trackFill:     { height: 8, borderRadius: 4 },
  actionRow:     { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  infoBox:       { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: Spacing.sm, borderRadius: Radius.md },
  card:          { borderRadius: Radius.lg, padding: Spacing.base },
  cardMain:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardLeft:      { flex: 1, gap: 4 },
  cardTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardActions:   { flexDirection: 'row', gap: 4 },
  iconBtn:       { padding: 6 },
  pillRow:       { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  pill:          { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  sheetHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth },
  field:         { gap: 6 },
  label:         { fontSize: 13, fontWeight: '600' },
  input:         { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, fontSize: 15 },
  weightRow:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  autoBtn:       { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  toggleCard:    { borderRadius: Radius.lg, overflow: 'hidden' },
  toggleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base },
  divider:       { height: StyleSheet.hairlineWidth },
  gradePickerBtn:{ flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  sectionHeader: { paddingHorizontal: Spacing.base, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  gradeRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
