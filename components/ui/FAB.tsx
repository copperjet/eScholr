import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from './ThemedText';
import { PressableScale } from './PressableScale';
import { useTheme } from '../../lib/theme';
import { Shadow, Radius, Spacing } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

interface FABProps {
  icon: React.ReactNode;
  label?: string;
  onPress: () => void;
  style?: ViewStyle;
  color?: string;
  disabled?: boolean;
}

export function FAB({ icon, label, onPress, style, color, disabled }: FABProps) {
  const { colors } = useTheme();
  const bg = color ?? colors.brand.primary;

  // Entrance animation: scale + fade + lift in.
  const enterScale = useSharedValue(0.6);
  const enterOpacity = useSharedValue(0);
  const enterTranslate = useSharedValue(24);

  useEffect(() => {
    enterScale.value = withSpring(1, { damping: 14, stiffness: 220, mass: 0.7 });
    enterOpacity.value = withTiming(1, { duration: 220 });
    enterTranslate.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.7 });
  }, []);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [
      { translateY: enterTranslate.value },
      { scale: enterScale.value },
    ],
  }));

  return (
    <Animated.View style={[styles.fab, enterStyle, label ? styles.extended : styles.round, Shadow.lg, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}>
      <PressableScale
        scaleTo={0.94}
        haptic={false}
        onPress={() => { if (!disabled) { haptics.medium(); onPress(); } }}
        disabled={disabled}
        style={styles.inner}
      >
        {icon}
        {label && (
          <ThemedText style={{ color: '#fff', fontWeight: '600', fontSize: 15, marginLeft: Spacing.sm }}>
            {label}
          </ThemedText>
        )}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing['2xl'],
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  round: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  extended: {
    height: 52,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
  },
});
