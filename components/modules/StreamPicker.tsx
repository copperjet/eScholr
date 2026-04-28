/**
 * StreamPicker — Class/Stream selector for HOD, Coordinator, Principal
 * Used to filter views by class/stream across admin dashboards
 */
import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../lib/theme';
import { ThemedText } from '../ui/ThemedText';
import { Skeleton } from '../ui/Skeleton';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

interface Stream {
  id: string;
  name: string;
  grade_id: string;
  grades?: { name: string; school_sections?: { name: string } } | null;
}

interface StreamPickerProps {
  schoolId: string;
  selectedStreamId: string | null;
  onSelect: (streamId: string | null) => void;
  showAllOption?: boolean;
  label?: string;
}

function useStreams(schoolId: string) {
  return useQuery({
    queryKey: ['streams', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('streams')
        .select(`
          id, name, grade_id,
          grades ( name, school_sections ( name ) )
        `)
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .order('grades(sort_order)')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Stream[];
    },
  });
}

export function StreamPicker({
  schoolId,
  selectedStreamId,
  onSelect,
  showAllOption = true,
  label = 'Select Class',
}: StreamPickerProps) {
  const { colors } = useTheme();
  const { data: streams, isLoading } = useStreams(schoolId);

  if (isLoading) {
    return (
      <View style={styles.container}>
        {label && <ThemedText variant="label" color="muted" style={styles.label}>{label}</ThemedText>}
        <Skeleton height={40} width={200} />
      </View>
    );
  }

  if (!streams?.length) {
    return (
      <View style={styles.container}>
        {label && <ThemedText variant="label" color="muted" style={styles.label}>{label}</ThemedText>}
        <ThemedText variant="caption" color="muted">No classes available</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && <ThemedText variant="label" color="muted" style={styles.label}>{label}</ThemedText>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {showAllOption && (
          <TouchableOpacity
            onPress={() => { haptics.selection(); onSelect(null); }}
            style={[
              styles.chip,
              selectedStreamId === null && { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
              { backgroundColor: selectedStreamId === null ? colors.brand.primary : colors.surface, borderColor: selectedStreamId === null ? colors.brand.primary : colors.border },
            ]}
          >
            <Ionicons
              name="grid-outline"
              size={14}
              color={selectedStreamId === null ? colors.brand.onPrimary : colors.textSecondary}
              style={{ marginRight: 4 }}
            />
            <ThemedText
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: selectedStreamId === null ? colors.brand.onPrimary : colors.textSecondary,
              }}
            >
              All Classes
            </ThemedText>
          </TouchableOpacity>
        )}

        {streams.map((stream) => {
          const isSelected = stream.id === selectedStreamId;
          const gradeName = stream.grades?.name ?? '';
          const fullName = gradeName ? `${gradeName} ${stream.name}` : stream.name;

          return (
            <TouchableOpacity
              key={stream.id}
              onPress={() => { haptics.selection(); onSelect(stream.id); }}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? colors.brand.primary : colors.surface, borderColor: isSelected ? colors.brand.primary : colors.border },
              ]}
            >
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: isSelected ? colors.brand.onPrimary : colors.textSecondary,
                }}
              >
                {fullName}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.base,
  },
  label: {
    marginBottom: Spacing.sm,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  scrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.base,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
