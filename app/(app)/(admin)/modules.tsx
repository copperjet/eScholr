/**
 * School-side Modules viewer (read-only).
 * Shows school_super_admin/admin which modules their school has enabled.
 * Toggling not allowed — only platform super_admin can change modules.
 */
import React from 'react';
import { SafeAreaView, ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../lib/theme';
import {
  ThemedText, SectionHeader, ErrorState, CardSkeleton,
} from '../../../components/ui';
import { Spacing, Radius } from '../../../constants/Typography';
import { MODULES, MODULE_CATEGORIES } from '../../../lib/modules';
import { useSchoolModules } from '../../../hooks/useSchoolModules';
import { useAuthStore } from '../../../stores/authStore';

export default function SchoolModulesScreen() {
  const { colors } = useTheme();
  const { school } = useAuthStore();
  const { data: modules, isLoading, isError, refetch } = useSchoolModules();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Active Modules</ThemedText>
          {school && <ThemedText variant="caption" color="muted">{school.name}</ThemedText>}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {isError ? (
        <ErrorState
          title="Could not load modules"
          description="Check connection and try again."
          onRetry={refetch}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing['2xl'] }}>
          {/* Info banner */}
          <View style={[styles.banner, { backgroundColor: colors.brand.primary + '12', borderColor: colors.brand.primary + '30' }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.brand.primary} />
            <ThemedText style={{ flex: 1, fontSize: 13, color: colors.brand.primary, marginLeft: 8, lineHeight: 18 }}>
              Module access is managed by platform administrators. Contact support to request changes.
            </ThemedText>
          </View>

          {isLoading ? (
            <View style={{ padding: Spacing.screen, gap: Spacing.base }}>
              {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} lines={2} />)}
            </View>
          ) : (
            MODULE_CATEGORIES.map((cat) => {
              const catModules = MODULES.filter((m) => m.category === cat.id);
              return (
                <View key={cat.id}>
                  <SectionHeader title={cat.label} />
                  <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.sm }}>
                    {catModules.map((mod) => {
                      const enabled = modules?.[mod.key] ?? true;
                      return (
                        <View
                          key={mod.key}
                          style={[
                            styles.moduleRow,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              opacity: enabled ? 1 : 0.55,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.moduleIcon,
                              { backgroundColor: enabled ? colors.brand.primary + '15' : colors.border },
                            ]}
                          >
                            <Ionicons
                              name={mod.icon as any}
                              size={20}
                              color={enabled ? colors.brand.primary : colors.textMuted}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.moduleLabel}>{mod.label}</ThemedText>
                            <ThemedText variant="caption" color="muted" style={styles.moduleDesc}>
                              {mod.description}
                            </ThemedText>
                          </View>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: enabled ? '#16A34A20' : colors.border },
                            ]}
                          >
                            <ThemedText
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: enabled ? '#16A34A' : colors.textMuted,
                              }}
                            >
                              {enabled ? 'ACTIVE' : 'OFF'}
                            </ThemedText>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    margin: Spacing.screen,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.base,
  },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  moduleDesc: {
    marginTop: 2,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
});
