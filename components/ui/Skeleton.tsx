import React, { useEffect } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';
import { Radius, Spacing } from '../../constants/Typography';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/**
 * Premium skeleton: a darker shimmer band sweeps across a tinted track.
 * Pure UI-thread animation — no setState churn.
 */
export function Skeleton({ width = '100%', height = 16, radius = Radius.md, style }: SkeletonProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    // Translate the shimmer band from -100% to +200% of the container width.
    // We use translateX as a percentage proxy by leaning on a fixed band width.
    const tx = interpolate(progress.value, [0, 1], [-1.0, 2.0]);
    return {
      transform: [{ translateX: `${tx * 100}%` as any }],
      opacity: interpolate(progress.value, [0, 0.5, 1], [0, 1, 0]),
    };
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceTertiary,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View style={[styles.shimmer, { backgroundColor: colors.surfaceSecondary }, shimmerStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: '60%',
    opacity: 0.9,
  },
});

export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '55%' : '100%'} height={14} />
      ))}
    </View>
  );
}

// Pre-built composite skeletons
export function ListItemSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md }}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={{ flex: 1, gap: Spacing.sm }}>
        <Skeleton width="65%" height={14} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

export function StatCardSkeleton() {
  return (
    <View style={{ gap: Spacing.sm, padding: Spacing.base }}>
      <Skeleton width={36} height={36} radius={10} />
      <Skeleton width="50%" height={22} />
      <Skeleton width="70%" height={13} />
    </View>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ gap: Spacing.sm, padding: Spacing.base }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '45%' : '100%'} height={14} />
      ))}
    </View>
  );
}
