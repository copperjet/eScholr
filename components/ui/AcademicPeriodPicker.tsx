import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { Chip } from './Chip';
import { ThemedText } from './ThemedText';
import { Skeleton } from './Skeleton';
import { useTheme } from '../../lib/theme';
import { useSemesters } from '../../hooks/useAdmin';
import { Spacing } from '../../constants/Typography';

interface Props {
  schoolId: string;
  semesterId: string | null;
  onChangeSemester: (semesterId: string) => void;
  style?: ViewStyle;
}

export function AcademicPeriodPicker({ schoolId, semesterId, onChangeSemester, style }: Props) {
  const { colors } = useTheme();
  const { data: semesters = [], isLoading } = useSemesters(schoolId);

  // Derive unique academic years sorted descending
  const years = useMemo(() => {
    const set = new Set(semesters.map(s => s.academic_year));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [semesters]);

  // Track selected year — default to year of active/selected semester
  const defaultYear = useMemo(() => {
    if (!semesters.length) return '';
    const active = semesterId
      ? semesters.find(s => s.id === semesterId)
      : semesters.find(s => s.is_active);
    return active?.academic_year ?? years[0] ?? '';
  }, [semesters, semesterId, years]);

  const [selectedYear, setSelectedYear] = useState(defaultYear);

  useEffect(() => {
    if (defaultYear && !selectedYear) setSelectedYear(defaultYear);
  }, [defaultYear]);

  // Semesters for the selected year
  const yearSemesters = useMemo(
    () => semesters.filter(s => s.academic_year === selectedYear),
    [semesters, selectedYear]
  );

  // Auto-select first semester when year changes
  useEffect(() => {
    if (!yearSemesters.length) return;
    const already = yearSemesters.find(s => s.id === semesterId);
    if (!already) {
      const active = yearSemesters.find(s => s.is_active) ?? yearSemesters[0];
      onChangeSemester(active.id);
    }
  }, [selectedYear, yearSemesters]);

  if (isLoading) {
    return <Skeleton width="100%" height={72} radius={8} style={style} />;
  }

  if (!semesters.length) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }, style]}>
      {/* Year row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <ThemedText variant="caption" color="muted" style={styles.label}>Year</ThemedText>
        {years.map(y => (
          <Chip
            key={y}
            label={y}
            selected={selectedYear === y}
            onPress={() => setSelectedYear(y)}
          />
        ))}
      </ScrollView>

      {/* Semester row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <ThemedText variant="caption" color="muted" style={styles.label}>Semester</ThemedText>
        {yearSemesters.map(s => (
          <Chip
            key={s.id}
            label={s.is_active ? `${s.name} ●` : s.name}
            selected={semesterId === s.id}
            onPress={() => onChangeSemester(s.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: 4 },
  label: { marginRight: 2, minWidth: 54 },
});
