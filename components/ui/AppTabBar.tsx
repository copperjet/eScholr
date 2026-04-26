/**
 * Floating pill tab bar — drop-in for all role layouts.
 * Usage: pass as tabBar prop to <Tabs>.
 *
 * <Tabs tabBar={(props) => <AppTabBar {...props} />} ...>
 */
import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ThemedText } from './ThemedText';
import { useTheme } from '../../lib/theme';
import { Radius, Shadow, Spacing } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();

  // Only render visible (non-href:null) routes
  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    // Expo Router sets href:null for hidden screens; tabBarButton can also suppress rendering
    return (options as any).href !== null && options.tabBarButton !== (() => null);
  });

  if (visibleRoutes.length === 0) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={[styles.pill, { backgroundColor: colors.surface }, Shadow.lg]}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.index === state.routes.indexOf(route);
          const icon = options.tabBarIcon?.({ focused, color: focused ? colors.brand.primary : colors.icon, size: 22 });
          const label = typeof options.title === 'string' ? options.title : route.name;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                haptics.light();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
            >
              <View style={[styles.iconWrap, focused && { backgroundColor: colors.brand.primarySoft }]}>
                {icon}
              </View>
              {focused && (
                <ThemedText style={[styles.label, { color: colors.brand.primary }]} numberOfLines={1}>
                  {label}
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: Spacing['2xl'],
    right: Spacing['2xl'],
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    alignSelf: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 80,
  },
});
