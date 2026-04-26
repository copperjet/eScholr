/**
 * Inquiry Detail — view/edit status, add notes, convert to enrollment.
 * Route: /(app)/(frontdesk)/inquiry-detail?inquiry_id=
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import {
  ThemedText, Badge, BottomSheet, Skeleton, ErrorState, ScreenHeader,
} from '../../../components/ui';
import {
  useInquiryNotes,
  useUpdateInquiryStatus,
  useAddInquiryNote,
  useConvertToEnrollment,
  INQUIRY_STATUS_META,
  type InquiryStatus,
  type Inquiry,
} from '../../../hooks/useFrontDesk';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

function useInquiryDetail(inquiryId: string, schoolId: string) {
  return useQuery<Inquiry | null>({
    queryKey: ['inquiry-detail', inquiryId],
    enabled: !!inquiryId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('inquiries')
        .select(`
          id, school_id, name, contact_phone, contact_email, nature_of_inquiry,
          date, status, notes, assigned_to, created_at, updated_at,
          staff:assigned_to ( full_name )
        `)
        .eq('id', inquiryId)
        .eq('school_id', schoolId)
        .single();
      if (error) throw error;
      if (!data) return null;
      const r = data as any;
      return {
        id: r.id,
        school_id: r.school_id,
        name: r.name,
        contact_phone: r.contact_phone ?? null,
        contact_email: r.contact_email ?? null,
        nature_of_inquiry: r.nature_of_inquiry,
        date: r.date,
        status: r.status,
        notes: r.notes ?? null,
        assigned_to: r.assigned_to ?? null,
        assigned_name: r.staff?.full_name ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    },
  });
}

function useStreamsForEnrollment(schoolId: string) {
  return useQuery({
    queryKey: ['streams-enrollment', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('streams')
        .select('id, name, grades ( id, name )')
        .eq('school_id', schoolId)
        .order('name');
      return (data ?? []) as any[];
    },
  });
}

const STATUS_ORDER: InquiryStatus[] = ['new', 'in_progress', 'enrolled', 'closed'];

export default function InquiryDetailScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { inquiry_id } = useLocalSearchParams<{ inquiry_id: string }>();
  const schoolId = user?.schoolId ?? '';

  const { data: inquiry, isLoading, isError, refetch } = useInquiryDetail(inquiry_id ?? '', schoolId);
  const { data: notes = [] } = useInquiryNotes(inquiry_id ?? null);
  const { data: streams = [] } = useStreamsForEnrollment(schoolId);

  const statusMutation = useUpdateInquiryStatus(schoolId);
  const addNoteMutation = useAddInquiryNote(schoolId);
  const convertMutation = useConvertToEnrollment(schoolId);

  const [noteText, setNoteText] = useState('');
  const [statusSheetVisible, setStatusSheetVisible] = useState(false);
  const [convertSheetVisible, setConvertSheetVisible] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState('');

  const handleStatusChange = useCallback(async (status: InquiryStatus) => {
    haptics.medium();
    try {
      await statusMutation.mutateAsync({ inquiryId: inquiry_id!, status });
      haptics.success();
      setStatusSheetVisible(false);
    } catch {
      haptics.error();
      Alert.alert('Error', 'Could not update status.');
    }
  }, [statusMutation, inquiry_id]);

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;
    haptics.medium();
    try {
      await addNoteMutation.mutateAsync({
        inquiryId: inquiry_id!,
        note: noteText.trim(),
        staffId: user!.staffId!,
      });
      haptics.success();
      setNoteText('');
    } catch {
      haptics.error();
    }
  }, [addNoteMutation, noteText, inquiry_id, user]);

  const handleConvert = useCallback(async () => {
    if (!selectedStreamId || !inquiry) return;
    Alert.alert(
      'Convert to Enrollment',
      `Create a student record for "${inquiry.name}" and mark this inquiry as enrolled?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            haptics.medium();
            try {
              const result = await convertMutation.mutateAsync({
                inquiryId: inquiry.id,
                studentName: inquiry.name,
                gradeId: '',
                streamId: selectedStreamId,
                staffId: user!.staffId!,
              });
              haptics.success();
              setConvertSheetVisible(false);
              Alert.alert(
                'Enrolled',
                `${inquiry.name} has been enrolled. You can now complete their profile in Students.`,
                [{ text: 'OK', onPress: () => router.back() }],
              );
            } catch (e: any) {
              haptics.error();
              Alert.alert('Error', e.message ?? 'Could not convert. Try again.');
            }
          },
        },
      ],
    );
  }, [convertMutation, inquiry, selectedStreamId, user]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load inquiry" description="Try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const currentMeta = inquiry ? INQUIRY_STATUS_META[inquiry.status] : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Inquiry" showBack />

      {isLoading || !inquiry ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={16} />
          <Skeleton width="100%" height={80} radius={Radius.lg} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Info card */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.infoRow}>
                <ThemedText variant="h3">{inquiry.name}</ThemedText>
                <TouchableOpacity
                  onPress={() => setStatusSheetVisible(true)}
                  style={[styles.statusChip, { backgroundColor: currentMeta!.color + '18', borderColor: currentMeta!.color + '40' }]}
                >
                  <Ionicons name={currentMeta!.icon as any} size={13} color={currentMeta!.color} />
                  <ThemedText variant="caption" style={{ color: currentMeta!.color, fontWeight: '700', marginLeft: 4 }}>
                    {currentMeta!.label}
                  </ThemedText>
                  <Ionicons name="chevron-down" size={11} color={currentMeta!.color} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>

              <View style={{ gap: Spacing.xs, marginTop: Spacing.sm }}>
                <InfoLine icon="calendar-outline" text={format(parseISO(inquiry.date), 'dd MMM yyyy')} colors={colors} />
                <InfoLine icon="bookmark-outline" text={inquiry.nature_of_inquiry} colors={colors} />
                {inquiry.contact_phone && <InfoLine icon="call-outline" text={inquiry.contact_phone} colors={colors} />}
                {inquiry.contact_email && <InfoLine icon="mail-outline" text={inquiry.contact_email} colors={colors} />}
                {inquiry.assigned_name && <InfoLine icon="person-outline" text={`Handled by: ${inquiry.assigned_name}`} colors={colors} />}
              </View>

              {inquiry.notes && (
                <View style={[styles.infoCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <ThemedText variant="caption" color="muted" style={{ marginBottom: 4, fontSize: 10 }}>INITIAL NOTES</ThemedText>
                  <ThemedText variant="bodySm" color="secondary">{inquiry.notes}</ThemedText>
                </View>
              )}
            </View>

            {/* Convert to enrollment */}
            {inquiry.status !== 'enrolled' && inquiry.status !== 'closed' && (
              <TouchableOpacity
                onPress={() => setConvertSheetVisible(true)}
                style={[styles.convertBtn, { backgroundColor: Colors.semantic.success }]}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                  Convert to Enrollment
                </ThemedText>
              </TouchableOpacity>
            )}

            {/* Activity notes */}
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>ACTIVITY LOG</ThemedText>

            {notes.length === 0 ? (
              <ThemedText variant="caption" color="muted" style={{ textAlign: 'center', marginVertical: Spacing.md }}>
                No activity notes yet.
              </ThemedText>
            ) : (
              notes.map((n) => (
                <View key={n.id} style={[styles.noteRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.noteDot, { backgroundColor: colors.brand.primary }]} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <ThemedText variant="bodySm">{n.note}</ThemedText>
                    <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>
                      {n.staff_name} · {format(parseISO(n.created_at), 'dd MMM yyyy, h:mm a')}
                    </ThemedText>
                  </View>
                </View>
              ))
            )}

            {/* Add note */}
            <View style={[styles.addNoteRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Add a note…"
                placeholderTextColor={colors.textMuted}
                style={[styles.noteInput, { color: colors.textPrimary }]}
                multiline
              />
              <TouchableOpacity
                onPress={handleAddNote}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                style={[styles.noteSendBtn, { backgroundColor: noteText.trim() ? colors.brand.primary : colors.border }]}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Status change sheet */}
      <BottomSheet
        visible={statusSheetVisible}
        onClose={() => setStatusSheetVisible(false)}
        title="Update Status"
        snapHeight={320}
      >
        <View style={{ gap: Spacing.sm }}>
          {STATUS_ORDER.map((s) => {
            const meta = INQUIRY_STATUS_META[s];
            const isCurrent = inquiry?.status === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => handleStatusChange(s)}
                disabled={isCurrent || statusMutation.isPending}
                style={[
                  styles.statusOption,
                  {
                    backgroundColor: isCurrent ? meta.color + '18' : colors.surfaceSecondary,
                    borderColor: isCurrent ? meta.color : colors.border,
                  },
                ]}
              >
                <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                <ThemedText variant="body" style={{ flex: 1, marginLeft: Spacing.md, fontWeight: isCurrent ? '700' : '400', color: isCurrent ? meta.color : colors.textPrimary }}>
                  {meta.label}
                </ThemedText>
                {isCurrent && <Ionicons name="checkmark" size={16} color={meta.color} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>

      {/* Convert to enrollment sheet */}
      <BottomSheet
        visible={convertSheetVisible}
        onClose={() => setConvertSheetVisible(false)}
        title="Select Stream"
        snapHeight={400}
      >
        <ThemedText variant="bodySm" color="secondary" style={{ marginBottom: Spacing.md }}>
          Choose the class stream for this student. You can update all other details from the student profile.
        </ThemedText>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 240 }}>
          {streams.map((stream: any) => (
            <TouchableOpacity
              key={stream.id}
              onPress={() => setSelectedStreamId(stream.id)}
              style={[
                styles.streamOption,
                {
                  backgroundColor: selectedStreamId === stream.id ? colors.brand.primary + '12' : colors.surfaceSecondary,
                  borderColor: selectedStreamId === stream.id ? colors.brand.primary : colors.border,
                },
              ]}
            >
              <ThemedText variant="body" style={{ fontWeight: selectedStreamId === stream.id ? '700' : '400', color: selectedStreamId === stream.id ? colors.brand.primary : colors.textPrimary }}>
                {stream.grades?.name} · {stream.name}
              </ThemedText>
              {selectedStreamId === stream.id && <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={handleConvert}
          disabled={!selectedStreamId || convertMutation.isPending}
          style={[
            styles.convertConfirmBtn,
            { backgroundColor: selectedStreamId && !convertMutation.isPending ? Colors.semantic.success : colors.border },
          ]}
        >
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
            {convertMutation.isPending ? 'Creating…' : 'Confirm Enrollment'}
          </ThemedText>
        </TouchableOpacity>
      </BottomSheet>
    </SafeAreaView>
  );
}

function InfoLine({ icon, text, colors }: { icon: string; text: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <Ionicons name={icon as any} size={14} color={colors.textMuted} />
      <ThemedText variant="bodySm" color="secondary">{text}</ThemedText>
    </View>
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
  scroll: { padding: Spacing.base, gap: Spacing.base, paddingBottom: 40 },
  infoCard: {
    padding: Spacing.base,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  notesCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    ...Shadow.sm,
  },
  convertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  sectionLabel: { fontSize: 10, letterSpacing: 0.5, marginTop: Spacing.sm },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  noteDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  addNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    ...Shadow.sm,
  },
  noteInput: { flex: 1, fontSize: 14, lineHeight: 20, maxHeight: 80 },
  noteSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  streamOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  convertConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
  },
});
