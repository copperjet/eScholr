/**
 * School Structure Hub — Full CRUD
 * School-scoped governance (school_super_admin / super_admin).
 * Tree of sections → grades → streams plus subject list.
 * Add via FAB, edit/delete via inline icon buttons. Supports bulk add (comma-separated names).
 */
import React, { useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Pressable,
} from 'react-native';
import { webConfirm, webAlert } from '../../../lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, BottomSheet, FormField, Button, Skeleton, EmptyState, ScreenHeader, FAB,
} from '../../../components/ui';
import { Spacing, Radius, TAB_BAR_HEIGHT } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

interface Section  { id: string; name: string; order_index: number }
interface Grade    { id: string; section_id: string; name: string; order_index: number }
interface Stream   { id: string; grade_id: string; name: string; order_index: number }
interface Subject  { id: string; name: string; code: string | null; department: string | null; section_id: string | null }

type EntityKind = 'section' | 'grade' | 'stream' | 'subject';

type EditorState =
  | { kind: 'section'; mode: 'add' | 'edit'; row?: Section }
  | { kind: 'grade';   mode: 'add' | 'edit'; row?: Grade;   parentSectionId?: string }
  | { kind: 'stream';  mode: 'add' | 'edit'; row?: Stream;  parentGradeId?: string }
  | { kind: 'subject'; mode: 'add' | 'edit'; row?: Subject }
  | null;

const TABLE_BY_KIND: Record<EntityKind, string> = {
  section: 'school_sections',
  grade:   'grades',
  stream:  'streams',
  subject: 'subjects',
};

function useSchoolStructure(schoolId: string) {
  return useQuery({
    queryKey: ['school-structure', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const [{ data: sections }, { data: grades }, { data: streams }, { data: subjects }] = await Promise.all([
        db.from('school_sections').select('id,name,order_index').eq('school_id', schoolId).order('order_index'),
        db.from('grades').select('id,section_id,name,order_index').eq('school_id', schoolId).order('order_index'),
        db.from('streams').select('id,grade_id,name,order_index').eq('school_id', schoolId).order('order_index'),
        db.from('subjects').select('id,name,code,department,section_id').eq('school_id', schoolId).order('name'),
      ]);
      return {
        sections: (sections ?? []) as Section[],
        grades:   (grades   ?? []) as Grade[],
        streams:  (streams  ?? []) as Stream[],
        subjects: (subjects ?? []) as Subject[],
      };
    },
  });
}

function useSaveEntity(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      kind: EntityKind;
      id?: string;
      payload: Record<string, any>;
    }) => {
      const db = supabase as any;
      const table = TABLE_BY_KIND[params.kind];
      const body = { ...params.payload, school_id: schoolId };
      if (params.id) {
        const { error } = await db.from(table).update(body).eq('id', params.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await db.from(table).insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-structure', schoolId] }),
  });
}

function useDeleteEntity(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { kind: EntityKind; id: string }) => {
      const db = supabase as any;
      const table = TABLE_BY_KIND[params.kind];
      const { error } = await db.from(table).delete().eq('id', params.id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-structure', schoolId] }),
  });
}

export default function SchoolStructureScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useSchoolStructure(schoolId);
  const saveEntity = useSaveEntity(schoolId);
  const deleteEntity = useDeleteEntity(schoolId);

  const [editor, setEditor] = useState<EditorState>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [dept, setDept] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [editorError, setEditorError] = useState('');

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

  const openAdd = (kind: EntityKind, parentId?: string) => {
    setAddPickerOpen(false);
    setName(''); setCode(''); setDept(''); setParent(parentId ?? null); setSectionId(null); setEditorError('');
    if (kind === 'section')      setEditor({ kind, mode: 'add' });
    else if (kind === 'grade')   setEditor({ kind, mode: 'add', parentSectionId: parentId });
    else if (kind === 'stream')  setEditor({ kind, mode: 'add', parentGradeId: parentId });
    else                         setEditor({ kind, mode: 'add' });
  };

  const openEdit = (row: any, kind: EntityKind) => {
    setName(row.name ?? '');
    setCode(row.code ?? '');
    setDept(row.department ?? '');
    setParent(row.section_id ?? row.grade_id ?? null);
    setSectionId(kind === 'subject' ? (row.section_id ?? null) : null);
    setEditorError('');
    if (kind === 'section')      setEditor({ kind, mode: 'edit', row });
    else if (kind === 'grade')   setEditor({ kind, mode: 'edit', row, parentSectionId: row.section_id });
    else if (kind === 'stream')  setEditor({ kind, mode: 'edit', row, parentGradeId: row.grade_id });
    else                         setEditor({ kind, mode: 'edit', row });
  };

  const confirmDelete = async (row: any, kind: EntityKind) => {
    if (!data) return;
    haptics.medium();

    // Block if has children in cached tree
    let blockedReason = '';
    if (kind === 'section' && data.grades.some(g => g.section_id === row.id)) {
      blockedReason = 'This section has grades. Delete those first.';
    } else if (kind === 'grade' && data.streams.some(s => s.grade_id === row.id)) {
      blockedReason = 'This grade has streams. Delete those first.';
    }
    if (blockedReason) {
      webAlert('Cannot delete', blockedReason);
      return;
    }

    // Async integrity checks for leaf kinds — query DB for dependents
    try {
      const db = supabase as any;
      if (kind === 'stream') {
        const { count } = await db
          .from('students').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('stream_id', row.id).eq('status', 'active');
        if ((count ?? 0) > 0) {
          webAlert('Cannot delete', `This stream has ${count} active student(s). Move or deactivate them first.`);
          return;
        }
      } else if (kind === 'subject') {
        const [enr, asn] = await Promise.all([
          db.from('subject_enrollments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('subject_id', row.id),
          db.from('subject_teacher_assignments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('subject_id', row.id),
        ]);
        const e = enr.count ?? 0; const a = asn.count ?? 0;
        if (e > 0 || a > 0) {
          webAlert('Cannot delete', `Subject still has ${e} enrolment(s) and ${a} teacher assignment(s). Remove those first.`);
          return;
        }
      } else if (kind === 'grade') {
        // Extra safety: students can also be tied directly to grade_id
        const { count } = await db
          .from('students').select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('grade_id', row.id).eq('status', 'active');
        if ((count ?? 0) > 0) {
          webAlert('Cannot delete', `This grade has ${count} active student(s) tied to it. Move them first.`);
          return;
        }
      }
    } catch (e: any) {
      webAlert('Error', `Could not verify dependents: ${e?.message ?? 'unknown error'}`);
      return;
    }

    webConfirm(
      'Confirm delete',
      `Delete ${kind} "${row.name}"? This cannot be undone.`,
      async () => {
        try {
          await deleteEntity.mutateAsync({ kind, id: row.id });
          haptics.success();
        } catch (e: any) {
          haptics.error();
          webAlert('Error', e?.message ?? 'Could not delete.');
        }
      },
      'Delete',
      'Cancel',
      true,
    );
  };

  const handleSave = async () => {
    if (!editor) return;
    if (!name.trim()) { setEditorError('Name is required.'); return; }

    // In add mode, split by comma to support bulk creation
    const isMulti = editor.mode === 'add';
    const names: string[] = isMulti
      ? name.split(',').map(n => n.trim()).filter(Boolean)
      : [name.trim()];
    if (names.length === 0) { setEditorError('Name is required.'); return; }

    // Build shared extra fields
    let extra: Record<string, any> = {};
    if (editor.kind === 'subject') {
      extra.code = code.trim() || null;
      extra.department = dept.trim() || null;
      if (!sectionId) { setEditorError('Select a section.'); return; }
      extra.section_id = sectionId;
    }
    if (editor.kind === 'grade') {
      const resolvedSectionId = editor.mode === 'add' ? (editor.parentSectionId ?? parent) : (editor.row as Grade)?.section_id;
      if (!resolvedSectionId) { setEditorError('Select a section.'); return; }
      extra.section_id = resolvedSectionId;
    }
    if (editor.kind === 'stream') {
      const resolvedGradeId = editor.mode === 'add' ? (editor.parentGradeId ?? parent) : (editor.row as Stream)?.grade_id;
      if (!resolvedGradeId) { setEditorError('Select a grade.'); return; }
      extra.grade_id = resolvedGradeId;
    }

    setEditorError('');
    haptics.medium();
    try {
      const db = supabase as any;

      if (editor.mode === 'edit') {
        // Single edit — same as before
        let payload: Record<string, any> = { name: names[0], ...extra };
        if (editor.kind === 'section') payload.code = names[0].toUpperCase().slice(0, 3);
        await saveEntity.mutateAsync({ kind: editor.kind, id: editor.row?.id, payload });

      } else if (editor.kind === 'subject') {
        // Bulk insert subjects then auto-assign to grades in section
        const rows = names.map(n => ({ name: n, code: extra.code, department: extra.department, section_id: extra.section_id, school_id: schoolId }));
        const { data: newSubs, error: subErr } = await db.from('subjects').insert(rows).select('id');
        if (subErr) throw subErr;
        const gradesInSection = (data?.grades ?? []).filter((g: Grade) => g.section_id === extra.section_id);
        if (gradesInSection.length > 0 && (newSubs ?? []).length > 0) {
          const assignments: any[] = [];
          for (const sub of newSubs) {
            for (const g of gradesInSection) {
              assignments.push({ school_id: schoolId, grade_id: g.id, subject_id: sub.id, is_mandatory: true });
            }
          }
          await db.from('grade_subject_assignments').insert(assignments);
        }
        qc.invalidateQueries({ queryKey: ['school-structure', schoolId] });

      } else {
        // Bulk insert sections / grades / streams
        const table = TABLE_BY_KIND[editor.kind];
        const rows = names.map(n => ({
          name: n,
          ...(editor.kind === 'section' ? { code: n.toUpperCase().slice(0, 3) } : {}),
          ...extra,
          school_id: schoolId,
        }));
        const { error } = await db.from(table).insert(rows);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['school-structure', schoolId] });
      }

      haptics.success();
      setEditor(null);
    } catch (e: any) {
      haptics.error();
      setEditorError(e?.message ?? 'Could not save. Try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="School Structure" subtitle="Sections, grades, streams & subjects" />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: TAB_BAR_HEIGHT + 100, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
      >
        {/* ── Tree ───────────────────────────────────────────── */}
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="label" color="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Sections · Grades · Streams
          </ThemedText>
          <ThemedText variant="caption" color="muted">Tap the pencil to edit or the bin icon to delete.</ThemedText>

          {isLoading ? (
            <Skeleton width="100%" height={140} radius={Radius.lg} />
          ) : tree.length === 0 ? (
            <EmptyState title="No sections yet" description="Tap + to add the first section." />
          ) : (
            tree.map((section) => (
              <View key={section.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.row}>
                  <Ionicons name="business-outline" size={18} color={colors.brand.primary} />
                  <ThemedText style={{ fontWeight: '700', fontSize: 15, marginLeft: Spacing.sm, flex: 1 }}>{section.name}</ThemedText>
                  <TouchableOpacity onPress={() => openEdit(section, 'section')} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                    <Ionicons name="pencil-outline" size={18} color={colors.brand.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(section, 'section')} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openAdd('grade', section.id)} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                    <Ionicons name="add-circle-outline" size={20} color={colors.brand.primary} />
                  </TouchableOpacity>
                </View>

                {section.grades.length === 0 ? (
                  <ThemedText variant="caption" color="muted" style={{ marginTop: Spacing.sm, paddingLeft: Spacing.lg }}>
                    No grades. Tap + to add one.
                  </ThemedText>
                ) : (
                  section.grades.map((g) => (
                    <View key={g.id} style={{ marginTop: Spacing.sm, paddingLeft: Spacing.lg }}>
                      <View style={styles.row}>
                        <Ionicons name="layers-outline" size={14} color={colors.textMuted} />
                        <ThemedText style={{ fontWeight: '600', marginLeft: Spacing.sm, flex: 1 }}>{g.name}</ThemedText>
                        <ThemedText variant="caption" color="muted">{g.streams.length}</ThemedText>
                        <TouchableOpacity onPress={() => openEdit(g, 'grade')} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                          <Ionicons name="pencil-outline" size={16} color={colors.brand.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDelete(g, 'grade')} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                          <Ionicons name="trash-outline" size={16} color="#DC2626" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openAdd('stream', g.id)} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                          <Ionicons name="add-circle-outline" size={18} color={colors.brand.primary} />
                        </TouchableOpacity>
                      </View>
                      {g.streams.length > 0 && (
                        <View style={styles.streamRow}>
                          {g.streams.map((st) => (
                            <View
                              key={st.id}
                              style={[styles.streamChip, { backgroundColor: colors.brand.primary + '14', flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                            >
                              <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 11 }}>{st.name}</ThemedText>
                              <TouchableOpacity onPress={() => openEdit(st, 'stream')} hitSlop={4}>
                                <Ionicons name="pencil-outline" size={12} color={colors.brand.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => confirmDelete(st, 'stream')} hitSlop={4}>
                                <Ionicons name="trash-outline" size={12} color="#DC2626" />
                              </TouchableOpacity>
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
          <ThemedText variant="caption" color="muted">Tap the pencil to edit or the bin icon to delete.</ThemedText>

          {isLoading ? (
            <Skeleton width="100%" height={120} radius={Radius.lg} />
          ) : (data?.subjects.length ?? 0) === 0 ? (
            <EmptyState title="No subjects yet" description="Tap + and choose Subject." />
          ) : (
            (() => {
              const sections = data?.sections ?? [];
              const subjects = data?.subjects ?? [];
              // Group subjects by section_id; unassigned last
              const groups: { sectionId: string | null; sectionName: string; items: Subject[] }[] = [];
              for (const s of sections) {
                const items = subjects.filter(sub => sub.section_id === s.id);
                if (items.length > 0) groups.push({ sectionId: s.id, sectionName: s.name, items });
              }
              const unassigned = subjects.filter(sub => !sub.section_id);
              if (unassigned.length > 0) groups.push({ sectionId: null, sectionName: 'Unassigned', items: unassigned });
              return groups.map((group) => (
                <View key={group.sectionId ?? '__none'} style={{ gap: Spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
                    <Ionicons name="business-outline" size={12} color={colors.brand.primary} />
                    <ThemedText variant="label" style={{ color: colors.brand.primary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {group.sectionName}
                    </ThemedText>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border, marginLeft: 4 }} />
                  </View>
                  {group.items.map((sub) => (
                    <View
                      key={sub.id}
                      style={[styles.subjectRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontWeight: '600' }}>{sub.name}</ThemedText>
                        <ThemedText variant="caption" color="muted">
                          {sub.code ? `Code ${sub.code}` : 'No curriculum code'}
                          {sub.department ? ` · ${sub.department}` : ''}
                        </ThemedText>
                      </View>
                      <TouchableOpacity onPress={() => openEdit(sub, 'subject')} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                        <Ionicons name="pencil-outline" size={18} color={colors.brand.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDelete(sub, 'subject')} hitSlop={8} style={{ marginLeft: Spacing.sm }}>
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ));
            })()
          )}
        </View>
      </ScrollView>

      {/* ── FAB → Add picker ──────────────────────────────────── */}
      <FAB
        icon={<Ionicons name="add" size={26} color="#fff" />}
        onPress={() => { haptics.medium(); setAddPickerOpen(true); }}
      />

      {/* ── Add picker sheet ──────────────────────────────────── */}
      <BottomSheet
        visible={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        title="Add to school structure"
        snapHeight={320}
      >
        <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
          {[
            { kind: 'section' as EntityKind, label: 'Section',  desc: 'e.g. Primary, Secondary, A-Level', icon: 'business-outline' as const },
            { kind: 'grade'   as EntityKind, label: 'Grade',    desc: 'e.g. Grade 5, Form 2',             icon: 'layers-outline' as const },
            { kind: 'stream'  as EntityKind, label: 'Stream',   desc: 'e.g. 5A, 5B (class within grade)', icon: 'git-branch-outline' as const },
            { kind: 'subject' as EntityKind, label: 'Subject',  desc: 'e.g. Physics with code 0625',      icon: 'book-outline' as const },
          ].map((opt) => (
            <Pressable
              key={opt.kind}
              onPress={() => openAdd(opt.kind)}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Ionicons name={opt.icon} size={20} color={colors.brand.primary} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <ThemedText style={{ fontWeight: '700' }}>{opt.label}</ThemedText>
                <ThemedText variant="caption" color="muted">{opt.desc}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      {/* ── Editor sheet ───────────────────────────────────── */}
      <BottomSheet
        visible={!!editor}
        onClose={() => setEditor(null)}
        title={editor ? `${editor.mode === 'add' ? 'Add' : 'Edit'} ${editor.kind}` : ''}
        snapHeight={editor?.kind === 'subject' ? 540 : 360}
      >
        {editor && (
          <View style={{ padding: Spacing.base, gap: Spacing.base }}>
            {/* Parent picker for grade / stream when adding without preselected parent */}
            {editor.kind === 'grade' && editor.mode === 'add' && !editor.parentSectionId && (
              <View>
                <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>SECTION *</ThemedText>
                <View style={styles.optionWrap}>
                  {(data?.sections ?? []).map(s => (
                    <Pressable
                      key={s.id}
                      onPress={() => setParent(s.id)}
                      style={[styles.optionPill, { backgroundColor: parent === s.id ? colors.brand.primary : colors.surfaceSecondary, borderColor: parent === s.id ? colors.brand.primary : colors.border }]}
                    >
                      <ThemedText style={{ color: parent === s.id ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{s.name}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {editor.kind === 'stream' && editor.mode === 'add' && !editor.parentGradeId && (
              <View>
                <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>GRADE *</ThemedText>
                <View style={styles.optionWrap}>
                  {(data?.grades ?? []).map(g => (
                    <Pressable
                      key={g.id}
                      onPress={() => setParent(g.id)}
                      style={[styles.optionPill, { backgroundColor: parent === g.id ? colors.brand.primary : colors.surfaceSecondary, borderColor: parent === g.id ? colors.brand.primary : colors.border }]}
                    >
                      <ThemedText style={{ color: parent === g.id ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{g.name}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <FormField
              label={editor.mode === 'add' ? 'Name(s) *' : 'Name *'}
              placeholder={editor.mode === 'add' ? 'e.g. Form 1, Form 2, Form 3' : ''}
              value={name}
              onChangeText={(t) => { setName(t); setEditorError(''); }}
              iconLeft="create-outline"
            />
            {editor.mode === 'add' && (
              <ThemedText variant="caption" color="muted" style={{ marginTop: -Spacing.sm }}>
                Separate multiple names with commas to add them all at once.
              </ThemedText>
            )}

            {editor.kind === 'subject' && (
              <>
                <View>
                  <ThemedText variant="label" color="muted" style={{ marginBottom: Spacing.sm }}>SECTION *</ThemedText>
                  <View style={styles.optionWrap}>
                    {(data?.sections ?? []).map(s => (
                      <Pressable
                        key={s.id}
                        onPress={() => setSectionId(s.id)}
                        style={[styles.optionPill, { backgroundColor: sectionId === s.id ? colors.brand.primary : colors.surfaceSecondary, borderColor: sectionId === s.id ? colors.brand.primary : colors.border }]}
                      >
                        <ThemedText style={{ color: sectionId === s.id ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{s.name}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <FormField label="Curriculum Code" placeholder="e.g. 0625 (IGCSE Physics)" value={code} onChangeText={setCode} iconLeft="barcode-outline" autoCapitalize="characters" />
                <FormField label="Department" placeholder="e.g. Sciences" value={dept} onChangeText={setDept} iconLeft="business-outline" />
              </>
            )}

            {editorError ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.semantic.error + '12', padding: Spacing.md, borderRadius: Radius.md }}>
                <Ionicons name="alert-circle-outline" size={15} color={Colors.semantic.error} />
                <ThemedText style={{ color: Colors.semantic.error, fontSize: 13, flex: 1 }}>{editorError}</ThemedText>
              </View>
            ) : null}

            <Button label={editor.mode === 'add' ? 'Create' : 'Save'} onPress={handleSave} loading={saveEntity.isPending} fullWidth size="lg" />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.base },
  row: { flexDirection: 'row', alignItems: 'center' },
  streamRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs,
    marginTop: Spacing.xs, paddingLeft: Spacing.lg,
  },
  streamChip: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.base,
    borderWidth: 1, borderRadius: Radius.lg, gap: Spacing.sm,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1,
  },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionPill: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
});
