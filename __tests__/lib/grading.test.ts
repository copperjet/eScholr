/**
 * lib/grading — unit tests
 * Pure functions — no mocks needed.
 */
import {
  roundHalfUp,
  percentToLetter,
  getBoundary,
  calculateWeightedPercent,
  calculateIGCSEPercent,
  isIGCSESection,
  percentToDevScale,
  gradeStudent,
  GRADE_BOUNDARIES,
  DEV_SCALE_LABELS,
} from '../../lib/grading';

describe('roundHalfUp', () => {
  it('rounds 0.5 up', () => expect(roundHalfUp(79.5)).toBe(80));
  it('rounds 0.4 down', () => expect(roundHalfUp(79.4)).toBe(79));
  it('handles integers', () => expect(roundHalfUp(85)).toBe(85));
  it('handles zero', () => expect(roundHalfUp(0)).toBe(0));
  it('rounds 0.49 down', () => expect(roundHalfUp(89.49)).toBe(89));
});

describe('percentToLetter', () => {
  it.each([
    [100, 'A*'], [95, 'A*'], [90, 'A*'],
    [89, 'A'], [80, 'A'],
    [79, 'B'], [70, 'B'],
    [69, 'C'], [60, 'C'],
    [59, 'D'], [50, 'D'],
    [49, 'E'], [40, 'E'],
    [39, 'U'], [0, 'U'],
  ])('%i → %s', (pct, expected) => {
    expect(percentToLetter(pct)).toBe(expected);
  });

  it('clamps above 100', () => expect(percentToLetter(110)).toBe('A*'));
  it('clamps below 0', () => expect(percentToLetter(-5)).toBe('U'));
  it('rounds 89.5 → 90 → A*', () => expect(percentToLetter(89.5)).toBe('A*'));
  it('rounds 39.5 → 40 → E', () => expect(percentToLetter(39.5)).toBe('E'));
});

describe('getBoundary', () => {
  it('returns A* boundary', () => {
    const b = getBoundary('A*');
    expect(b.min).toBe(90);
    expect(b.max).toBe(100);
    expect(b.points).toBe(56);
  });
  it('returns U boundary for unknown fallback', () => {
    const b = getBoundary('U');
    expect(b.letter).toBe('U');
  });
});

describe('calculateWeightedPercent', () => {
  it('all three components: 80*20 + 70*20 + 90*60 / 100 = 84', () => {
    expect(calculateWeightedPercent({ fa1: 80, fa2: 70, summative: 90 })).toBe(84);
  });
  it('missing FA2 re-normalises: 80*20 + 90*60 / 80 = 87.5 → 88', () => {
    expect(calculateWeightedPercent({ fa1: 80, summative: 90 })).toBe(88);
  });
  it('only summative: 75*60 / 60 = 75', () => {
    expect(calculateWeightedPercent({ summative: 75 })).toBe(75);
  });
  it('only fa1: 60*20 / 20 = 60', () => {
    expect(calculateWeightedPercent({ fa1: 60 })).toBe(60);
  });
  it('all null returns null', () => {
    expect(calculateWeightedPercent({})).toBeNull();
  });
  it('explicit null values returns null', () => {
    expect(calculateWeightedPercent({ fa1: null, fa2: null, summative: null })).toBeNull();
  });
});

describe('calculateIGCSEPercent', () => {
  it('returns rounded summative', () => expect(calculateIGCSEPercent(78.6)).toBe(79));
  it('null returns null', () => expect(calculateIGCSEPercent(null)).toBeNull());
});

describe('isIGCSESection', () => {
  it.each(['IGCSE1', 'igcse2', 'AS', 'A-Level', 'ALEVEL'])(
    '%s → true', (code) => expect(isIGCSESection(code)).toBe(true)
  );
  it.each(['LS1', 'LS2', 'LS3', 'EYD'])(
    '%s → false', (code) => expect(isIGCSESection(code)).toBe(false)
  );
});

describe('percentToDevScale', () => {
  it('70+ → GDS', () => expect(percentToDevScale(70)).toBe('GDS'));
  it('40-69 → EXS', () => {
    expect(percentToDevScale(40)).toBe('EXS');
    expect(percentToDevScale(69)).toBe('EXS');
  });
  it('0-39 → WTS', () => {
    expect(percentToDevScale(39)).toBe('WTS');
    expect(percentToDevScale(0)).toBe('WTS');
  });
});

describe('gradeStudent', () => {
  it('weighted path: fa1=80, fa2=70, summative=90 → 84% → A', () => {
    const r = gradeStudent({ fa1: 80, fa2: 70, summative: 90, isIGCSE: false });
    expect(r.percent).toBe(84);
    expect(r.letter).toBe('A');
  });
  it('IGCSE path: summative=65 → 65% → C', () => {
    const r = gradeStudent({ summative: 65, isIGCSE: true });
    expect(r.percent).toBe(65);
    expect(r.letter).toBe('C');
  });
  it('no data → null', () => {
    const r = gradeStudent({ isIGCSE: false });
    expect(r.percent).toBeNull();
    expect(r.letter).toBeNull();
  });
});

describe('constants', () => {
  it('GRADE_BOUNDARIES has 7 entries', () => expect(GRADE_BOUNDARIES).toHaveLength(7));
  it('DEV_SCALE_LABELS has 3 keys', () => expect(Object.keys(DEV_SCALE_LABELS)).toHaveLength(3));
});
