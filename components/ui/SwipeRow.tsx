import React, { useRef } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { Spacing } from '../../constants/Typography';
import { haptics } from '../../lib/haptics';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export interface SwipeAction {
  label: string;
  icon?: IoniconsName;
  /** Background color of the action button. */
  color: string;
  /** Foreground color for icon + label. Defaults to white. */
  textColor?: string;
  onPress: () => void;
}

interface SwipeRowProps {
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  children: React.ReactNode;
}

function ActionGroup({
  actions,
  onFire,
}: {
  actions: SwipeAction[];
  onFire: () => void;
}) {
  return (
    <View style={styles.actionRow}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={() => { onFire(); a.onPress(); }}
          style={[styles.action, { backgroundColor: a.color }]}
          accessibilityRole="button"
          accessibilityLabel={a.label}
        >
          {a.icon ? (
            <Ionicons name={a.icon} size={18} color={a.textColor ?? '#FFFFFF'} />
          ) : null}
          <ThemedText style={[styles.actionLabel, { color: a.textColor ?? '#FFFFFF' }]}>
            {a.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Wraps a row with swipe-to-reveal actions on mobile. On web, where
 * `Swipeable` is unreliable, it renders children unchanged.
 */
export function SwipeRow({ leftActions, rightActions, children }: SwipeRowProps) {
  const ref = useRef<Swipeable>(null);

  if (Platform.OS === 'web' || (!leftActions?.length && !rightActions?.length)) {
    return <>{children}</>;
  }

  const close = () => ref.current?.close();

  return (
    <Swipeable
      ref={ref}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.medium()}
      renderLeftActions={
        leftActions?.length
          ? () => <ActionGroup actions={leftActions} onFire={close} />
          : undefined
      }
      renderRightActions={
        rightActions?.length
          ? () => <ActionGroup actions={rightActions} onFire={close} />
          : undefined
      }
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
  },
  action: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
