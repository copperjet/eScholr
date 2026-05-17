/**
 * Generate Timetable Wizard
 * Step 1: scope (name, semester)
 * Step 2: readiness checklist
 * Step 3: run + live progress
 * Step 4: review conflicts → open grid
 */
import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, FormField, Button, Skeleton,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useGenerationRun, useCreateTimetable, useGenerateTimetable,
  type GenerationRun, type ChunkProgress,
} from '../../../../hooks/useTimetableBuilder';

// ── Helpers ───────────────────────────────────────────────────

interface Semester { id: string; name: string; is_active: boolean; }
interface AcademicYear { id: string; name: string; is_current: boolean; }

function useSemesters(schoolId: string) {
  return useQuery<Semester[]>({
    queryKey: ['semesters-gen', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('semesters').select('id, name, is_active')
        .eq('school_id', schoolId).order('name');
      if (error) throw error;
      return (data ?? []) as Semester[];
    },
  });
}

function useAcademicYears(schoolId: string) {
  return useQuery<AcademicYear[]>({
    queryKey: ['academic-years-gen', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('academic_years').select('id, name, is_current')
        .eq('school_id', schoolId).order('name');
      if (error) throw error;
      return (data ?? []) as AcademicYear[];
    },
  });
}

function useReadinessChecks(schoolId: string) {
  return useQuery<Array<{ label: string; ok: boolean; detail: string }>>({
    queryKey: ['ttb-readiness', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const [roomsRes, periodsRes, settingsRes, reqsRes, streamsRes, staffRes] = await Promise.all([
        db.from('rooms').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true),
        db.from('timetable_periods').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
        db.from('timetable_settings').select('id').eq('school_id', schoolId).maybeSingle(),
        db.from('subject_period_requirements').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
        db.from('streams').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
        db.from('subject_teacher_assignments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      ]);

      const roomCount   = roomsRes.count   ?? 0;
      const periodCount = periodsRes.count ?? 0;
      const reqCount    = reqsRes.count    ?? 0;
      const streamCount = streamsRes.count ?? 0;
      const staffCount  = staffRes.count   ?? 0;

      return [
        { label: 'Rooms defined',               ok: roomCount > 0,   detail: `${roomCount} active rooms` },
        { label: 'Periods configured',           ok: periodCount > 0, detail: `${periodCount} periods` },
        { label: 'Timetable settings saved',     ok: !!settingsRes.data, detail: settingsRes.data ? 'Settings saved' : 'Go to Settings' },
        { label: 'Subject requirements defined',  ok: reqCount > 0,   detail: `${reqCount} requirements` },
        { label: 'Streams set up',               ok: streamCount > 0, detail: `${streamCount} streams` },
        { label: 'Teacher assignments exist',     ok: staffCount > 0,  detail: `${staffCount} assignments` },
      ];
    },
  });
}

// ── Step indicator ────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <View style={[
            styles.stepDot,
            { backgroundColor: i <= step - 1 ? colors.primary : colors.border },
          ]} />
          {i < total - 1 ? (
            <View style={[styles.stepLine, { backgroundColor: i < step - 1 ? colors.primary : colors.border }]} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

// ── Run progress ──────────────────────────────────────────────

function RunProgress({
  runId, schoolId, onDone, chunkProgress,
}: {
  runId: string;
  schoolId: string;
  onDone: (run: GenerationRun) => void;
  chunkProgress: ChunkProgress | null;
}) {
  const { colors } = useTheme();
  const runQ = useGenerationRun(runId, schoolId);
  const run  = runQ.data;

  useEffect(() => {
    if (run && (run.status === 'succeeded' || run.status === 'partial' || run.status === 'failed' || run.status === 'timeout')) {
      onDone(run);
    }
  }, [run?.status]);

  const isRunning = !run || run.status === 'queued' || run.status === 'running';
  const statusColor = run?.status === 'succeeded' ? '#16A34A' : run?.status === 'failed' ? '#DC2626' : colors.primary;

  // Chunk progress fraction (0-1); fall back to indeterminate if no data
  const chunkFraction = chunkProgress && chunkProgress.total > 0
    ? chunkProgress.processed / chunkProgress.total
    : null;

  return (
    <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.progressHeader}>
        {isRunning ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Ionicons
            name={run?.status === 'succeeded' ? 'checkmark-circle' : 'alert-circle'}
            size={22}
            color={statusColor}
          />
        )}
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.progressStatus, { color: statusColor }]}>
            {chunkProgress
              ? `Chunk ${chunkProgress.chunks} · ${chunkProgress.processed}/${chunkProgress.total} streams`
              : isRunning ? 'Generating…' : run?.status.toUpperCase()}
          </ThemedText>
          {run?.runtime_ms ? (
            <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
              {(run.runtime_ms / 1000).toFixed(1)}s · {run.iterations ?? '—'} iterations
            </ThemedText>
          ) : null}
        </View>
      </View>

      {/* Chunk progress bar */}
      {chunkFraction !== null ? (
        <View style={[styles.chunkTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.chunkFill, { width: `${Math.round(chunkFraction * 100)}%` as any, backgroundColor: colors.primary }]} />
        </View>
      ) : null}

      <View style={styles.progressStats}>
        {[
          { label: 'Conflicts', value: run?.conflicts_found != null ? String(run.conflicts_found) : '—' },
          { label: 'Cost score', value: run?.cost_score != null ? run.cost_score.toFixed(1) : '—' },
          { label: 'Algorithm', value: run?.algorithm ?? '—' },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</ThemedText>
            <ThemedText style={styles.statValue}>{s.value}</ThemedText>
          </View>
        ))}
      </View>

      {run?.error_message ? (
        <View style={[styles.errorBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <ThemedText style={{ color: '#DC2626', fontSize: 12 }}>{run.error_message}</ThemedText>
        </View>
      ) : null}

      {run?.log_tail ? (
        <ScrollView style={[styles.logBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <ThemedText style={{ fontSize: 10, fontFamily: 'monospace', color: colors.textSecondary }}>{run.log_tail}</ThemedText>
        </ScrollView>
      ) : null}
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function GenerateScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const [step, setStep]           = useState(1);
  const [name, setName]           = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [runId, setRunId]         = useState<string | null>(null);
  const [timetableId, setTimetableId] = useState<string | null>(null);
  const [doneRun, setDoneRun]     = useState<GenerationRun | null>(null);

  const semestersQ    = useSemesters(sid);
  const academicYearsQ = useAcademicYears(sid);
  const readinessQ    = useReadinessChecks(sid);
  const createTT      = useCreateTimetable();
  const { generate, chunkProgress, currentRunId, isRunning: generating } = useGenerateTimetable();

  // Sync run_id from hook as soon as first chunk returns it
  useEffect(() => {
    if (currentRunId && !runId) setRunId(currentRunId);
  }, [currentRunId]);

  const semesters    = semestersQ.data ?? [];
  const academicYears = academicYearsQ.data ?? [];
  const checks       = readinessQ.data ?? [];
  const allGood      = checks.every((c) => c.ok);
  const blockingFail = checks.some((c) => !c.ok && ['Rooms defined','Periods configured','Streams set up'].includes(c.label));

  // Auto-select active semester
  useEffect(() => {
    const active = semesters.find((s) => s.is_active);
    if (active && !semesterId) setSemesterId(active.id);
  }, [semesters]);

  useEffect(() => {
    const curr = academicYears.find((y) => y.is_current);
    if (curr && !academicYearId) setAcademicYearId(curr.id);
  }, [academicYears]);

  async function startGeneration() {
    if (!name.trim()) { Alert.alert('Name required', 'Enter timetable name'); return; }
    try {
      const { id: ttId } = await createTT.mutateAsync({
        school_id:        sid,
        name:             name.trim(),
        academic_year_id: academicYearId || null,
        semester_id:      semesterId || null,
        created_by:       user?.id ?? null,
      });
      setTimetableId(ttId);
      setStep(3); // show progress immediately

      const result = await generate({
        school_id:        sid,
        timetable_id:     ttId,
        academic_year_id: academicYearId || null,
        semester_id:      semesterId || null,
        timetable_name:   name.trim(),
      });
      setRunId(result.run_id);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to start generation');
      setStep(2);
    }
  }

  function handleRunDone(run: GenerationRun) {
    setDoneRun(run);
    setStep(4);
    haptics('success');
  }

  // ── Steps ─────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Generate Timetable" showBack />

      <StepIndicator step={step} total={4} />

      <ScrollView contentContainerStyle={styles.content}>

        {/* Step 1: Scope */}
        {step === 1 ? (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>1. Scope</ThemedText>
            <ThemedText style={[styles.stepHint, { color: colors.textSecondary }]}>
              Name this timetable and optionally link it to a semester.
            </ThemedText>

            <FormField
              label="Timetable name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Semester 1 · 2026"
            />

            <ThemedText style={[styles.fieldLabel, { color: colors.textSecondary }]}>Semester (optional)</ThemedText>
            {semestersQ.isLoading ? <Skeleton height={44} /> : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                  <TouchableOpacity
                    onPress={() => setSemesterId('')}
                    style={[styles.chip, { backgroundColor: !semesterId ? colors.primary : colors.surface, borderColor: colors.border }]}
                  >
                    <ThemedText style={{ color: !semesterId ? '#fff' : colors.text, fontSize: 13 }}>None</ThemedText>
                  </TouchableOpacity>
                  {semesters.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSemesterId(s.id)}
                      style={[styles.chip, { backgroundColor: semesterId === s.id ? colors.primary : colors.surface, borderColor: colors.border }]}
                    >
                      <ThemedText style={{ color: semesterId === s.id ? '#fff' : colors.text, fontSize: 13 }}>{s.name}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            <Button label="Next →" onPress={() => { haptics('light'); setStep(2); }} disabled={!name.trim()} />
          </View>
        ) : null}

        {/* Step 2: Readiness checklist */}
        {step === 2 ? (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>2. Readiness check</ThemedText>
            <ThemedText style={[styles.stepHint, { color: colors.textSecondary }]}>
              Verify setup is complete before running the solver.
            </ThemedText>

            {readinessQ.isLoading ? (
              [1,2,3,4,5,6].map((i) => <Skeleton key={i} height={52} style={{ marginBottom: 8 }} />)
            ) : (
              checks.map((c) => (
                <View
                  key={c.label}
                  style={[
                    styles.checkRow,
                    {
                      backgroundColor: c.ok ? '#F0FDF4' : '#FEF2F2',
                      borderColor: c.ok ? '#BBF7D0' : '#FECACA',
                    },
                  ]}
                >
                  <Ionicons
                    name={c.ok ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={c.ok ? '#16A34A' : '#DC2626'}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 13, fontWeight: '600' }}>{c.label}</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: c.ok ? '#15803D' : '#9B1C1C' }}>{c.detail}</ThemedText>
                  </View>
                </View>
              ))
            )}

            {!allGood && !blockingFail ? (
              <View style={[styles.warnBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <Ionicons name="warning-outline" size={16} color="#D97706" />
                <ThemedText style={{ fontSize: 12, color: '#92400E', flex: 1 }}>
                  Some checks failed — solver may produce a partial result. Continue?
                </ThemedText>
              </View>
            ) : null}

            <View style={styles.navRow}>
              <Button label="← Back" variant="outline" onPress={() => setStep(1)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button
                label="Generate →"
                onPress={startGeneration}
                loading={generating}
                disabled={blockingFail || generating}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        ) : null}

        {/* Step 3: Progress */}
        {step === 3 && runId ? (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>3. Generating…</ThemedText>
            <ThemedText style={[styles.stepHint, { color: colors.textSecondary }]}>
              Solver running. This may take up to 60 seconds.
            </ThemedText>
            <RunProgress runId={runId} schoolId={sid} onDone={handleRunDone} chunkProgress={chunkProgress} />
          </View>
        ) : null}

        {/* Step 4: Results */}
        {step === 4 && doneRun && timetableId ? (
          <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>4. Done</ThemedText>

            <View style={[
              styles.resultCard,
              {
                backgroundColor: doneRun.status === 'succeeded' ? '#F0FDF4' : '#FEF2F2',
                borderColor: doneRun.status === 'succeeded' ? '#BBF7D0' : '#FECACA',
              },
            ]}>
              <Ionicons
                name={doneRun.status === 'succeeded' ? 'checkmark-circle' : 'alert-circle'}
                size={28}
                color={doneRun.status === 'succeeded' ? '#16A34A' : '#DC2626'}
              />
              <View>
                <ThemedText style={{ fontSize: 15, fontWeight: '700' }}>
                  {doneRun.status === 'succeeded' ? 'Timetable generated' :
                   doneRun.status === 'partial'   ? 'Partial result' :
                   doneRun.status === 'timeout'   ? 'Timeout — partial result saved' : 'Generation failed'}
                </ThemedText>
                {doneRun.conflicts_found != null ? (
                  <ThemedText style={{ fontSize: 13, marginTop: 2, color: doneRun.conflicts_found > 0 ? '#DC2626' : '#16A34A' }}>
                    {doneRun.conflicts_found} conflict{doneRun.conflicts_found !== 1 ? 's' : ''}
                  </ThemedText>
                ) : null}
              </View>
            </View>

            <Button
              label="Open grid →"
              onPress={() => router.replace(`/(app)/(admin)/timetable/${timetableId}/grid` as any)}
              style={{ marginTop: Spacing.md }}
            />
            {(doneRun.conflicts_found ?? 0) > 0 ? (
              <Button
                label="View conflicts"
                variant="outline"
                onPress={() => router.replace(`/(app)/(admin)/timetable/${timetableId}/conflicts` as any)}
                style={{ marginTop: Spacing.sm }}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  stepRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, gap: 0 },
  stepDot:       { width: 12, height: 12, borderRadius: 6 },
  stepLine:      { flex: 1, height: 2, maxWidth: 48 },
  content:       { padding: Spacing.base, gap: Spacing.md, paddingBottom: 60 },
  stepContent:   { gap: Spacing.md },
  stepTitle:     { fontSize: 17, fontWeight: '700' },
  stepHint:      { fontSize: 13 },
  fieldLabel:    { fontSize: 13, fontWeight: '500', marginBottom: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.sm, borderWidth: 1,
  },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1,
  },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1,
  },
  navRow:         { flexDirection: 'row', marginTop: Spacing.sm },
  progressCard:   { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  progressStatus: { fontSize: 15, fontWeight: '700' },
  progressStats:  { flexDirection: 'row', padding: Spacing.md, paddingTop: 0, gap: Spacing.md },
  statItem:       { flex: 1 },
  statLabel:      { fontSize: 11 },
  statValue:      { fontSize: 14, fontWeight: '600', marginTop: 2 },
  errorBox:       { margin: Spacing.md, padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1 },
  logBox:         { margin: Spacing.md, padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, maxHeight: 120 },
  chunkTrack:     { height: 4, marginHorizontal: Spacing.md, marginBottom: Spacing.xs, borderRadius: 2, overflow: 'hidden' },
  chunkFill:      { height: 4, borderRadius: 2 },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
  },
});
