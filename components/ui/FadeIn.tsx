import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface FadeInProps {
  /** Delay before animating in, ms. Useful for staggering. */
  delay?: number;
  /** Duration of the fade/translate animation, ms. */
  duration?: number;
  /** Y-offset to translate from. Negative goes up, positive goes down. */
  from?: 'up' | 'down' | 'none';
  /** Distance in px the element travels. Default 12. */
  distance?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

/**
 * Subtle entrance animation: fade + small translate.
 *
 * Use to give screens, cards, and list sections a polished entrance.
 * Pair with the `delay` prop for staggered reveals.
 */
export function FadeIn({
  delay = 0,
  duration = 380,
  from = 'up',
  distance = 12,
  style,
  children,
}: FadeInProps) {
  const opacity = useSharedValue(0);
  const translate = useSharedValue(from === 'none' ? 0 : (from === 'up' ? distance : -distance));

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    opacity.value = withDelay(delay, withTiming(1, { duration, easing }));
    translate.value = withDelay(delay, withTiming(0, { duration, easing }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  return <Animated.View style={[animatedStyle, style as any]}>{children}</Animated.View>;
}
