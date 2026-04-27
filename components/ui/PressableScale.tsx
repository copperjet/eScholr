import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Resting -> pressed scale. Default 0.97 */
  scaleTo?: number;
  /** Whether to trigger light haptic on press in. Default true */
  haptic?: boolean;
  /** Pressed opacity. Default 1 (don't dim). */
  dimTo?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Reusable pressable with a smooth spring scale + optional dim.
 * Drop-in replacement for Pressable when you want premium press feedback.
 */
export function PressableScale({
  scaleTo = 0.97,
  haptic = true,
  dimTo = 1,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (disabled) return;
    scale.value = withSpring(scaleTo, { damping: 18, stiffness: 350, mass: 0.6 });
    if (dimTo !== 1) opacity.value = withTiming(dimTo, { duration: 80 });
    if (haptic) haptics.light();
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 14, stiffness: 280, mass: 0.6 });
    if (dimTo !== 1) opacity.value = withTiming(1, { duration: 120 });
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      style={[animatedStyle, style as any]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
