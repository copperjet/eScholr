/**
 * Student Detail — /(app)/(frontdesk)/student-detail?id=
 * FD view of a student record. No delete. Edit + invite parent allowed.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Avatar, Badge, Skeleton, ErrorState, ScreenHeader, Button, Card,
} from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

function useStudentFull(studentId: string | null, schoolId: string) {
  return useQuery({
    queryKey: ['students', 'detail', studentId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      if (!studentId) return null;
      const db = supabase as any;
      const [studentRes, parentsRes] = await Promise.all([
        db.from('students')
          .select(`
            id, full_name, student_number, date_of_birth, gender, photo_url,
            status, enrollment_date, school_id,
            streams ( name, grades ( name, school_sections ( name ) ) )
          `)
          .eq('id', studentId)
          .eq('school_id', schoolId)
          .single(),
        db.from('student_parent_links')
          .select(`parents ( id, full_name, phone, email )`)
          .eq('student_id', studentId),
      ]);
      if (studentRes.error) throw studentRes.error;
      return {
        ...studentRes.data,
        parents: (parentsRes.data ?? []).map((l: any) => l.parents).filter(Boolean),
      };
    },
  });
}

export default function FDStudentDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: student, isLoading, isError, refetch } = useStudentFull(id ?? null, schoolId);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Student" showBack />
        <ErrorState title="Could not load student" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const initials = (student?.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const grade = student?.streams?.grades?.name ?? '';
  const stream = student?.streams?.name ?? '';
  const section = student?.streams?.grades?.school_sections?.name ?? '';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Student" showBack />

      {isLoading || !student ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width={80} height={80} radius={40} />
          <Skeleton width="50%" height={22} />
          <Skeleton width="70%" height={80} radius={Radius.lg} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Profile header */}
          <View style={styles.profileHeader}>
            <Avatar name={student.full_name} photoUrl={student.photo_url} size={72} />
            <ThemedText variant="h3" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
              {student.full_name}
            </ThemedText>
            <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
              {student.student_number}
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
              <Badge label={student.status === 'active' ? 'Active' : 'Inactive'} preset={student.status === 'active' ? 'success' : 'neutral'} />
              {grade && <Badge label={`${grade} · ${stream}`} preset="neutral" />}
            </View>
          </View>

          {/* Details card */}
          <Card style={styles.card}>
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>DETAILS</ThemedText>
            {student.date_of_birth && (
              <InfoRow icon="calendar-outline" label="Date of Birth" value={format(parseISO(student.date_of_birth), 'dd MMM yyyy')} colors={colors} />
            )}
            {student.gender && (
              <InfoRow icon="male-female-outline" label="Gender" value={student.gender.charAt(0).toUpperCase() + student.gender.slice(1)} colors={colors} />
            )}
            {section && (
              <InfoRow icon="home-outline" label="Section" value={section} colors={colors} />
            )}
            {student.enrollment_date && (
              <InfoRow icon="time-outline" label="Enrolled" value={format(parseISO(student.enrollment_date), 'dd MMM yyyy')} colors={colors} />
            )}
          </Card>

          {/* Parents */}
          {student.parents?.length > 0 && (
            <Card style={styles.card}>
              <ThemedText variant="label" color="muted" style={styles.sectionLabel}>PARENT / GUARDIAN</ThemedText>
              {student.parents.map((p: any) => (
                <View key={p.id} style={styles.parentRow}>
                  <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                  <View style={{ marginLeft: Spacing.sm, flex: 1 }}>
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>{p.full_name}</ThemedText>
                    {p.phone && <ThemedText variant="caption" color="muted">{p.phone}</ThemedText>}
                    {p.email && <ThemedText variant="caption" color="muted">{p.email}</ThemedText>}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              label="Edit Student"
              variant="outline"
              fullWidth
              iconLeft={<Ionicons name="pencil-outline" size={16} color={colors.brand.primary} />}
              onPress={() => router.push({ pathname: '/(app)/(frontdesk)/student-edit' as any, params: { id: student.id } })}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: any }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={15} color={colors.textMuted} />
      <ThemedText variant="caption" color="muted" style={{ marginLeft: 8, width: 90 }}>{label}</ThemedText>
      <ThemedText variant="bodySm" style={{ flex: 1 }}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  scroll:        { paddingBottom: 48 },
  profileHeader: { alignItems: 'center', paddingVertical: Spacing.xl },
  card:          { marginHorizontal: Spacing.base, marginBottom: Spacing.base, padding: Spacing.base },
  sectionLabel:  { fontSize: 10, letterSpacing: 0.5, marginBottom: Spacing.sm },
  infoRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  parentRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing.xs },
  actions:       { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xl, gap: Spacing.sm },
});
