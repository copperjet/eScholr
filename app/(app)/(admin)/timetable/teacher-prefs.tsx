/**
 * Teacher Preferences
 * Pick teacher → day×period availability grid → constraints form
 */
import React, { useState, useMemo } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, BottomSheet, FormField, Button,
  Skeleton, EmptyState, ErrorState, ToggleRow, SearchBar,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useTeacherAvailability, useSetTeacherAvailability,
  useTeacherConstraints, useUpsertTeacherConstraints,
  usePeriods,
  type AvailabilityStatus, type TeacherConstraints,
} from '../../../../hooks/useTimetableBuilder';

// ── Types ────────────────────────────────────────────────────

interface StaffMember { id: string; full_name: string; role: string; }

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const STATUS_CONFIG: Record<AvailabilityStatus, { bg: string; icon: string; label: string }> = {
  neutral:     { bg: 'transparent', icon: 'remove',         label: 'Free' },
  unavailable: { bg: '#FEE2E2',     icon: 'close-circle',   label: 'Unavailable' },
  preferred:   { bg: '#D1FAE5',     icon: 'checkmark-circle', label: 'Preferred' },
};

// ── Data ─────────────────────────────────────────────────────

function useTeachingStaff(schoolId: string) {
  return useQuery<StaffMember[]>({
    queryKey: ['ttb-staff', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name, role')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .in('role', ['st', 'hrt', 'hod', 'coordinator', 'principal'])
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as StaffMember[];
    },
  });
}

// ── Constraints form ─────────────────────────────────────────

interface ConstraintsForm {
  max_periods_per_day: string;
  max_periods_per_week: string;
  max_consecutive: string;
  no_first_period: boolean;
  no_last_period: boolean;
  min_off_days_per_week: string;
  notes: string;
}

function toConstraintsForm(c: TeacherConstraints | undefined): ConstraintsForm {
  if (!c) return {
    max_periods_per_day: '', max_periods_per_week: '',
    max_consecutive: '', no_first_period: false, no_last_period: false,
    min_off_days_per_week: '0', notes: '',
  };
  return {
    max_periods_per_day:  c.max_periods_per_day  != null ? String(c.max_periods_per_day)  : '',
    max_periods_per_week: c.max_periods_per_week != null ? String(c.max_periods_per_week) : '',
    max_consecutive:      c.max_consecutive      != null ? String(c.max_consecutive)      : '',
    no_first_period:      c.no_first_period,
    no_last_period:       c.no_last_period,
    min_off_days_per_week: String(c.min_off_days_per_week),
    notes:                c.notes ?? '',
  };
}

// ── Main ─────────────────────────────────────────────────────

export default function TeacherPrefsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const staffQuery       = useTeachingStaff(sid);
  const periodsQuery     = usePeriods(sid);

  const [search, setSearch]             = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [tab, setTab]                   = useState<'availability' | 'constraints'>('availability');
  const [constraintsSheet, setConstraintsSheet] = useState(false);
  const [cForm, setCForm]               = useState<ConstraintsForm | null>(null);

  // Filtered staff
  const staff = useMemo(() => {
    const all = staffQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [staffQuery.data, search]);

  const selectedStaff = (staffQuery.data ?? []).find((s) => s.id === selectedStaffId);

  // Availability data
  const availQuery   = useTeacherAvailability(sid, selectedStaffId ?? undefined);
  const setAvail     = useSetTeacherAvailability(sid);
  const constraintsQ = useTeacherConstraints(sid, selectedStaffId ?? undefined);
  const upsertConstraints = useUpsertTeacherConstraints();

  const periods = periodsQuery.data ?? [];
  const teachingPeriods = periods.filter((p) => !p.is_break && !p.is_assembly);

  // Local availability state: map `${day}:${period_index}` → status
  const [localAvail, setLocalAvail] = useState<Record<string, AvailabilityStatus>>({});
  const [availDirty, setAvailDirty] = useState(false);

  // Sync server availability → local on teacher change
  React.useEffect(() => {
    if (!availQuery.data) return;
    const m: Record<string, AvailabilityStatus> = {};
    for (const a of availQuery.data) {
      m[`${a.day_of_week}:${a.period_index}`] = a.status;
    }
    setLocalAvail(m);
    setAvailDirty(false);
  }, [availQuery.data, selectedStaffId]);

  const activeDays = useMemo(() => DAYS.slice(0, 5), []);

  function cycleCell(day: number, periodIndex: number) {
    const key = `${day}:${periodIndex}`;
    const curr = localAvail[key] ?? 'neutral';
    const next: AvailabilityStatus =
      curr === 'neutral' ? 'unavailable' :
      curr === 'unavailable' ? 'preferred' : 'neutral';
    setLocalAvail((m) => ({ ...m, [key]: next }));
    setAvailDirty(true);
    haptics('light');
  }

  async function saveAvailability() {
    if (!selectedStaffId) return;
    const slots = Object.entries(localAvail)
      .filter(([, status]) => status !== 'neutral')
      .map(([key, status]) => {
        const [day, pi] = key.split(':').map(Number);
        return { day_of_week: day, period_index: pi, status };
      });
    try {
      await setAvail.mutateAsync({ staffId: selectedStaffId, slots });
      haptics('success');
      setAvailDirty(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save');
    }
  }

  function openConstraints() {
    const existing = constraintsQ.data?.[0];
    setCForm(toConstraintsForm(existing));
    setConstraintsSheet(true);
  }

  async function saveConstraints() {
    if (!selectedStaffId || !cForm) return;
    const payload: Omit<TeacherConstraints, 'id'> = {
      school_id:            sid,
      staff_id:             selectedStaffId,
      max_periods_per_day:  cForm.max_periods_per_day  ? parseInt(cForm.max_periods_per_day)  : null,
      max_periods_per_week: cForm.max_periods_per_week ? parseInt(cForm.max_periods_per_week) : null,
      max_consecutive:      cForm.max_consecutive      ? parseInt(cForm.max_consecutive)      : null,
      no_first_period:      cForm.no_first_period,
      no_last_period:       cForm.no_last_period,
      preferred_days:       null,
      min_off_days_per_week: parseInt(cForm.min_off_days_per_week) || 0,
      notes:                cForm.notes || null,
    };
    try {
      await upsertConstraints.mutateAsync(payload);
      haptics('success');
      setConstraintsSheet(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save');
    }
  }

  // ── Loading ───────────────────────────────────────────────

  if (staffQuery.isLoading || periodsQuery.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Teacher Preferences" />
        <View style={{ padding: Spacing.lg }}>
          {[1,2,3].map((i) => <Skeleton key={i} height={52} style={{ marginBottom: 8 }} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (staffQuery.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Teacher Preferences" />
        <ErrorState message="Failed to load staff" onRetry={staffQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Teacher Preferences" subtitle="Availability + constraints" />

      <View style={styles.container}>
        {/* Left: staff list */}
        <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search staff..." />
          <ScrollView>
            {staff.length === 0 ? (
              <EmptyState icon="person-outline" title="No staff" description="No teaching staff found" />
            ) : (
              staff.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => { haptics('light'); setSelectedStaffId(s.id); setAvailDirty(false); }}
                  style={[
                    styles.staffItem,
                    { borderBottomColor: colors.border },
                    selectedStaffId === s.id && { backgroundColor: colors.primary + '15' },
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.primary + '22' }]}>
                    <ThemedText style={[styles.avatarText, { color: colors.primary }]}>
                      {s.full_name.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.staffName} numberOfLines={1}>{s.full_name}</ThemedText>
                    <ThemedText style={[styles.staffRole, { color: colors.textSecondary }]}>
                      {s.role.toUpperCase()}
                    </ThemedText>
                  </View>
                  {selectedStaffId === s.id && (
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        {/* Right: detail panel */}
        <View style={styles.detail}>
          {!selectedStaffId ? (
            <View style={styles.noSelection}>
              <Ionicons name="person-outline" size={48} color={colors.textSecondary} />
              <ThemedText style={[styles.noSelectionText, { color: colors.textSecondary }]}>
                Select a teacher
              </ThemedText>
            </View>
          ) : (
            <>
              {/* Sub-tabs */}
              <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
                {(['availability', 'constraints'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { haptics('light'); setTab(t); }}
                    style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  >
                    <ThemedText style={[styles.tabLabel, tab === t && { color: colors.primary }]}>
                      {t === 'availability' ? 'Availability' : 'Constraints'}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {tab === 'availability' ? (
                <ScrollView horizontal>
                  <ScrollView style={styles.gridScroll}>
                    {/* Legend */}
                    <View style={styles.legend}>
                      {(Object.entries(STATUS_CONFIG) as Array<[AvailabilityStatus, typeof STATUS_CONFIG['neutral']]>).map(([s, cfg]) => (
                        <View key={s} style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: cfg.bg || colors.border }]} />
                          <ThemedText style={[styles.legendText, { color: colors.textSecondary }]}>{cfg.label}</ThemedText>
                        </View>
                      ))}
                      <ThemedText style={[styles.legendHint, { color: colors.textSecondary }]}>Tap to cycle</ThemedText>
                    </View>

                    {/* Grid header */}
                    <View style={styles.gridHeader}>
                      <View style={styles.periodLabelCol} />
                      {activeDays.map((d) => (
                        <View key={d.value} style={styles.dayHeader}>
                          <ThemedText style={[styles.dayLabel, { color: colors.textSecondary }]}>{d.label}</ThemedText>
                        </View>
                      ))}
                    </View>

                    {/* Period rows */}
                    {teachingPeriods.map((p) => (
                      <View key={p.id} style={[styles.gridRow, { borderBottomColor: colors.border }]}>
                        <View style={[styles.periodLabelCol, { borderRightColor: colors.border }]}>
                          <ThemedText style={styles.periodName} numberOfLines={1}>{p.name}</ThemedText>
                          <ThemedText style={[styles.periodTime, { color: colors.textSecondary }]}>
                            {p.start_time.slice(0, 5)}
                          </ThemedText>
                        </View>
                        {activeDays.map((d) => {
                          const key = `${d.value}:${p.period_index}`;
                          const status: AvailabilityStatus = localAvail[key] ?? 'neutral';
                          const cfg = STATUS_CONFIG[status];
                          return (
                            <TouchableOpacity
                              key={d.value}
                              onPress={() => cycleCell(d.value, p.period_index)}
                              style={[
                                styles.cell,
                                { backgroundColor: cfg.bg || colors.surface, borderColor: colors.border },
                              ]}
                            >
                              <Ionicons
                                name={cfg.icon as any}
                                size={18}
                                color={
                                  status === 'unavailable' ? '#DC2626' :
                                  status === 'preferred'   ? '#059669' :
                                  colors.border
                                }
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}

                    {availDirty ? (
                      <View style={styles.saveBar}>
                        <Button
                          label="Save availability"
                          onPress={saveAvailability}
                          loading={setAvail.isPending}
                        />
                      </View>
                    ) : null}
                  </ScrollView>
                </ScrollView>
              ) : (
                /* Constraints summary + edit */
                <ScrollView style={{ padding: Spacing.md }}>
                  {constraintsQ.isLoading ? (
                    <Skeleton height={120} />
                  ) : (
                    <>
                      <ConstraintsSummary
                        constraints={constraintsQ.data?.[0]}
                        colors={colors}
                      />
                      <Button
                        label="Edit constraints"
                        variant="outline"
                        onPress={openConstraints}
                        style={{ marginTop: Spacing.md }}
                      />
                    </>
                  )}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </View>

      {/* Constraints edit sheet */}
      <BottomSheet visible={constraintsSheet} onClose={() => setConstraintsSheet(false)} title="Teacher Constraints">
        {cForm ? (
          <ScrollView style={{ padding: Spacing.md }}>
            <FormField
              label="Max periods/day (leave blank = global setting)"
              value={cForm.max_periods_per_day}
              onChangeText={(v) => setCForm((f) => f ? { ...f, max_periods_per_day: v } : f)}
              keyboardType="number-pad"
              placeholder="e.g. 6"
            />
            <FormField
              label="Max periods/week"
              value={cForm.max_periods_per_week}
              onChangeText={(v) => setCForm((f) => f ? { ...f, max_periods_per_week: v } : f)}
              keyboardType="number-pad"
              placeholder="e.g. 30"
            />
            <FormField
              label="Max consecutive periods"
              value={cForm.max_consecutive}
              onChangeText={(v) => setCForm((f) => f ? { ...f, max_consecutive: v } : f)}
              keyboardType="number-pad"
              placeholder="e.g. 3"
            />
            <ToggleRow
              label="Cannot teach first period"
              value={cForm.no_first_period}
              onValueChange={(v) => setCForm((f) => f ? { ...f, no_first_period: v } : f)}
            />
            <ToggleRow
              label="Cannot teach last period"
              value={cForm.no_last_period}
              onValueChange={(v) => setCForm((f) => f ? { ...f, no_last_period: v } : f)}
            />
            <FormField
              label="Min off days per week"
              value={cForm.min_off_days_per_week}
              onChangeText={(v) => setCForm((f) => f ? { ...f, min_off_days_per_week: v } : f)}
              keyboardType="number-pad"
              placeholder="0"
            />
            <FormField
              label="Notes"
              value={cForm.notes}
              onChangeText={(v) => setCForm((f) => f ? { ...f, notes: v } : f)}
              multiline
              placeholder="Optional notes for the solver"
            />
            <Button
              label="Save"
              onPress={saveConstraints}
              loading={upsertConstraints.isPending}
              style={{ marginTop: Spacing.lg, marginBottom: Spacing.xl }}
            />
          </ScrollView>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Constraints summary card ─────────────────────────────────

function ConstraintsSummary({ constraints, colors }: {
  constraints: TeacherConstraints | undefined;
  colors: any;
}) {
  if (!constraints) {
    return (
      <View style={[csStyles.card, { backgroundColor: colors.surface }]}>
        <ThemedText style={[csStyles.empty, { color: colors.textSecondary }]}>
          No custom constraints — using global settings
        </ThemedText>
      </View>
    );
  }
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Max periods/day',  value: constraints.max_periods_per_day  != null ? String(constraints.max_periods_per_day)  : 'Global' },
    { label: 'Max periods/week', value: constraints.max_periods_per_week != null ? String(constraints.max_periods_per_week) : 'Global' },
    { label: 'Max consecutive',  value: constraints.max_consecutive      != null ? String(constraints.max_consecutive)      : 'Global' },
    { label: 'No first period',  value: constraints.no_first_period  ? 'Yes' : 'No' },
    { label: 'No last period',   value: constraints.no_last_period   ? 'Yes' : 'No' },
    { label: 'Min off days/wk',  value: String(constraints.min_off_days_per_week) },
  ];
  return (
    <View style={[csStyles.card, { backgroundColor: colors.surface }]}>
      {rows.map((r) => (
        <View key={r.label} style={[csStyles.row, { borderBottomColor: colors.border }]}>
          <ThemedText style={[csStyles.label, { color: colors.textSecondary }]}>{r.label}</ThemedText>
          <ThemedText style={csStyles.value}>{r.value}</ThemedText>
        </View>
      ))}
      {constraints.notes ? (
        <View style={{ padding: Spacing.sm }}>
          <ThemedText style={[csStyles.label, { color: colors.textSecondary }]}>Notes</ThemedText>
          <ThemedText style={{ fontSize: 13, marginTop: 2 }}>{constraints.notes}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const csStyles = StyleSheet.create({
  card:  { borderRadius: Radius.md, overflow: 'hidden' },
  row:   { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  empty: { padding: Spacing.md, fontSize: 13 },
});

const styles = StyleSheet.create({
  container:      { flex: 1, flexDirection: 'row' },
  sidebar:        { width: 220, borderRightWidth: 1 },
  detail:         { flex: 1 },
  staffItem:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  avatar:         { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText:     { fontSize: 15, fontWeight: '700' },
  staffName:      { fontSize: 14, fontWeight: '500' },
  staffRole:      { fontSize: 11, marginTop: 1 },
  noSelection:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  noSelectionText: { fontSize: 14 },
  tabBar:         { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn:         { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  tabLabel:       { fontSize: 14, fontWeight: '500' },
  legend:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm, flexWrap: 'wrap' },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:      { width: 12, height: 12, borderRadius: 6 },
  legendText:     { fontSize: 12 },
  legendHint:     { fontSize: 11, marginLeft: 'auto' },
  gridScroll:     { flex: 1 },
  gridHeader:     { flexDirection: 'row' },
  periodLabelCol: { width: 80, borderRightWidth: StyleSheet.hairlineWidth, justifyContent: 'center', padding: 4 },
  dayHeader:      { width: 52, alignItems: 'center', paddingVertical: Spacing.xs },
  dayLabel:       { fontSize: 12, fontWeight: '600' },
  gridRow:        { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  periodName:     { fontSize: 12, fontWeight: '500' },
  periodTime:     { fontSize: 10, marginTop: 1 },
  cell: {
    width: 52, height: 48,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, margin: 1,
    borderRadius: 4,
  },
  saveBar: { padding: Spacing.md },
});
