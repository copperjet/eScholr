/**
 * Platform Admin — Broadcast Notification
 * Send a push + in-app notification to all users in one school or all schools.
 */
import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase';
import { ThemedText, StatCard } from '../../../components/ui';
import { Spacing, Radius, Shadow } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';

type Audience = 'all' | 'staff' | 'parents';

const AUDIENCE_OPTIONS: { value: Audience; label: string; icon: string }[] = [
  { value: 'all',     label: 'All Users',    icon: 'people' },
  { value: 'staff',   label: 'Staff Only',   icon: 'briefcase' },
  { value: 'parents', label: 'Parents Only', icon: 'people-circle' },
];

function useSchools() {
  return useQuery({
    queryKey: ['platform-schools-broadcast'],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('schools')
        .select('id, name, subscription_status')
        .order('name');
      return (data ?? []) as { id: string; name: string; subscription_status: string }[];
    },
  });
}

export default function BroadcastScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();

  const [schoolId, setSchoolId]     = useState<string | null>(null); // null = all schools
  const [audience, setAudience]     = useState<Audience>('all');
  const [title, setTitle]           = useState('');
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);

  const { data: schools = [] } = useSchools();
  const selectedSchool = schools.find((s) => s.id === schoolId);

  const canSend = title.trim().length > 0 && message.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;

    const target = selectedSchool ? `"${selectedSchool.name}"` : 'ALL schools';
    const audienceLabel = AUDIENCE_OPTIONS.find((a) => a.value === audience)?.label ?? audience;

    Alert.alert(
      'Send Broadcast?',
      `Send "${title}" to ${audienceLabel} at ${target}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'default', onPress: doSend },
      ],
    );
  };

  const doSend = async () => {
    setSending(true);
    haptics.medium();
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const body: Record<string, any> = {
        title: title.trim(),
        body: message.trim(),
        trigger_event: 'app_update',
        audience,
      };

      if (schoolId) {
        // Send to specific school
        body.type = 'school';
        body.school_id = schoolId;
        if (audience === 'staff') {
          body.type = 'role';
          body.roles = ['admin', 'school_super_admin', 'principal', 'coordinator', 'hod', 'hrt', 'st', 'finance', 'front_desk', 'hr'];
        }
      } else {
        // Platform-wide broadcast
        body.type = 'platform';
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-push`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(body),
        },
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Broadcast failed');

      haptics.success();
      Alert.alert(
        'Broadcast Sent',
        `Delivered to ${json.targeted ?? json.sent ?? 0} users.`,
        [{ text: 'OK', onPress: () => { setTitle(''); setMessage(''); } }],
      );
    } catch (e: any) {
      haptics.error();
      Alert.alert('Send Failed', e.message ?? 'Could not send broadcast.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText variant="h4" style={{ flex: 1, textAlign: 'center' }}>Broadcast Notification</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Target school */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>TARGET SCHOOL</ThemedText>
          <TouchableOpacity
            onPress={() => setShowSchoolPicker(!showSchoolPicker)}
            style={[styles.selector, { borderColor: colors.border, backgroundColor: colors.background }]}
          >
            <Ionicons name="business-outline" size={17} color={colors.brand.primary} />
            <ThemedText variant="body" style={{ flex: 1, marginLeft: 8, color: colors.textPrimary }}>
              {selectedSchool?.name ?? 'All Schools (Platform-wide)'}
            </ThemedText>
            <Ionicons name={showSchoolPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {showSchoolPicker && (
            <View style={{ marginTop: Spacing.sm, gap: Spacing.xs }}>
              <TouchableOpacity
                onPress={() => { setSchoolId(null); setShowSchoolPicker(false); }}
                style={[styles.schoolOption, { backgroundColor: !schoolId ? colors.brand.primary + '14' : colors.background, borderColor: !schoolId ? colors.brand.primary : colors.border }]}
              >
                <Ionicons name="globe-outline" size={16} color={!schoolId ? colors.brand.primary : colors.textSecondary} />
                <ThemedText variant="bodySm" style={{ marginLeft: 8, color: !schoolId ? colors.brand.primary : colors.textPrimary, fontWeight: !schoolId ? '700' : '400' }}>
                  All Schools
                </ThemedText>
                {!schoolId && <Ionicons name="checkmark" size={14} color={colors.brand.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {schools.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => { setSchoolId(s.id); setShowSchoolPicker(false); }}
                  style={[styles.schoolOption, { backgroundColor: schoolId === s.id ? colors.brand.primary + '14' : colors.background, borderColor: schoolId === s.id ? colors.brand.primary : colors.border }]}
                >
                  <Ionicons name="business-outline" size={16} color={schoolId === s.id ? colors.brand.primary : colors.textSecondary} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText variant="bodySm" style={{ color: schoolId === s.id ? colors.brand.primary : colors.textPrimary, fontWeight: schoolId === s.id ? '700' : '400' }}>
                      {s.name}
                    </ThemedText>
                    <ThemedText variant="caption" color="muted" style={{ textTransform: 'capitalize' }}>{s.subscription_status}</ThemedText>
                  </View>
                  {schoolId === s.id && <Ionicons name="checkmark" size={14} color={colors.brand.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Audience */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>AUDIENCE</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {AUDIENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setAudience(opt.value)}
                style={[
                  styles.audienceChip,
                  { backgroundColor: audience === opt.value ? colors.brand.primary : colors.background, borderColor: audience === opt.value ? colors.brand.primary : colors.border },
                ]}
              >
                <Ionicons name={opt.icon as any} size={14} color={audience === opt.value ? '#fff' : colors.textSecondary} />
                <ThemedText variant="caption" style={{ color: audience === opt.value ? '#fff' : colors.textSecondary, fontWeight: '600', marginLeft: 4 }}>
                  {opt.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Message compose */}
        <View style={[styles.card, { backgroundColor: colors.surface }, Shadow.sm]}>
          <ThemedText variant="label" color="muted" style={styles.sectionLabel}>MESSAGE</ThemedText>

          <ThemedText variant="caption" color="muted" style={{ marginBottom: 4 }}>Title</ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. System Maintenance"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
          />
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'right', marginBottom: Spacing.md }}>{title.length}/100</ThemedText>

          <ThemedText variant="caption" color="muted" style={{ marginBottom: 4 }}>Message</ThemedText>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Write your message here…"
            placeholderTextColor={colors.textMuted}
            maxLength={300}
            multiline
            numberOfLines={4}
            style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
          />
          <ThemedText variant="caption" color="muted" style={{ textAlign: 'right' }}>{message.length}/300</ThemedText>
        </View>

        {/* Preview */}
        {(title || message) ? (
          <View style={[styles.card, { backgroundColor: colors.brand.primary + '08', borderWidth: 1, borderColor: colors.brand.primary + '30' }]}>
            <ThemedText variant="label" color="muted" style={styles.sectionLabel}>PREVIEW</ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="notifications" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="bodySm" style={{ fontWeight: '700' }}>{title || '(no title)'}</ThemedText>
                <ThemedText variant="caption" color="muted" style={{ marginTop: 2 }}>{message || '(no message)'}</ThemedText>
              </View>
            </View>
          </View>
        ) : null}

        {/* Send button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend || sending}
          style={[styles.sendBtn, { backgroundColor: canSend && !sending ? colors.brand.primary : colors.border }]}
        >
          <Ionicons name="send" size={18} color="#fff" />
          <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>
            {sending ? 'Sending…' : 'Send Broadcast'}
          </ThemedText>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm,
  },
  scroll: { padding: Spacing.base, gap: Spacing.base },
  card: { borderRadius: Radius.lg, padding: Spacing.base },
  sectionLabel: { marginBottom: Spacing.sm, fontSize: 11, letterSpacing: 0.5 },
  selector: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  schoolOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  audienceChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md,
    padding: Spacing.md, fontSize: 15, marginBottom: Spacing.xs,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md + 2, borderRadius: Radius.lg,
  },
});
