/**
 * FastList — drop-in FlatList replacement powered by @shopify/flash-list.
 *
 * Why: 5-10× scroll perf vs FlatList on long lists, lower memory, smoother
 * Android performance, especially on mid-tier devices.
 *
 * Usage:
 *   import { FastList } from '../../../components/ui';
 *   <FastList data={...} renderItem={...} keyExtractor={...} />
 *
 * The API matches the FlatList subset we use across the app. For unique
 * FlashList features (masonry, sticky headers in v2+) import directly.
 */
import React from 'react';
import { FlashList, FlashListProps } from '@shopify/flash-list';

// Re-export typed props so callers can `FastListProps<T>`
export type FastListProps<T> = FlashListProps<T>;

/**
 * Pass-through component. FlashList 2.x auto-estimates item size, so no
 * required props beyond `data` + `renderItem`.
 */
export function FastList<T>(props: FastListProps<T>) {
  return <FlashList<T> {...props} />;
}
