/**
 * Culinary rounding: band tables and ladders, not raw arithmetic.
 *
 * THE INVARIANT, which everything here is built to preserve:
 *
 *   Within a dimension and system, every band's step divides the next coarser band's step.
 *
 * That is what makes `snap(snap(x)) === snap(x)` hold even when a value snaps *up* across a band
 * boundary — the snapped value is already on the coarser grid, so the second pass is a no-op. It
 * lets us snap once when a draft is written and again when the reader scales the servings, without
 * the amount drifting a little further each time. `bandStepsDivide` checks it, and a test asserts
 * it over the tables themselves rather than over samples.
 */

/** Kills the residue that division and multiplication leave behind (0.1 + 0.2, 5 * 0.15, ...). */
export function clean(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function snap(value: number, step: number): number {
  return clean(Math.round(value / step) * step);
}

export interface Band {
  /** Applies to magnitudes strictly below this. The last band uses `Infinity`. */
  below: number;
  step: number;
}

// Metric bands apply only to CONVERTED values. A metric amount the model wrote itself is already
// culinary and is passed through untouched — re-rounding it would turn a correct 125 g of flour
// into 130 g and break the ratio the recipe depends on.
export const METRIC_MASS_BANDS: Band[] = [
  { below: 1, step: 0.1 },
  { below: 10, step: 0.5 },
  { below: 25, step: 1 },
  { below: 250, step: 5 },
  { below: Infinity, step: 10 },
];

export const METRIC_VOLUME_BANDS: Band[] = [
  { below: 5, step: 0.5 },
  { below: 250, step: 5 },
  { below: Infinity, step: 10 },
];

export const METRIC_LENGTH_BANDS: Band[] = [
  { below: 5, step: 0.5 },
  { below: Infinity, step: 1 },
];

/** Ounces. Sub-ounce solids are spooned rather than weighed, so that band is a decimal fallback. */
export const IMPERIAL_OUNCE_BANDS: Band[] = [
  { below: 1, step: 0.05 },
  { below: 4, step: 0.25 },
  { below: 8, step: 0.5 },
  { below: Infinity, step: 1 },
];

export const IMPERIAL_INCH_BANDS: Band[] = [
  { below: 2, step: 0.25 },
  { below: Infinity, step: 0.5 },
];

/** kg and l are the coarse end of their metric ladders; 0.05 of either is a multiple of 10 base
 *  units, so the invariant carries across the unit step-up. */
export const METRIC_LARGE_STEP = 0.05;

export function snapBands(value: number, bands: Band[]): number {
  const magnitude = Math.abs(value);
  const band = bands.find((entry) => magnitude < entry.below) ?? bands[bands.length - 1];
  return snap(value, band.step);
}

/** True when every band's step divides the next coarser one — the idempotency precondition. */
export function bandStepsDivide(bands: Band[]): boolean {
  return bands.every((band, index) => {
    const next = bands[index + 1];
    if (!next) return true;
    return clean(next.step / band.step) % 1 === 0;
  });
}

/**
 * The measuring-spoon and measuring-cup ladder. A cook owns 1/4, 1/3, 1/2 and 1 measures and
 * combines them; these are the amounts those combinations can actually produce.
 */
export const SPOON_LADDER: number[] = [
  1 / 8,
  1 / 4,
  1 / 3,
  1 / 2,
  2 / 3,
  3 / 4,
  1,
  1 + 1 / 4,
  1 + 1 / 3,
  1 + 1 / 2,
  1 + 2 / 3,
  1 + 3 / 4,
  2,
  2.25,
  2.5,
  2.75,
  3,
  3.5,
  4,
  4.5,
  5,
  6,
  8,
];

/**
 * Metric cooking uses spoons too, but only in the counts a metric recipe actually prints: quarters
 * and halves at the small end, then whole and half spoons. Thirds are an imperial-measure habit —
 * "1 1/3 el" is not something a Flemish recipe says, so 20 ml is better left as 20 ml.
 */
export const METRIC_SPOON_LADDER: number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4];

/**
 * Pounds get bands rather than a ladder. A ladder coarse enough to look like a cookbook (1, 1 1/4,
 * 1 1/2, ...) puts 500 g at "1 lb", a 10% error, and the honest alternative — "1 lb 2 oz" — is a
 * compound amount that `parseIngredientLine` cannot read back (it takes the first quantity only)
 * and that servings scaling cannot multiply. Eighths of a pound are exactly ounces, so these bands
 * stay both accurate and readable: 500 g is "1 1/8 lb".
 */
export const IMPERIAL_POUND_BANDS: Band[] = [
  { below: 2, step: 0.125 },
  { below: 5, step: 0.25 },
  { below: Infinity, step: 0.5 },
];

/**
 * Nearest rung by absolute distance. Ties keep the earlier (smaller) rung, so a value exactly
 * between 1/3 and 1/2 reads as 1/3 — the smaller-denominator, more-commonly-owned measure.
 * Ladder snapping is idempotent by construction: every rung is distance 0 from itself.
 */
export function snapLadder(value: number, ladder: number[]): number {
  let best = ladder[0];
  let bestDistance = Math.abs(value - best);

  for (const rung of ladder) {
    const distance = Math.abs(value - rung);
    if (distance < bestDistance) {
      best = rung;
      bestDistance = distance;
    }
  }

  return best;
}

/** Above the top rung the ladder stops being meaningful; fall back to a coarse regular step. */
export function snapLadderOrStep(value: number, ladder: number[], stepAbove: number): number {
  const top = ladder[ladder.length - 1];
  return value > top ? snap(value, stepAbove) : snapLadder(value, ladder);
}
