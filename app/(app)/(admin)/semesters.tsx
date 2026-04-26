/**
 * Admin — Semester Management
 * View all semesters, create new, activate (deactivates all others).
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, BottomSheet, FAB, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  useSemesters,
  useCreateSemester,
  useActivateSemester,
  type Semester,
} from '../../../hooks/useAdmin';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

export default function SemestersScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: semesters = [], isLoading, isError, refetch } = useSemesters(schoolId);
  const createMutation = useCreateSemester(schoolId);
  const activateMutation = useActivateSemester(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || !startDate || !endDate) return;
    haptics.medium();
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        academicYear: academicYear.trim(),
        startDate,
        endDate,
      });
      haptics.success();
      setSheetVisible(false);
      setName(''); setStartDate(''); setEndDate('');
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not create semester. Try again.');
    }
  };

  const handleActivate = (sem: Semester) => {
    if (sem.is_active) return;
    Alert.alert(
      'Activate Semester',
      `Set "${sem.name}" as the active semester?\n\nAll other semesters will be deactivated. This affects attendance, marks, finance, and reports.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            haptics.medium();
            try {
              await activateMutation.mutateAsync(sem.id);
              haptics.success();
            } catch {
              haptics.error();
              Alert.alert('Error', 'Could not activate semester.');
            }
          },
        },
      ],
    );
  };

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load semesters" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const canCreate = name.trim().length > 0 && startDate.length === 10 && endDate.length === 10;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Semesters" showBack />

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={80} radius={Radius.lg} />)}
        </View>
      ) : semesters.length === 0 ? (
        <EmptyState title="No semesters" description="Tap + to create your first semester." icon="calendar-number-outline" />
      ) : (
        <FlatList
          data={semesters}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: sem }) => (
            <TouchableOpacity
              onPress={() => handleActivate(sem)}
              activeOpacity={0.8}
              style={[
                styles.semRow,
                {
                  backgroundColor: sem.is_active ? colors.brand.primary + '08' : colors.surface,
                  borderColor: sem.is_active ? colors.brand.primary : colors.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <ThemedText variant="body" style={{ fontWeight: '700' }}>{sem.name}</ThemedText>
                  {sem.is_active && (
                    <View style={[styles.activeBadge, { backgroundColor: Colors.semantic.success }]}>
                      <ThemedText variant="caption" style={{ color: '#fff', fontWeight: '700', fontSize: 9 }}>
                        ACTIVE
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText variant="caption" color="muted">
                  Academic Year {sem.academic_year}
                </ThemedText>
                <ThemedText variant="caption" color="muted">
                  {format(parseISO(sem.start_date), 'dd MMM yyyy')} – {format(parseISO(sem.end_date), 'dd MMM yyyy')}
                </ThemedText>
              </View>
              {!sem.is_active && (
                <View style={[styles.setActiveBtn, { borderColor: colors.brand.primary }]}>
                  <ThemedText variant="caption" style={{ color: colors.brand.primary, fontWeight: '700', fontSize: 11 }}>
                    Set Active
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <FAB icon={<Ionicons name="add" size={24} color="#fff" />} onPress={() => { haptics.medium(); setSheetVisible(true); }} />

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} title="New Semester" snapHeight={440}>
        <View style={{ gap: Spacing.md }}>
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>SEMESTER NAME</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Term 1 2026"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>ACADEMIC YEAR</ThemedText>
            <TextInput
              value={academicYear}
              onChangeText={setAcademicYear}
              placeholder="e.g. 2026"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>START DATE</ThemedText>
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="yyyy-mm-dd"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>END DATE</ThemedText>
              <TextInput
                value={endDate}
                onChangeText={setEndDate}
                placeholder="yyyy-mm-dd"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              />
            </View>
          </View>

          <View style={[styles.infoBox, { backgroundColor: Colors.semantic.info + '12', borderColor: Colors.semantic.info + '30' }]}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.semantic.info} />
            <ThemedText variant="caption" style={{ color: Colors.semantic.info, flex: 1, marginLeft: 6, lineHeight: 16 }}>
              New semesters are inactive by default. Tap "Set Active" on the list to activate.
            </ThemedText>
          </View>

          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || createMutation.isPending}
            style={[styles.saveBtn, { backgroundColor: canCreate && !createMutation.isPending ? colors.brand.primary : colors.border }]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
              {createMutation.isPending ? 'Creating…' : 'Create Semester'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 100 },
  semRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  setActiveBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  saveBtn: { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
});
