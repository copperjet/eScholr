/**
 * Responsive layout utilities for cross-platform (mobile + web desktop)
 * Provides breakpoints, device type detection, and layout helpers
 */
import { useWindowDimensions, Platform } from 'react-native';
import { useMemo } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

// Breakpoints (in logical pixels)
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

/**
 * Hook to detect device type based on screen width
 * Returns 'mobile' | 'tablet' | 'desktop'
 */
export function useDeviceType(): DeviceType {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    if (width >= BREAKPOINTS.desktop) return 'desktop';
    if (width >= BREAKPOINTS.tablet) return 'tablet';
    return 'mobile';
  }, [width]);
}

/**
 * Hook to check if current layout should show sidebar
 * Sidebar appears on tablet+ in landscape, or always on desktop
 */
export function useShouldShowSidebar(): boolean {
  const { width, height } = useWindowDimensions();
  const deviceType = useDeviceType();

  return useMemo(() => {
    // Always show sidebar on desktop
    if (deviceType === 'desktop') return true;
    // Show sidebar on tablet in landscape
    if (deviceType === 'tablet' && width > height) return true;
    return false;
  }, [deviceType, width, height]);
}

/**
 * Hook to get responsive values based on device type
 * Similar to Platform.select but for responsive layouts
 */
export function useResponsiveValue<T>(values: {
  mobile: T;
  tablet?: T;
  desktop?: T;
}): T {
  const deviceType = useDeviceType();

  return useMemo(() => {
    if (deviceType === 'desktop' && values.desktop !== undefined) {
      return values.desktop;
    }
    if (deviceType === 'tablet' && values.tablet !== undefined) {
      return values.tablet;
    }
    return values.mobile;
  }, [deviceType, values]);
}

/**
 * Hook to get sidebar width based on device type
 */
export function useSidebarWidth(): number {
  const deviceType = useDeviceType();

  return useMemo(() => {
    switch (deviceType) {
      case 'desktop':
        return 260;
      case 'tablet':
        return 220;
      default:
        return 0;
    }
  }, [deviceType]);
}

/**
 * Check if we're running on web platform
 */
export const isWeb = Platform.OS === 'web';

/**
 * Check if we're running on native platform (iOS/Android)
 */
export const isNative = Platform.OS !== 'web';
