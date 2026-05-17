import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../lib/theme';
import { useAuthStore } from '../../../stores/authStore';
import { usePatronSearch } from '../../../hooks/useLibrary';
import {
  ThemedText, ScreenHeader, SearchBar, ListItem, EmptyState, Button, Skeleton,
} from '../../../components/ui';
import { Spacing } from '../../../constants/Typography';

export default function PatronsScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const schoolId = user?.schoolId ?? '';

  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'staff' | 'student'>('all');

  const { data: patrons, isLoading } = usePatronSearch(schoolId, query, type);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Patrons" showBack />

      <View style={{ paddingHorizontal: Spacing.screen }}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
          {(['all', 'student', 'staff'] as const).map((t) => (
            <Button
              key={t}
              label={t === 'all' ? 'All' : t === 'student' ? 'Students' : 'Staff'}
              variant={type === t ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => setType(t)}
            />
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: Spacing.screen }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search patrons by name..."
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {query.length < 2 ? (
          <EmptyState title="Search for a patron" description="Type at least 2 characters to search staff and students." />
        ) : isLoading ? (
          <View style={{ padding: Spacing.screen }}>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} style={{ marginBottom: Spacing.sm, borderRadius: 12 }} />)}
          </View>
        ) : (patrons ?? []).length === 0 ? (
          <EmptyState title="No patrons found" description="Try a different search term." />
        ) : (
          (patrons ?? []).map((p) => (
            <ListItem
              key={`${p.type}-${p.id}`}
              title={p.full_name}
              subtitle={`${p.type === 'staff' ? 'Staff' : 'Student'} · ${p.identifier}`}
              leading={<Ionicons name={p.type === 'staff' ? 'person' : 'school'} size={20} color={colors.brand.primary} />}
              showChevron
              onPress={() => router.push({
                pathname: '/(app)/(librarian)/patron-detail' as any,
                params: { patronId: p.id, patronType: p.type, patronName: p.full_name },
              })}
            />
          ))
        )}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
