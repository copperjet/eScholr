import { Platform } from 'react-native';

export const Typography = {
  display: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38, letterSpacing: -0.5 },
  h1:      { fontSize: 24, fontWeight: '700' as const, lineHeight: 30, letterSpacing: -0.3 },
  h2:      { fontSize: 20, fontWeight: '700' as const, lineHeight: 26, letterSpacing: -0.2 },
  h3:      { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  h4:      { fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
  bodyLg:  { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  body:    { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySm:  { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  label:   { fontSize: 11, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.7, textTransform: 'uppercase' as const },
  caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 14 },
  tabLabel:{ fontSize: 10, fontWeight: '600' as const, lineHeight: 12 },
  mono:    { fontSize: 13, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), lineHeight: 18 },
} as const;

export const Spacing = {
  xs:     4,
  sm:     8,
  md:     12,
  base:   16,
  lg:     20,
  xl:     24,
  '2xl':  32,
  '3xl':  40,
  '4xl':  48,
  screen: 16,
} as const;

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   22,
  '2xl': 28,
  full: 999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#0F5132',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F5132',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F5132',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const FontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   22,
  xxl:  28,
  hero: 36,
} as const;
