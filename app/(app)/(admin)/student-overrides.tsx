/**
 * Per-Student Assessment Overrides
 * Use for mid-semester joiners, exemptions, or any case where a student's
 * weighting differs from the stream default.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, ErrorState, Avatar, AcademicPeriodPicker, FastList,
  ModuleGate, ModuleDisabledScreen,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';
import { useAllStudents, type Student } from '../../../hooks/useStudents';
import {
  useAssessmentTemplates, useStudentAssessmentOverrides, useUpsertStudentOverride,
} from '../../../hooks/useAssessmentConfig';

function StudentOverridesContent() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const { data: students = [], isLoading: studentsLoading } = useAllStudents(schoolId, { activeOnly: true });
  const { data: templates = [], isLoading: tplLoading } = useAssessmentTemplates(schoolId);
  const { data: overrides = [], refetch } = useStudentAssessmentOverrides(
    selectedStudent?.id ?? null,
    selectedSemesterId,
  );
  const upsert = useUpsertStudentOverride(schoolId);

  const overrideMap = useMemo(() => {
    const m: Record<string, { weight_override: number | null; is_exempt: boolean; reason: string | null }> = {};
    overrides.forEach((o) => {
      m[o.assessment_template_id] = {
        weight_override: o.weight_override,
        is_exempt:       o.is_exempt,
        reason:          o.reason,
      };
    });
    return m;
  }, [overrides]);

  const [local, setLocal] = useState<Record<string, string>>({});

  const persist = useCallback(async (templateId: string, patch: { weight_override?: number | null; is_exempt?: boolean; reason?: string | null }) => {
    if (!selectedStudent || !selectedSemesterId) return;
    const cur = overrideMap[templateId] ?? { weight_override: null, is_exempt: false, reason: null };
    try {
      await upsert.mutateAsync({
        student_id:             selectedStudent.id,
        semester_id:            selectedSemesterId,
        assessment_template_id: templateId,
        weight_override:        patch.weight_override !== undefined ? patch.weight_override : cur.weight_override,
        is_exempt:              patch.is_exempt     !== undefined ? patch.is_exempt     : cur.is_exempt,
        reason:                 patch.reason        !== undefined ? patch.reason        : cur.reason,
        staff_id:               user!.staffId!,
      });
      haptics.light();
      refetch();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    }
  }, [selectedStudent, selectedSemesterId, overrideMap, upsert, user, refetch]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Student Overrides" showBack />

      <AcademicPeriodPicker schoolId={schoolId} semesterId={selectedSemesterId} onChangeSemester={setSelectedSemesterId} />

      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm }}>
        <TouchableOpacity
          onPress={() => { haptics.light(); setPickerVisible(true); }}
          style={[styles.studentPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {selectedStudent ? (
            <>
              <Avatar name={selectedStudent.full_name} photoUrl={selectedStudent.photo_url} size={40} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>{selectedStudent.full_name}</ThemedText>
                <ThemedText style={{ fontSize: 11, color: colors.textMuted }}>
                  {selectedStudent.student_number} · {selectedStudent.grade_name} · {selectedStudent.stream_name}
                </ThemedText>
              </View>
            </>
          ) : (
            <>
              <Ionicons name="person-circle-outline" size={28} color={colors.textMuted} />
              <ThemedText style={{ flex: 1, marginLeft: 10, color: colors.textMuted }}>
                Tap to pick a student…
              </ThemedText>
            </>
          )}
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm }}>
        {!selectedStudent || !selectedSemesterId ? (
          <EmptyState
            title="Pick student + semester"
            description="Choose a student and active semester to view per-assessment overrides."
            icon="options-outline"
          />
        ) : tplLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={96} radius={Radius.lg} />)
        ) : templates.length === 0 ? (
          <EmptyState title="No assessments" description="Configure assessments first." />
        ) : (
          templates.map((t) => {
            const cur = overrideMap[t.id];
            const weightStr = local[t.id] !== undefined
              ? local[t.id]
              : (cur?.weight_override !== null && cur?.weight_override !== undefined) ? String(cur.weight_override) : '';
            return (
              <View key={t.id} style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700' }}>{t.name}</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: colors.textMuted }}>
                      Default weight: {t.weight_percent}% · Out of {t.max_marks}
                    </ThemedText>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Weight override (%)</ThemedText>
                    <TextInput
                      value={weightStr}
                      onChangeText={(v) => setLocal((p) => ({ ...p, [t.id]: v.replace(/[^0-9.]/g, '') }))}
                      onBlur={() => {
                        const raw = local[t.id];
                        if (raw === undefined) return;
                        if (raw.trim() === '') {
                          persist(t.id, { weight_override: null });
                          setLocal((p) => { const c = { ...p }; delete c[t.id]; return c; });
                          return;
                        }
                        const num = parseFloat(raw);
                        if (isNaN(num) || num < 0 || num > 100) {
                          Alert.alert('Invalid', 'Weight must be 0–100');
                          setLocal((p) => { const c = { ...p }; delete c[t.id]; return c; });
                          return;
                        }
                        persist(t.id, { weight_override: num });
                      }}
                      keyboardType="decimal-pad"
                      placeholder={`${t.weight_percent}`}
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <ThemedText style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Exempt</ThemedText>
                    <Switch
                      value={!!cur?.is_exempt}
                      onValueChange={(v) => persist(t.id, { is_exempt: v })}
                      trackColor={{ true: colors.brand.primary }}
                    />
                  </View>
                </View>

                <ThemedText style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Reason (optional)</ThemedText>
                <TextInput
                  value={cur?.reason ?? ''}
                  onChangeText={(v) => persist(t.id, { reason: v })}
                  placeholder="e.g. Joined mid-semester; only Summative counts."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                />
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <ThemedText style={{ fontSize: 16, fontWeight: '700' }}>Pick Student</ThemedText>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <ThemedText style={{ color: colors.brand.primary, fontWeight: '600' }}>Done</ThemedText>
            </TouchableOpacity>
          </View>
          {studentsLoading ? (
            <View style={{ padding: Spacing.base, gap: 8 }}>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} width="100%" height={56} radius={Radius.lg} />)}
            </View>
          ) : (
            <FastList
              data={students}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ padding: Spacing.base, gap: 6 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { haptics.light(); setSelectedStudent(item); setPickerVisible(false); setLocal({}); }}
                  style={[styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Avatar name={item.full_name} photoUrl={item.photo_url} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <ThemedText style={{ fontSize: 14, fontWeight: '600' }}>{item.full_name}</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: colors.textMuted }}>
                      {item.student_number} · {item.grade_name} · {item.stream_name}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

export default function StudentOverridesScreen() {
  return (
    <ModuleGate module="exams" fallback={<ModuleDisabledScreen module="exams" />}>
      <StudentOverridesContent />
    </ModuleGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  studentPicker: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth,
  },
  card: { borderRadius: Radius.lg, padding: Spacing.md },
  input: {
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs, fontSize: 14,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: StyleSheet.hairlineWidth },
  studentRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
});
