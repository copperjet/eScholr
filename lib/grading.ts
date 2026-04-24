/**
 * Grading helper — extracted shared util.
 *
 * Assessment weights:
 *   EYD–LS3 : FA1 20% + FA2 20% + Summative 60%
 *   IGCSE+  : Summative 100%
 *
 * Grade boundaries (Cambridge-aligned):
 *   A*  90–100
 *   A   80–89
 *   B   70–79
 *   C   60–69
 *   D   50–59
 *   E   40–49
 *   U    0–39
 *
 * Developmental scale (EYD):
 *   WTS (Working Towards Standard) | EXS (Expected Standard) | GDS (Greater Depth)
 */

export type GradeLetter = 'A*' | 'A' | 'B' | 'C' | 'D' | 'E' | 'U';
export type DevScale = 'WTS' | 'EXS' | 'GDS';

export interface GradeBoundary {
  letter: GradeLetter;
  min: number;
  max: number;
  points: number; // UCAS-style for ranking
}

export const GRADE_BOUNDARIES: GradeBoundary[] = [
  { letter: 'A*', min: 90, max: 100, points: 56 },
  { letter: 'A',  min: 80, max: 89,  points: 48 },
  { letter: 'B',  min: 70, max: 79,  points: 40 },
  { letter: 'C',  min: 60, max: 69,  points: 32 },
  { letter: 'D',  min: 50, max: 59,  points: 24 },
  { letter: 'E',  min: 40, max: 49,  points: 16 },
  { letter: 'U',  min:  0, max: 39,  points:  0 },
];

/** Round half-up (standard school rounding). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Convert a raw percentage (0–100) to a grade letter.
 * Uses standard 0.5 half-up rounding before lookup.
 */
export function percentToLetter(percent: number): GradeLetter {
  const rounded = roundHalfUp(Math.max(0, Math.min(100, percent)));
  for (const b of GRADE_BOUNDARIES) {
    if (rounded >= b.min && rounded <= b.max) return b.letter;
  }
  return 'U';
}

/**
 * Get grade boundary entry for a letter.
 */
export function getBoundary(letter: GradeLetter): GradeBoundary {
  return GRADE_BOUNDARIES.find((b) => b.letter === letter) ?? GRADE_BOUNDARIES[GRADE_BOUNDARIES.length - 1];
}

/**
 * Calculate weighted total percentage for EYD–LS3 cohorts.
 * Any missing component is excluded and weights are re-normalised.
 */
export function calculateWeightedPercent(opts: {
  fa1?: number | null;
  fa2?: number | null;
  summative?: number | null;
}): number | null {
  const { fa1, fa2, summative } = opts;
  let totalWeight = 0;
  let weightedSum = 0;

  if (fa1 != null)       { totalWeight += 20; weightedSum += fa1 * 20; }
  if (fa2 != null)       { totalWeight += 20; weightedSum += fa2 * 20; }
  if (summative != null) { totalWeight += 60; weightedSum += summative * 60; }

  if (totalWeight === 0) return null;
  return roundHalfUp(weightedSum / totalWeight);
}

/**
 * For IGCSE+ cohorts the summative is the only component (100%).
 */
export function calculateIGCSEPercent(summative: number | null): number | null {
  if (summative == null) return null;
  return roundHalfUp(summative);
}

/**
 * Determine whether a section uses IGCSE weighting.
 * Based on section code: IGCSE1, IGCSE2, AS, A-Level.
 */
export function isIGCSESection(sectionCode: string): boolean {
  const code = sectionCode.toUpperCase();
  return code.includes('IGCSE') || code.includes('AS') || code.includes('A-LEVEL') || code.includes('ALEVEL');
}

/**
 * Map raw percentage → developmental scale descriptor (EYD).
 */
export function percentToDevScale(percent: number): DevScale {
  const r = roundHalfUp(percent);
  if (r >= 70) return 'GDS';
  if (r >= 40) return 'EXS';
  return 'WTS';
}

/** Human-readable dev scale label. */
export const DEV_SCALE_LABELS: Record<DevScale, string> = {
  WTS: 'Working Towards Standard',
  EXS: 'Expected Standard',
  GDS: 'Greater Depth Standard',
};

/** Single entry point: given marks + section context, return grade letter + percentage. */
export function gradeStudent(opts: {
  fa1?: number | null;
  fa2?: number | null;
  summative?: number | null;
  isIGCSE: boolean;
}): { percent: number | null; letter: GradeLetter | null } {
  const { fa1, fa2, summative, isIGCSE } = opts;
  const percent = isIGCSE
    ? calculateIGCSEPercent(summative ?? null)
    : calculateWeightedPercent({ fa1, fa2, summative });

  if (percent == null) return { percent: null, letter: null };
  return { percent, letter: percentToLetter(percent) };
}
