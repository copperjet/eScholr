import React, { useEffect } from 'react';
import { TextStyle, TextInput, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedNumberProps {
  /** Target numeric value. */
  value: number;
  /** Animation duration in ms. Default 700. */
  duration?: number;
  /** Decimal places to render. Default 0. */
  decimals?: number;
  /** Optional prefix (e.g. "$"). */
  prefix?: string;
  /** Optional suffix (e.g. "%"). */
  suffix?: string;
  /** Style merged with the underlying text. */
  style?: TextStyle | TextStyle[];
  /** Override text color (defaults to theme primary). */
  color?: string;
}

/**
 * Smoothly counts up/down to a numeric value on the UI thread.
 *
 * Uses an uneditable AnimatedTextInput because Reanimated supports
 * driving its `text` prop natively without crossing the JS bridge
 * every frame.
 */
export function AnimatedNumber({
  value,
  duration = 700,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
  color,
}: AnimatedNumberProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(value);

  useEffect(() => {
    progress.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => {
    const v = progress.value;
    const formatted = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    return { text: `${prefix}${formatted}${suffix}` } as any;
  });

  const initial = `${prefix}${decimals > 0 ? value.toFixed(decimals) : Math.round(value)}${suffix}`;

  return (
    <AnimatedTextInput
      editable={false}
      // Ensure no keyboard / focus accessibility
      pointerEvents="none"
      // Provide initial value so first frame isn't blank
      defaultValue={initial}
      animatedProps={animatedProps}
      style={[
        styles.input,
        { color: color ?? colors.textPrimary },
        style as any,
      ]}
      underlineColorAndroid="transparent"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    padding: 0,
    margin: 0,
    // Strip native text-input chrome so it renders like plain text
    ...Platform.select({
      ios: { lineHeight: undefined },
      android: { includeFontPadding: false, textAlignVertical: 'center' },
    }),
  },
});
