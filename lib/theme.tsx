import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Colors, ColorScheme } from '../constants/Colors';

export interface BrandColors {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryMuted: string;
  secondary: string;
  onPrimary: string;
}

type BaseColors = Record<keyof typeof Colors.light, string>;
type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  scheme: ColorScheme;
  mode: ThemeMode;
  isDark: boolean;
  colors: BaseColors & { brand: BrandColors };
  setMode: (mode: ThemeMode) => void;
}

export const DEFAULT_BRAND: BrandColors = {
  primary:      '#0F5132',
  primaryDark:  '#0A3D26',
  primarySoft:  '#E8F5EE',
  primaryMuted: '#B2D4BA',
  secondary:    '#F59E0B',
  onPrimary:    '#FFFFFF',
};

const THEME_KEY = 'escholr_theme_mode';

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'light',
  mode: 'system',
  isDark: false,
  colors: { ...Colors.light, brand: DEFAULT_BRAND },
  setMode: () => {},
});

/** Blend a hex color toward black by `amount` (0–1). */
function darken(hex: string, amount = 0.2): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8)  & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round(( n        & 0xff) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Blend a hex color toward white by `amount` (0–1). */
function lighten(hex: string, amount = 0.85): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8)  & 0xff) + (255 - ((n >> 8)  & 0xff)) * amount));
  const b = Math.min(255, Math.round(( n        & 0xff) + (255 - ( n        & 0xff)) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function buildBrand(primary?: string, secondary?: string): BrandColors {
  if (!primary) return DEFAULT_BRAND;
  return {
    primary,
    primaryDark:  darken(primary, 0.22),
    primarySoft:  lighten(primary, 0.88),
    primaryMuted: lighten(primary, 0.60),
    secondary:    secondary ?? DEFAULT_BRAND.secondary,
    onPrimary:    '#FFFFFF',
  };
}

export function ThemeProvider({
  children,
  brand,
}: {
  children: React.ReactNode;
  brand?: { primary?: string; secondary?: string };
}) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    (async () => {
      try {
        let saved: string | null = null;
        if (Platform.OS === 'web') {
          saved = localStorage.getItem(THEME_KEY);
        } else {
          saved = await SecureStore.getItemAsync(THEME_KEY);
        }
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      } catch {}
    })();
  }, []);

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(THEME_KEY, newMode);
      } else {
        await SecureStore.setItemAsync(THEME_KEY, newMode);
      }
    } catch {}
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const scheme: ColorScheme = isDark ? 'dark' : 'light';
  const resolvedBrand = useMemo(() => buildBrand(brand?.primary, brand?.secondary), [brand?.primary, brand?.secondary]);

  const value = useMemo<ThemeContextValue>(
    () => {
      const base = Colors[scheme] ?? Colors.light;
      return {
        scheme,
        mode,
        isDark,
        colors: { ...base, brand: resolvedBrand ?? DEFAULT_BRAND },
        setMode,
      };
    },
    [scheme, mode, isDark, resolvedBrand]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
