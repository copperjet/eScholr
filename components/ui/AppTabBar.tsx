/**
 * Floating pill tab bar — drop-in for all role layouts.
 * Usage: pass as tabBar prop to <Tabs>.
 *
 * <Tabs tabBar={(props) => <AppTabBar {...props} />} ...>
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ThemedText } from './ThemedText';
import { PressableScale } from './PressableScale';
import { useTheme } from '../../lib/theme';
import { Radius, Shadow, Spacing } from '../../constants/Typography';

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();

  // Only render visible (non-href:null) routes
  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    // Expo Router sets href:null for hidden screens
    if ((options as any).href === null) return false;
    // tabBarButton returning null also hides the tab
    if (options.tabBarButton) {
      try { const result = (options.tabBarButton as any)({}); if (result === null) return false; } catch {}
    }
    return true;
  });

  if (visibleRoutes.length === 0) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Animated.View
        layout={LinearTransition.springify().damping(22).stiffness(220)}
        style={[styles.pill, { backgroundColor: colors.surface }, Shadow.lg]}
      >
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = state.index === state.routes.indexOf(route);
          const icon = options.tabBarIcon?.({ focused, color: focused ? colors.brand.primary : colors.icon, size: 22 });
          const label = typeof options.title === 'string' ? options.title : route.name;

          return (
            <PressableScale
              key={route.key}
              scaleTo={0.92}
              haptic={!focused}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
            >
              <Animated.View
                layout={LinearTransition.springify().damping(20).stiffness(220)}
                style={[styles.iconWrap, focused && { backgroundColor: colors.brand.primarySoft }]}
              >
                {icon}
              </Animated.View>
              {focused && (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(140)}
                  layout={LinearTransition.springify().damping(20).stiffness(220)}
                >
                  <ThemedText style={[styles.label, { color: colors.brand.primary }]} numberOfLines={1}>
                    {label}
                  </ThemedText>
                </Animated.View>
              )}
            </PressableScale>
          );
        })}
      </Animated.View>
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
