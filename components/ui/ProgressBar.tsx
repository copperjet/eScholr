import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';
import { Radius } from '../../constants/Typography';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  style?: ViewStyle;
  animated?: boolean;
}

export function ProgressBar({ value, max = 100, color, height = 6, style, animated = true }: ProgressBarProps) {
  const { colors } = useTheme();
  const pct = Math.min(Math.max(value / max, 0), 1);
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(widthAnim, {
        toValue: pct,
        duration: 600,
        useNativeDriver: false,
      }).start();
    } else {
      widthAnim.setValue(pct);
    }
  }, [pct]);

  const barColor = color ?? (pct >= 0.85 ? colors.brand.primary : pct >= 0.5 ? '#F59E0B' : '#EF4444');

  return (
    <View style={[styles.track, { height, borderRadius: height, backgroundColor: colors.surfaceSecondary }, style]}>
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height,
            backgroundColor: barColor,
            width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
  fill: {},
});
