/**
 * School Structure Hub
 *
 * School-scoped governance screen (school_super_admin / super_admin).
 * Shows the section → grade → stream tree plus a subject list with
 * editable curriculum codes. Lightweight first cut — read + edit
 * subject codes; add/edit of structural rows can come later.
 */
import React, { useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, BottomSheet, FormField, Button, Skeleton, EmptyState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { haptics } from '../../../lib/haptics';

interface Section  { id: string; name: string; order_index: number }
interface Grade    { id: string; section_id: string; name: string; order_index: number }
interface Stream   { id: string; grade_id: string; name: string; order_index: number }
interface Subject  { id: string; name: string; code: string | null; department: string | null }

function useSchoolStructure(schoolId: string) {
  return useQuery({
    queryKey: ['school-structure', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const [{ data: sections }, { data: grades }, { data: streams }, { data: subjects }] = await Promise.all([
        db.from('school_sections').select('id,name,order_index').eq('school_id', schoolId).order('order_index'),
        db.from('grades').select('id,section_id,name,order_index').eq('school_id', schoolId).order('order_index'),
        db.from('streams').select('id,grade_id,name,order_index').eq('school_id', schoolId).order('order_index'),
        db.from('subjects').select('id,name,code,department').eq('school_id', schoolId).order('name'),
      ]);
      return {
        sections:  (sections  ?? []) as Section[],
        grades:    (grades    ?? []) as Grade[],
        streams:   (streams   ?? []) as Stream[],
        subjects:  (subjects  ?? []) as Subject[],
      };
    },
  });
}

function useUpdateSubject(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; name?: string; code?: string | null; department?: string | null }) => {
      const db = supabase as any;
      const { error } = await db.from('subjects')
        .update({ name: params.name, code: params.code, department: params.department })
        .eq('id', params.id)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-structure', schoolId] }),
  });
}

export default function SchoolStructureScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data, isLoading, isFetching, refetch } = useSchoolStructure(schoolId);
  const updateSubject = useUpdateSubject(schoolId);

  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectDept, setSubjectDept] = useState('');

  const tree = useMemo(() => {
    if (!data) return [];
    return data.sections.map((s) => ({
      ...s,
      grades: data.grades
        .filter((g) => g.section_id === s.id)
        .map((g) => ({
          ...g,
          streams: data.streams.filter((st) => st.grade_id === g.id),
        })),
    }));
  }, [data]);

  const openSubjectEditor = (sub: Subject) => {
    setEditingSubject(sub);
    setSubjectName(sub.name);
    setSubjectCode(sub.code ?? '');
    setSubjectDept(sub.department ?? '');
  };

  const saveSubject = async () => {
    if (!editingSubject) return;
    if (!subjectName.trim()) { Alert.alert('Validation', 'Subject name is required.'); return; }
    haptics.medium();
    try {
      await updateSubject.mutateAsync({
        id: editingSubject.id,
        name: subjectName.trim(),
        code: subjectCode.trim() || null,
        department: subjectDept.trim() || null,
      });
      haptics.success();
      setEditingSubject(null);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Error', e?.message ?? 'Could not save subject.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="School Structure" subtitle="Sections, grades, streams & subjects" />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: TAB_BAR_HEIGHT + Spacing['2xl'], gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
      >
        {/* ── Tree ───────────────────────────────────────────── */}
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="label" color="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Sections · Grades · Streams
          </ThemedText>

          {isLoading ? (
            <Skeleton width="100%" height={140} radius={Radius.lg} />
          ) : tree.length === 0 ? (
            <EmptyState title="No sections yet" description="Add sections during onboarding." />
          ) : (
            tree.map((section) => (
              <View key={section.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.row}>
                  <Ionicons name="business-outline" size={18} color={colors.brand.primary} />
                  <ThemedText style={{ fontWeight: '700', fontSize: 15, marginLeft: Spacing.sm }}>{section.name}</ThemedText>
                </View>
                {section.grades.length === 0 ? (
                  <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm }}>No grades</ThemedText>
                ) : (
                  section.grades.map((g) => (
                    <View key={g.id} style={{ marginTop: Spacing.sm, paddingLeft: Spacing.lg }}>
                      <View style={styles.row}>
                        <Ionicons name="layers-outline" size={14} color={colors.textMuted} />
                        <ThemedText style={{ fontWeight: '600', marginLeft: Spacing.sm }}>{g.name}</ThemedText>
                        <ThemedText variant="caption" color="muted" style={{ marginLeft: Spacing.sm }}>
                          {g.streams.length} stream{g.streams.length === 1 ? '' : 's'}
                        </ThemedText>
                      </View>
                      {g.streams.length > 0 && (
                        <View style={[styles.streamRow]}>
                          {g.streams.map((st) => (
                            <View key={st.id} style={[styles.streamChip, { backgroundColor: colors.brand.primary + '14' }]}>
                              <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 11 }}>{st.name}</ThemedText>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </View>

        {/* ── Subjects ───────────────────────────────────────── */}
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="label" color="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Subjects ({data?.subjects.length ?? 0})
          </ThemedText>

          {isLoading ? (
            <Skeleton width="100%" height={120} radius={Radius.lg} />
          ) : (data?.subjects.length ?? 0) === 0 ? (
            <EmptyState title="No subjects yet" description="Add subjects during onboarding." />
          ) : (
            data!.subjects.map((sub) => (
              <TouchableOpacity
                key={sub.id}
                onPress={() => openSubjectEditor(sub)}
                style={[styles.subjectRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }}>{sub.name}</ThemedText>
                  <ThemedText variant="caption" color="muted">
                    {sub.code ? `Code ${sub.code}` : 'No curriculum code'}
                    {sub.department ? ` · ${sub.department}` : ''}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Subject editor ───────────────────────────────────── */}
      <BottomSheet
        visible={!!editingSubject}
        onClose={() => setEditingSubject(null)}
        title="Edit Subject"
        snapHeight={460}
      >
        <View style={{ gap: Spacing.base, padding: Spacing.base }}>
          <FormField label="Name *" value={subjectName} onChangeText={setSubjectName} iconLeft="book-outline" />
          <FormField
            label="Curriculum Code"
            placeholder="e.g. 0625 (IGCSE Physics)"
            value={subjectCode}
            onChangeText={setSubjectCode}
            iconLeft="barcode-outline"
            autoCapitalize="characters"
          />
          <FormField label="Department" value={subjectDept} onChangeText={setSubjectDept} iconLeft="business-outline" />
          <Button label="Save" onPress={saveSubject} loading={updateSubject.isPending} fullWidth size="lg" />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.base,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  streamRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingLeft: Spacing.lg,
  },
  streamChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderWidth: 1,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
});
