import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../lib/theme';
import { useAuthStore } from '../../../../stores/authStore';
import {
  ThemedText, ScreenHeader, FAB, BottomSheet, FormField,
  Button, Badge, EmptyState, ErrorState,
  ListItemSkeleton, SearchBar, Chip,
  FastList, ToggleRow,
} from '../../../../components/ui';
import { Spacing, Radius } from '../../../../constants/Typography';
import { haptics } from '../../../../lib/haptics';
import {
  useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom,
  type Room, type RoomType,
} from '../../../../hooks/useTimetableBuilder';

const ROOM_TYPES: RoomType[] = ['classroom', 'lab', 'computer_lab', 'hall', 'library', 'sports', 'other'];
const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  classroom: 'Classroom', lab: 'Lab', computer_lab: 'Computer Lab',
  hall: 'Hall', library: 'Library', sports: 'Sports', other: 'Other',
};
const ROOM_TYPE_COLORS: Record<RoomType, { bg: string; fg: string }> = {
  classroom:    { bg: '#DBEAFE', fg: '#1D4ED8' },
  lab:          { bg: '#D1FAE5', fg: '#065F46' },
  computer_lab: { bg: '#EDE9FE', fg: '#5B21B6' },
  hall:         { bg: '#FEF3C7', fg: '#92400E' },
  library:      { bg: '#FCE7F3', fg: '#9D174D' },
  sports:       { bg: '#DCFCE7', fg: '#15803D' },
  other:        { bg: '#F3F4F6', fg: '#374151' },
};

interface RoomForm {
  code: string;
  name: string;
  room_type: RoomType;
  capacity: string;
  building: string;
  floor: string;
  is_active: boolean;
}

const emptyForm = (): RoomForm => ({
  code: '', name: '', room_type: 'classroom',
  capacity: '', building: '', floor: '', is_active: true,
});

export default function RoomsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';

  const roomsQuery = useRooms(sid);
  const createRoom  = useCreateRoom();
  const updateRoom  = useUpdateRoom();
  const deleteRoom  = useDeleteRoom();

  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<RoomType | 'all'>('all');
  const [sheet, setSheet]           = useState(false);
  const [editing, setEditing]       = useState<Room | null>(null);
  const [form, setForm]             = useState<RoomForm>(emptyForm());
  const [formError, setFormError]   = useState<Partial<Record<keyof RoomForm, string>>>({});

  const filtered = useMemo(() => {
    let list = roomsQuery.data ?? [];
    if (typeFilter !== 'all') list = list.filter((r) => r.room_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    }
    return list;
  }, [roomsQuery.data, typeFilter, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError({});
    setSheet(true);
  };

  const openEdit = (room: Room) => {
    setEditing(room);
    setForm({
      code: room.code, name: room.name, room_type: room.room_type,
      capacity: room.capacity != null ? String(room.capacity) : '',
      building: room.building ?? '', floor: room.floor ?? '',
      is_active: room.is_active,
    });
    setFormError({});
    setSheet(true);
  };

  const validate = (): boolean => {
    const errs: typeof formError = {};
    if (!form.code.trim()) errs.code = 'Required';
    if (!form.name.trim()) errs.name = 'Required';
    if (form.capacity && isNaN(Number(form.capacity))) errs.capacity = 'Must be a number';
    setFormError(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const payload = {
        school_id: sid,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        room_type: form.room_type,
        capacity: form.capacity ? Number(form.capacity) : null,
        building: form.building.trim() || null,
        floor: form.floor.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        await updateRoom.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createRoom.mutateAsync(payload as any);
      }
      haptics.success();
      setSheet(false);
    } catch (err: any) {
      haptics.error();
      Alert.alert('Save failed', err.message ?? 'Unknown error');
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete Room', `Delete "${editing.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoom.mutateAsync({ id: editing.id, school_id: sid });
            haptics.success();
            setSheet(false);
          } catch (err: any) {
            haptics.error();
            Alert.alert('Delete failed', err.message ?? 'Unknown error');
          }
        },
      },
    ]);
  };

  const isBusy = createRoom.isPending || updateRoom.isPending || deleteRoom.isPending;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Rooms" showBack />

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by code or name…" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <Chip label="All" selected={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
        {ROOM_TYPES.map((t) => (
          <Chip key={t} label={ROOM_TYPE_LABELS[t]} selected={typeFilter === t} onPress={() => setTypeFilter(t)} />
        ))}
      </ScrollView>

      {roomsQuery.isLoading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => <ListItemSkeleton key={i} />)}
        </View>
      ) : roomsQuery.isError ? (
        <ErrorState description="Could not load rooms" onRetry={() => roomsQuery.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="business-outline" title="No rooms" description="Tap + to add a room." />
      ) : (
        <FastList
          data={filtered}
          keyExtractor={(r) => r.id}
          renderItem={({ item: room }) => {
            const tc = ROOM_TYPE_COLORS[room.room_type];
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openEdit(room)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.rowHeader}>
                    <ThemedText style={styles.rowCode}>{room.code}</ThemedText>
                    <Badge
                      label={ROOM_TYPE_LABELS[room.room_type]}
                      bg={tc.bg}
                      fg={tc.fg}
                    />
                    {!room.is_active && (
                      <Badge label="Inactive" bg="#F3F4F6" fg="#9CA3AF" />
                    )}
                  </View>
                  <ThemedText variant="bodySm" color="secondary">{room.name}</ThemedText>
                  {(room.building || room.capacity) && (
                    <View style={styles.rowMeta}>
                      {room.building ? (
                        <View style={styles.metaItem}>
                          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                          <ThemedText variant="caption" color="muted">{room.building}{room.floor ? `, Fl. ${room.floor}` : ''}</ThemedText>
                        </View>
                      ) : null}
                      {room.capacity ? (
                        <View style={styles.metaItem}>
                          <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                          <ThemedText variant="caption" color="muted">{room.capacity}</ThemedText>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
                <Ionicons
                  name="chevron-forward-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.list}
        />
      )}

      <FAB icon="add-outline" label="Add Room" onPress={openAdd} />

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={editing ? 'Edit Room' : 'Add Room'}
        snapHeight={560}
      >
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <FormField
            label="Code *"
            value={form.code}
            onChangeText={(v) => setForm((f) => ({ ...f, code: v }))}
            placeholder="e.g. A101"
            autoCapitalize="characters"
            error={formError.code}
          />
          <FormField
            label="Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="e.g. Main Hall"
            error={formError.name}
          />

          <ThemedText style={styles.fieldLabel}>Room Type</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
            {ROOM_TYPES.map((t) => (
              <Chip
                key={t}
                label={ROOM_TYPE_LABELS[t]}
                selected={form.room_type === t}
                onPress={() => setForm((f) => ({ ...f, room_type: t }))}
              />
            ))}
          </ScrollView>

          <FormField
            label="Capacity"
            value={form.capacity}
            onChangeText={(v) => setForm((f) => ({ ...f, capacity: v }))}
            placeholder="e.g. 40"
            keyboardType="number-pad"
            error={formError.capacity}
          />
          <FormField
            label="Building"
            value={form.building}
            onChangeText={(v) => setForm((f) => ({ ...f, building: v }))}
            placeholder="e.g. Block A"
          />
          <FormField
            label="Floor"
            value={form.floor}
            onChangeText={(v) => setForm((f) => ({ ...f, floor: v }))}
            placeholder="e.g. Ground"
          />
          <ToggleRow
            label="Active"
            description="Inactive rooms are excluded from scheduling"
            value={form.is_active}
            onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
          />

          <View style={styles.sheetActions}>
            <Button
              label={isBusy ? 'Saving…' : editing ? 'Save Changes' : 'Add Room'}
              onPress={handleSave}
              disabled={isBusy}
            />
            {editing && (
              <Button
                label="Delete Room"
                variant="ghost"
                onPress={handleDelete}
                disabled={isBusy}
              />
            )}
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: 'row',
  },
  skeletons: { padding: Spacing.base, gap: Spacing.sm },
  list: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  rowLeft: { flex: 1, gap: 4 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  rowCode: { fontSize: 15, fontWeight: '700' },
  rowMeta: { flexDirection: 'row', gap: Spacing.md, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sheetContent: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 40 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  typeRow: { gap: Spacing.sm, paddingVertical: Spacing.xs, flexDirection: 'row' },
  sheetActions: { gap: Spacing.sm, marginTop: Spacing.sm },
});
