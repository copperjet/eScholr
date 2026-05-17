import React from 'react';
import { View, Pressable, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Spacing, Radius } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  /** 'underline' (default) or 'pill' */
  variant?: 'underline' | 'pill';
  style?: ViewStyle;
}

export function TabBar({ tabs, activeKey, onChange, variant = 'underline', style }: TabBarProps) {
  const { colors } = useTheme();

  if (variant === 'pill') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.pillRow, style]}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <Pressable
              key={tab.key}
              onPress={() => { haptics.light(); onChange(tab.key); }}
              style={[
                styles.pillTab,
                active
                  ? { backgroundColor: colors.brand.primary }
                  : { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: active ? colors.brand.onPrimary : colors.textMuted,
                }}
              >
                {tab.label}
              </ThemedText>
              {tab.count !== undefined && (
                <View
                  style={[
                    styles.pillCount,
                    { backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.surfaceTertiary },
                  ]}
                >
                  <ThemedText
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: active ? '#fff' : colors.textMuted,
                    }}
                  >
                    {tab.count}
                  </ThemedText>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  // Underline variant
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.underlineRow, style]}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => { haptics.light(); onChange(tab.key); }}
            style={[styles.underlineTab, active && { borderBottomColor: colors.brand.primary, borderBottomWidth: 2 }]}
          >
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: active ? '700' : '500',
                color: active ? colors.brand.primary : colors.textMuted,
              }}
            >
              {tab.label}
            </ThemedText>
            {tab.count !== undefined && (
              <View
                style={[
                  styles.underlineCount,
                  { backgroundColor: active ? colors.brand.primarySoft : colors.surfaceSecondary },
                ]}
              >
                <ThemedText style={{ fontSize: 10, fontWeight: '700', color: active ? colors.brand.primary : colors.textMuted }}>
                  {tab.count}
                </ThemedText>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screen,
    paddingVertical: Spacing.sm,
  },
  pillTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 1,
    borderRadius: Radius.full,
    gap: Spacing.xs,
  },
  pillCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  underlineRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screen,
  },
  underlineTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: Spacing.xs,
  },
  underlineCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
