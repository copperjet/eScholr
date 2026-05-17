import React from 'react';
import { View, ViewStyle } from 'react-native';
import { FadeIn } from './FadeIn';

interface StaggerProps {
  /** Delay added per child, ms. */
  gap?: number;
  /** Delay before the first child animates, ms. */
  initialDelay?: number;
  /** Scale each child animates up from. */
  scaleFrom?: number;
  /** Lay children out in a row instead of a column. */
  horizontal?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

/**
 * Reveals children one after another with a fade + lift + subtle scale.
 * Wrap dashboard stat rows or quick-action grids for a polished entrance.
 */
export function Stagger({
  gap = 70,
  initialDelay = 0,
  scaleFrom = 0.96,
  horizontal = false,
  style,
  children,
}: StaggerProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[horizontal && { flexDirection: 'row' }, style]}>
      {items.map((child, i) => (
        <FadeIn
          key={(child as any)?.key ?? i}
          delay={initialDelay + i * gap}
          distance={10}
          scaleFrom={scaleFrom}
          style={horizontal ? { flex: 1 } : undefined}
        >
          {child}
        </FadeIn>
      ))}
    </View>
  );
}
