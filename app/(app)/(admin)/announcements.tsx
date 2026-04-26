/**
 * Admin — Announcements
 * Compose + target + manage announcements.
 * Long-press any row to delete.
 */
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  TextInput, Switch, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import {
  ThemedText, FAB, BottomSheet, Skeleton, EmptyState, ErrorState, ScreenHeader,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { Colors } from '../../../constants/Colors';
import { haptics } from '../../../lib/haptics';
import {
  useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement,
  sendAnnouncementPush, type AnnouncementAudience, type Announcement,
} from '../../../hooks/useAnnouncements';

const AUDIENCE_META: Record<AnnouncementAudience, { label: string; color: string; icon: string }> = {
  school: { label: 'Whole School', color: Colors.semantic.info,    icon: 'school-outline' },
  grade:  { label: 'Grade',        color: '#8B5CF6',               icon: 'layers-outline' },
  stream: { label: 'Stream',       color: Colors.semantic.success, icon: 'people-outline' },
  role:   { label: 'By Role',      color: Colors.semantic.warning, icon: 'person-outline' },
};

const ROLE_OPTIONS = ['admin','principal','coordinator','hrt','st','parent','finance','front_desk'];

function AnnouncementCard({ item, colors, onDelete }: { item: Announcement; colors: any; onDelete: () => void }) {
  const meta = AUDIENCE_META[item.audience_type] ?? AUDIENCE_META.school;
  return (
    <TouchableOpacity
      onLongPress={onDelete}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {item.is_pinned && (
        <View style={[styles.pinnedBadge, { backgroundColor: Colors.semantic.warning + '20' }]}>
          <Ionicons name="pin" size={10} color={Colors.semantic.warning} />
          <ThemedText variant="caption" style={{ color: Colors.semantic.warning, fontSize: 10, fontWeight: '700' }}>PINNED</ThemedText>
        </View>
      )}
      <View style={styles.cardRow}>
        <View style={[styles.audIcon, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>{item.title}</ThemedText>
          <ThemedText variant="caption" color="muted" numberOfLines={2}>{item.body}</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <View style={[styles.audBadge, { backgroundColor: meta.color + '15' }]}>
              <ThemedText variant="caption" style={{ color: meta.color, fontSize: 10, fontWeight: '700' }}>
                {item.audience_label ?? meta.label}
              </ThemedText>
            </View>
            <ThemedText variant="caption" color="muted">
              {format(parseISO(item.published_at), 'dd MMM yyyy, HH:mm')}
            </ThemedText>
            {item.author_name && (
              <ThemedText variant="caption" color="muted">· {item.author_name}</ThemedText>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AnnouncementsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const { data: items = [], isLoading, isError, refetch } = useAnnouncements(schoolId);
  const createMutation = useCreateAnnouncement();
  const deleteMutation = useDeleteAnnouncement(schoolId);

  const [sheetVisible, setSheetVisible] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<AnnouncementAudience>('school');
  const [audienceRole, setAudienceRole] = useState('parent');
  const [isPinned, setIsPinned] = useState(false);
  const [sendPush, setSendPush] = useState(true);

  const resetForm = useCallback(() => {
    setTitle(''); setBody(''); setAudienceType('school'); setAudienceRole('parent');
    setIsPinned(false); setSendPush(true);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !body.trim()) return;
    await createMutation.mutateAsync({
      school_id: schoolId,
      author_id: user?.id ?? '',
      title: title.trim(),
      body: body.trim(),
      audience_type: audienceType,
      audience_role: audienceType === 'role' ? audienceRole : null,
      is_pinned: isPinned,
    });
    haptics.success();
    if (sendPush) {
      sendAnnouncementPush({
        school_id: schoolId,
        title: title.trim(),
        body: body.trim(),
        audience_type: audienceType,
        audience_role: audienceType === 'role' ? audienceRole : null,
      });
    }
    setSheetVisible(false);
    resetForm();
  }, [title, body, audienceType, audienceRole, isPinned, sendPush, schoolId, user?.id, createMutation, resetForm]);

  const handleDelete = useCallback((item: Announcement) => {
    Alert.alert('Delete Announcement', `Remove "${item.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);
  }, [deleteMutation]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ErrorState title="Could not load announcements" description="Check connection and try again." onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Announcements" showBack />

      {isLoading ? (
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={90} radius={Radius.lg} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description="Tap + to compose and send an announcement to the whole school or specific groups."
          icon="megaphone-outline"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AnnouncementCard item={item} colors={colors} onDelete={() => handleDelete(item)} />
          )}
        />
      )}

      <FAB
        icon={<Ionicons name="add" size={24} color="#fff" />}
        onPress={() => { haptics.medium(); setSheetVisible(true); }}
      />

      {/* Compose sheet */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => { setSheetVisible(false); resetForm(); }}
        title="New Announcement"
        snapHeight={640}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, paddingBottom: 40 }}>
          {/* Title */}
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>TITLE</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Announcement title…"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            />
          </View>

          {/* Body */}
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>MESSAGE</ThemedText>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write your announcement here…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.textPrimary, minHeight: 90, textAlignVertical: 'top' }]}
            />
          </View>

          {/* Audience */}
          <View>
            <ThemedText variant="label" color="muted" style={styles.fieldLabel}>AUDIENCE</ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
              {(Object.keys(AUDIENCE_META) as AnnouncementAudience[]).map((aud) => {
                const meta = AUDIENCE_META[aud];
                const active = audienceType === aud;
                return (
                  <TouchableOpacity
                    key={aud}
                    onPress={() => setAudienceType(aud)}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? meta.color + '18' : colors.surfaceSecondary, borderColor: active ? meta.color : colors.border },
                    ]}
                  >
                    <Ionicons name={meta.icon as any} size={12} color={active ? meta.color : colors.textMuted} />
                    <ThemedText variant="caption" style={{ marginLeft: 4, color: active ? meta.color : colors.textMuted, fontWeight: active ? '700' : '400', fontSize: 11 }}>
                      {meta.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Role picker — only when audience = role */}
          {audienceType === 'role' && (
            <View>
              <ThemedText variant="label" color="muted" style={styles.fieldLabel}>ROLE</ThemedText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                {ROLE_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setAudienceRole(r)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: audienceRole === r ? colors.brand.primary + '18' : colors.surfaceSecondary,
                        borderColor: audienceRole === r ? colors.brand.primary : colors.border,
                      },
                    ]}
                  >
                    <ThemedText variant="caption" style={{ color: audienceRole === r ? colors.brand.primary : colors.textMuted, fontWeight: audienceRole === r ? '700' : '400', fontSize: 11 }}>
                      {r.toUpperCase()}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Toggles */}
          <View style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>Pin announcement</ThemedText>
              <ThemedText variant="caption" color="muted">Show at top of feed for all recipients</ThemedText>
            </View>
            <Switch value={isPinned} onValueChange={setIsPinned} trackColor={{ true: colors.brand.primary }} />
          </View>

          <View style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodySm" style={{ fontWeight: '600' }}>Send push notification</ThemedText>
              <ThemedText variant="caption" color="muted">Alert recipients immediately</ThemedText>
            </View>
            <Switch value={sendPush} onValueChange={setSendPush} trackColor={{ true: colors.brand.primary }} />
          </View>

          <TouchableOpacity
            onPress={handleCreate}
            disabled={!title.trim() || !body.trim() || createMutation.isPending}
            style={[
              styles.saveBtn,
              { backgroundColor: title.trim() && body.trim() && !createMutation.isPending ? colors.brand.primary : colors.border },
            ]}
          >
            <ThemedText variant="body" style={{ color: '#fff', fontWeight: '700' }}>
              {createMutation.isPending ? 'Publishing…' : 'Publish Announcement'}
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>
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
  list: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 100 },
  card: {
    borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md, gap: Spacing.sm,
  },
  cardRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  audIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  audBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, marginBottom: 4 },
  fieldLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  saveBtn: { alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
});
