import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../../lib/theme';
import { useAuthStore } from '../../../../../stores/authStore';
import { supabase } from '../../../../../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import {
  ThemedText, ScreenHeader, Button,
  EmptyState, ErrorState, ListItemSkeleton,
} from '../../../../../components/ui';
import {
  useStaffTimesheets,
  useBulkUpsertTimesheets,
  type StaffTimesheet,
} from '../../../../../hooks/usePayroll';
import { Spacing, Radius, Shadow } from '../../../../../constants/Typography';
import { Colors } from '../../../../../constants/Colors';
import { haptics } from '../../../../../lib/haptics';

interface HourlyStaff {
  id: string;
  full_name: string;
  staff_number: string | null;
  hourly_rate: number | null;
  currency: string | null;
}

function useHourlyStaff(schoolId: string) {
  return useQuery<HourlyStaff[]>({
    queryKey: ['hourly-staff', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name, staff_number, hourly_rate, currency')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .eq('pay_type', 'hourly')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as HourlyStaff[];
    },
  });
}

interface RowDraft { hours: string; overtime: string }

export default function HoursEntryScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id: periodId } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';
  const staffId  = user?.staffId ?? '';

  const hourlyStaff = useHourlyStaff(schoolId);
  const timesheets  = useStaffTimesheets(schoolId, periodId ?? '');
  const bulkUpsert  = useBulkUpsertTimesheets(schoolId);

  // Draft state: staffId -> { hours, overtime }
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [dirty, setDirty]   = useState(false);

  // Initialise drafts from existing timesheets
  useEffect(() => {
    if (!timesheets.data) return;
    const init: Record<string, RowDraft> = {};
    for (const ts of timesheets.data) {
      init[ts.staff_id] = {
        hours:    String(ts.hours_worked),
        overtime: String(ts.overtime_hours),
      };
    }
    setDrafts(init);
    setDirty(false);
  }, [timesheets.data]);

  function setField(staffId: string, field: 'hours' | 'overtime', value: string) {
    setDrafts((d) => ({ ...d, [staffId]: { ...d[staffId] ?? { hours: '0', overtime: '0' }, [field]: value } }));
    setDirty(true);
  }

  function handleSave() {
    const rows = (hourlyStaff.data ?? []).map((s) => {
      const draft = drafts[s.id] ?? { hours: '0', overtime: '0' };
      return {
        staff_id:       s.id,
        pay_period_id:  periodId!,
        hours_worked:   Math.max(0, parseFloat(draft.hours) || 0),
        overtime_hours: Math.max(0, parseFloat(draft.overtime) || 0),
        entered_by:     staffId,
      };
    });
    bulkUpsert.mutate(rows, {
      onSuccess: () => { haptics.success(); setDirty(false); },
      onError:   () => haptics.error(),
    });
  }

  const isLoading = hourlyStaff.isLoading || timesheets.isLoading;
  const isError   = hourlyStaff.isError || timesheets.isError;

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Hours Entry" showBack />
        <ErrorState title="Could not load staff" description="Try again." onRetry={() => { hourlyStaff.refetch(); timesheets.refetch(); }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Hours Entry"
        showBack
        rightElement={
          dirty ? (
            <Pressable
              onPress={handleSave}
              disabled={bulkUpsert.isPending}
              style={[styles.saveBtn, { backgroundColor: Colors.semantic.success }]}
            >
              <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                {bulkUpsert.isPending ? 'Saving…' : 'Save All'}
              </ThemedText>
            </Pressable>
          ) : undefined
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Column header */}
        <View style={[styles.colHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText variant="caption" style={styles.nameCol} color="muted">Staff Member</ThemedText>
          <ThemedText variant="caption" style={styles.numCol} color="muted">Hours</ThemedText>
          <ThemedText variant="caption" style={styles.numCol} color="muted">OT Hrs</ThemedText>
          <ThemedText variant="caption" style={styles.numCol} color="muted">Rate</ThemedText>
        </View>

        {isLoading ? (
          <View style={{ padding: Spacing.screen, gap: Spacing.sm }}>
            {Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)}
          </View>
        ) : (hourlyStaff.data ?? []).length === 0 ? (
          <EmptyState
            title="No hourly staff"
            description="No active staff with pay_type = hourly."
            icon="time-outline"
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={timesheets.isRefetching} onRefresh={timesheets.refetch} tintColor={colors.brand.primary} />}
          >
            {(hourlyStaff.data ?? []).map((s) => {
              const draft = drafts[s.id] ?? { hours: '0', overtime: '0' };
              const gross = (parseFloat(draft.hours) || 0) * (s.hourly_rate ?? 0)
                + (parseFloat(draft.overtime) || 0) * (s.hourly_rate ?? 0) * 1.5;
              return (
                <View
                  key={s.id}
                  style={[styles.dataRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <View style={styles.nameCol}>
                    <ThemedText variant="bodySm" style={{ fontWeight: '600' }} numberOfLines={1}>{s.full_name}</ThemedText>
                    <ThemedText variant="caption" color="muted">{s.staff_number ?? '—'}</ThemedText>
                  </View>
                  <TextInput
                    value={draft.hours}
                    onChangeText={(v) => setField(s.id, 'hours', v)}
                    keyboardType="decimal-pad"
                    style={[styles.numInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
                    selectTextOnFocus
                  />
                  <TextInput
                    value={draft.overtime}
                    onChangeText={(v) => setField(s.id, 'overtime', v)}
                    keyboardType="decimal-pad"
                    style={[styles.numInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
                    selectTextOnFocus
                  />
                  <View style={[styles.numCol, { alignItems: 'flex-end' }]}>
                    <ThemedText variant="caption" style={{ fontWeight: '700', color: colors.brand.primary }}>
                      {s.currency ?? 'K'}{gross.toFixed(0)}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {dirty && (
          <View style={[styles.saveBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText variant="caption" color="muted">Unsaved changes</ThemedText>
            <Button
              label={bulkUpsert.isPending ? 'Saving…' : 'Save All'}
              variant="primary"
              loading={bulkUpsert.isPending}
              onPress={handleSave}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  saveBtn:   { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  colHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  dataRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm },
  nameCol:   { flex: 2, minWidth: 120 },
  numCol:    { flex: 1, textAlign: 'right', minWidth: 60 },
  numInput:  { flex: 1, borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, fontSize: 14, textAlign: 'right', minWidth: 60 },
  saveBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
