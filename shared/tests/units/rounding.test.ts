import { describe, expect, it } from 'vitest';
import {
  bandStepsDivide,
  IMPERIAL_INCH_BANDS,
  IMPERIAL_OUNCE_BANDS,
  IMPERIAL_POUND_BANDS,
  METRIC_LENGTH_BANDS,
  METRIC_MASS_BANDS,
  METRIC_SPOON_LADDER,
  METRIC_VOLUME_BANDS,
  snapBands,
  snapLadder,
  snapLadderOrStep,
  SPOON_LADDER,
  type Band,
} from '../../src/units/rounding.js';

const BAND_TABLES: [string, Band[]][] = [
  ['metric mass', METRIC_MASS_BANDS],
  ['metric volume', METRIC_VOLUME_BANDS],
  ['metric length', METRIC_LENGTH_BANDS],
  ['imperial ounces', IMPERIAL_OUNCE_BANDS],
  ['imperial pounds', IMPERIAL_POUND_BANDS],
  ['imperial inches', IMPERIAL_INCH_BANDS],
];

describe('band tables', () => {
  // The invariant itself, not a sample of its consequences: if a step ever stops dividing the next
  // coarser one, a value that snaps up across the boundary lands off-grid and every later re-snap
  // moves it again.
  it.each(BAND_TABLES)('%s: every step divides the next coarser step', (_name, bands) => {
    expect(bandStepsDivide(bands)).toBe(true);
  });

  it.each(BAND_TABLES)('%s: bands are ordered and terminate', (_name, bands) => {
    const boundaries = bands.map((band) => band.below);
    expect([...boundaries].sort((a, b) => a - b)).toEqual(boundaries);
    expect(boundaries[boundaries.length - 1]).toBe(Infinity);
  });
});

describe('idempotency', () => {
  it.each(BAND_TABLES)('%s: snapping a snapped value is a no-op', (_name, bands) => {
    for (let value = 0.1; value <= 5000; value = Math.round((value + 0.1) * 10) / 10) {
      const once = snapBands(value, bands);
      expect(snapBands(once, bands)).toBe(once);
    }
  });

  it.each([
    ['spoon', SPOON_LADDER],
    ['metric spoon', METRIC_SPOON_LADDER],
  ])('%s ladder: every rung snaps to itself', (_name, ladder) => {
    for (const rung of ladder) expect(snapLadder(rung, ladder)).toBe(rung);
  });

  it('ladder snapping is stable for arbitrary values', () => {
    for (let value = 0.05; value <= 12; value = Math.round((value + 0.05) * 100) / 100) {
      const once = snapLadder(value, SPOON_LADDER);
      expect(snapLadder(once, SPOON_LADDER)).toBe(once);
    }
  });

  it('falls back to a coarse step above the top rung', () => {
    expect(snapLadderOrStep(8.33, SPOON_LADDER, 0.5)).toBe(8.5);
    expect(snapLadderOrStep(3.4, SPOON_LADDER, 0.5)).toBe(3.5);
  });
});

describe('snapLadder tie-breaking', () => {
  it('keeps the smaller rung when two are equally close', () => {
    // Exactly between 1/4 and 1/3.
    expect(snapLadder((1 / 4 + 1 / 3) / 2, SPOON_LADDER)).toBe(1 / 4);
  });
});
