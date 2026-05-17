import React, { useState, useMemo, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, Pressable, Alert, ScrollView, TextInput, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, ScreenHeader, Skeleton, EmptyState, Button, Badge, Avatar,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import {
  useInvoiceBatchPreview, useGenerateInvoiceBatch, type BatchPreviewItem,
} from '../../../hooks/useInvoices';
import { useSemesters } from '../../../hooks/useAdmin';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';

function useGradesAndStreams(schoolId: string) {
  return useQuery({
    queryKey: ['grades-streams', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('grades')
        .select('id, name, streams(id, name)')
        .eq('school_id', schoolId)
        .order('name');
      return (data ?? []) as { id: string; name: string; streams: { id: string; name: string }[] }[];
    },
  });
}

type Step = 'configure' | 'preview' | 'done';

export default function InvoiceBatchScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';
  const staffId = user?.staffId ?? '';

  const { data: semesters = [] } = useSemesters(schoolId);
  const activeSem = semesters.find((s) => s.is_active) ?? semesters[0];
  const { data: gradesRaw = [] } = useGradesAndStreams(schoolId);

  const [step, setStep] = useState<Step>('configure');
  const [semesterId, setSemesterId] = useState<string>(activeSem?.id ?? '');
  const [gradeId, setGradeId] = useState<string>('');
  const [streamId, setStreamId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);

  // Update semesterId once data loads
  React.useEffect(() => {
    if (!semesterId && activeSem?.id) setSemesterId(activeSem.id);
  }, [activeSem?.id]);

  const selectedGrade = gradesRaw.find((g) => g.id === gradeId);
  const streamOptions = selectedGrade?.streams ?? [];

  const previewParams = useMemo(() => ({
    schoolId,
    semesterId: semesterId || null,
    gradeId: gradeId || null,
    streamId: streamId || null,
  }), [schoolId, semesterId, gradeId, streamId]);

  const { data: preview = [], isLoading: previewLoading, refetch: refetchPreview } =
    useInvoiceBatchPreview(previewParams);

  const generate = useGenerateInvoiceBatch(schoolId);

  const toCreate = useMemo(
    () => skipExisting ? preview.filter((p) => !p.has_existing_invoice) : preview,
    [preview, skipExisting]
  );

  const totalAmount = useMemo(
    () => toCreate.reduce((s, p) => s + p.total, 0),
    [toCreate]
  );

  const handleGenerate = useCallback(async () => {
    if (toCreate.length === 0) { Alert.alert('Nothing to generate'); return; }
    Alert.alert(
      'Generate Invoices',
      `Create ${toCreate.length} invoice${toCreate.length !== 1 ? 's' : ''} totalling K${totalAmount.toLocaleString()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            haptics.medium();
            try {
              await generate.mutateAsync({
                semesterId,
                students: toCreate,
                staffId,
                dueDate: dueDate || undefined,
                skipExisting,
              });
              haptics.success();
              setStep('done');
            } catch (e: any) {
              haptics.error();
              Alert.alert('Error', e?.message ?? 'Could not generate invoices.');
            }
          },
        },
      ]
    );
  }, [toCreate, totalAmount, generate, semesterId, staffId, dueDate, skipExisting]);

  if (step === 'done') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Invoice Batch" showBack />
        <View style={styles.doneWrap}>
          <View style={[styles.doneIcon, { backgroundColor: Colors.semantic.successLight }]}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.semantic.success} />
          </View>
          <ThemedText variant="h2" style={{ textAlign: 'center' }}>Invoices Generated</ThemedText>
          <ThemedText variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {toCreate.length} invoice{toCreate.length !== 1 ? 's' : ''} created successfully.
          </ThemedText>
          <View style={{ gap: Spacing.sm, width: '100%', marginTop: Spacing.lg }}>
            <Button label="Generate Another Batch" variant="secondary" fullWidth onPress={() => { setStep('configure'); setGradeId(''); setStreamId(''); }} />
            <Button label="Back to Finance" variant="primary" fullWidth onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Generate Invoices"
        showBack
        right={
          step === 'configure' ? (
            <Pressable
              onPress={() => { if (!semesterId) { Alert.alert('Select a semester'); return; } setStep('preview'); refetchPreview(); }}
              style={[styles.nextBtn, { backgroundColor: colors.brand.primary }]}
            >
              <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Preview</ThemedText>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </Pressable>
          ) : step === 'preview' ? (
            <Pressable onPress={() => setStep('configure')} style={[styles.nextBtn, { backgroundColor: colors.surfaceSecondary }]}>
              <Ionicons name="arrow-back" size={15} color={colors.textPrimary} />
              <ThemedText style={{ fontWeight: '600', fontSize: 13, color: colors.textPrimary }}>Edit</ThemedText>
            </Pressable>
          ) : null
        }
      />

      {/* Step indicators */}
      <View style={styles.stepRow}>
        {(['configure', 'preview'] as Step[]).map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, { backgroundColor: step === s || (step === 'done' && i < 2) ? colors.brand.primary : colors.surfaceSecondary }]}>
              <ThemedText style={{ color: step === s || step === 'done' ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{i + 1}</ThemedText>
            </View>
            <ThemedText variant="caption" color={step === s ? 'primary' : 'muted'} style={{ textTransform: 'capitalize' }}>{s}</ThemedText>
          </View>
        ))}
      </View>

      {step === 'configure' && (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Semester */}
          <View style={styles.section}>
            <ThemedText variant="label" color="muted" style={styles.sectionTitle}>SEMESTER</ThemedText>
            <View style={{ gap: Spacing.sm }}>
              {semesters.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setSemesterId(s.id)}
                  style={[styles.optionRow, {
                    backgroundColor: semesterId === s.id ? colors.brand.primarySoft : colors.surface,
                    borderColor: semesterId === s.id ? colors.brand.primary : colors.border,
                  }, Shadow.sm]}
                >
                  <View style={[styles.radio, { borderColor: semesterId === s.id ? colors.brand.primary : colors.border }]}>
                    {semesterId === s.id && <View style={[styles.radioDot, { backgroundColor: colors.brand.primary }]} />}
                  </View>
                  <ThemedText style={{ fontWeight: semesterId === s.id ? '600' : '400' }}>{s.name}</ThemedText>
                  {s.is_active && <Badge label="Active" preset="success" />}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Grade */}
          <View style={styles.section}>
            <ThemedText variant="label" color="muted" style={styles.sectionTitle}>GRADE (optional — blank = all)</ThemedText>
            <View style={{ gap: Spacing.sm }}>
              <Pressable
                onPress={() => { setGradeId(''); setStreamId(''); }}
                style={[styles.optionRow, {
                  backgroundColor: !gradeId ? colors.brand.primarySoft : colors.surface,
                  borderColor: !gradeId ? colors.brand.primary : colors.border,
                }, Shadow.sm]}
              >
                <View style={[styles.radio, { borderColor: !gradeId ? colors.brand.primary : colors.border }]}>
                  {!gradeId && <View style={[styles.radioDot, { backgroundColor: colors.brand.primary }]} />}
                </View>
                <ThemedText style={{ fontWeight: !gradeId ? '600' : '400' }}>All Grades</ThemedText>
              </Pressable>
              {gradesRaw.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => { setGradeId(g.id); setStreamId(''); }}
                  style={[styles.optionRow, {
                    backgroundColor: gradeId === g.id ? colors.brand.primarySoft : colors.surface,
                    borderColor: gradeId === g.id ? colors.brand.primary : colors.border,
                  }, Shadow.sm]}
                >
                  <View style={[styles.radio, { borderColor: gradeId === g.id ? colors.brand.primary : colors.border }]}>
                    {gradeId === g.id && <View style={[styles.radioDot, { backgroundColor: colors.brand.primary }]} />}
                  </View>
                  <ThemedText style={{ fontWeight: gradeId === g.id ? '600' : '400' }}>{g.name}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Stream */}
          {gradeId && streamOptions.length > 0 && (
            <View style={styles.section}>
              <ThemedText variant="label" color="muted" style={styles.sectionTitle}>STREAM (optional — blank = all in grade)</ThemedText>
              <View style={{ gap: Spacing.sm }}>
                <Pressable
                  onPress={() => setStreamId('')}
                  style={[styles.optionRow, { backgroundColor: !streamId ? colors.brand.primarySoft : colors.surface, borderColor: !streamId ? colors.brand.primary : colors.border }, Shadow.sm]}
                >
                  <View style={[styles.radio, { borderColor: !streamId ? colors.brand.primary : colors.border }]}>
                    {!streamId && <View style={[styles.radioDot, { backgroundColor: colors.brand.primary }]} />}
                  </View>
                  <ThemedText style={{ fontWeight: !streamId ? '600' : '400' }}>All Streams</ThemedText>
                </Pressable>
                {streamOptions.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setStreamId(s.id)}
                    style={[styles.optionRow, { backgroundColor: streamId === s.id ? colors.brand.primarySoft : colors.surface, borderColor: streamId === s.id ? colors.brand.primary : colors.border }, Shadow.sm]}
                  >
                    <View style={[styles.radio, { borderColor: streamId === s.id ? colors.brand.primary : colors.border }]}>
                      {streamId === s.id && <View style={[styles.radioDot, { backgroundColor: colors.brand.primary }]} />}
                    </View>
                    <ThemedText style={{ fontWeight: streamId === s.id ? '600' : '400' }}>{s.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Due date */}
          <View style={styles.section}>
            <ThemedText variant="label" color="muted" style={styles.sectionTitle}>DUE DATE (optional, YYYY-MM-DD)</ThemedText>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="e.g. 2026-03-31"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            />
          </View>

          {/* Skip existing */}
          <Pressable
            onPress={() => setSkipExisting((v) => !v)}
            style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText variant="body" style={{ fontWeight: '500' }}>Skip students with existing invoices</ThemedText>
              <ThemedText variant="caption" color="muted">Recommended — avoids duplicate invoices for this semester.</ThemedText>
            </View>
            <View style={[styles.toggle, { backgroundColor: skipExisting ? colors.brand.primary : colors.surfaceSecondary }]}>
              <View style={[styles.toggleThumb, { transform: [{ translateX: skipExisting ? 18 : 2 }] }]} />
            </View>
          </Pressable>
        </ScrollView>
      )}

      {step === 'preview' && (
        <View style={{ flex: 1 }}>
          {/* Summary banner */}
          <View style={[styles.summaryBanner, { backgroundColor: colors.brand.primarySoft }]}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="h4">{toCreate.length} invoice{toCreate.length !== 1 ? 's' : ''} to create</ThemedText>
              {preview.length !== toCreate.length && (
                <ThemedText variant="caption" color="muted">
                  {preview.length - toCreate.length} skipped (existing)
                </ThemedText>
              )}
            </View>
            <ThemedText variant="h3" style={{ color: colors.brand.primary }}>
              K{totalAmount.toLocaleString()}
            </ThemedText>
          </View>

          {previewLoading ? (
            <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={60} />)}
            </View>
          ) : toCreate.length === 0 ? (
            <EmptyState
              title={preview.length > 0 ? 'All students already invoiced' : 'No students match'}
              description={preview.length > 0 ? 'Disable "skip existing" or choose a different filter.' : 'No fee schedules found for this selection.'}
              icon="document-text-outline"
            />
          ) : (
            <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 100 }}>
              {toCreate.map((item) => (
                <PreviewCard key={item.student_id} item={item} colors={colors} />
              ))}
            </ScrollView>
          )}

          {toCreate.length > 0 && (
            <View style={[styles.generateBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <Button
                label={generate.isPending ? 'Generating…' : `Generate ${toCreate.length} Invoice${toCreate.length !== 1 ? 's' : ''}`}
                variant="primary"
                fullWidth
                loading={generate.isPending}
                onPress={handleGenerate}
                iconLeft={<Ionicons name="document-text" size={18} color="#fff" />}
              />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function PreviewCard({ item, colors }: { item: BatchPreviewItem; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable onPress={() => setExpanded((e) => !e)} style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.sm]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <Avatar name={item.student_name} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="h4" numberOfLines={1}>{item.student_name}</ThemedText>
          <ThemedText variant="caption" color="muted">
            {[item.student_number, item.grade_name, item.stream_name].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <ThemedText variant="h4" style={{ color: colors.brand.primary }}>K{item.total.toLocaleString()}</ThemedText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </View>
      {expanded && (
        <View style={[styles.lineItems, { borderTopColor: colors.border }]}>
          {item.items.map((it, i) => (
            <View key={i} style={styles.lineRow}>
              <ThemedText variant="bodySm" style={{ flex: 1 }}>{it.category_name}</ThemedText>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>K{it.amount.toLocaleString()}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  stepRow: { flexDirection: 'row', gap: Spacing.lg, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, alignItems: 'center' },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  form: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 },
  section: { gap: Spacing.sm },
  sectionTitle: { marginBottom: 2 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
  toggle: { width: 42, height: 24, borderRadius: 12, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', position: 'absolute' },
  summaryBanner: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, gap: Spacing.md },
  previewCard: { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  lineItems: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  generateBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.base, borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.base },
  doneIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
});
