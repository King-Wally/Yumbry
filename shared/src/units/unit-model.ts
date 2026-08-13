import type { UnitSystem } from './unit-system.js';

export type Dimension = 'mass' | 'volume' | 'length';

export type UnitCode =
  // mass
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'stick'
  // volume
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'fl_oz'
  | 'pt'
  | 'qt'
  | 'gal'
  // length
  | 'cm'
  | 'in';

export interface UnitMeta {
  dimension: Dimension;
  /** How many base units one of this unit is. Base units: g (mass), ml (volume), cm (length). */
  base: number;
  /** Which system this unit renders in. `'both'` units are written identically in either. */
  system: UnitSystem | 'both';
}

/**
 * Two regimes, deliberately.
 *
 * Volume uses the legal/culinary set, which is an exact integer-millilitre ladder with no internal
 * contradiction: 3 tsp = 1 tbsp, 2 tbsp = 1 fl oz, 8 fl oz = 16 tbsp = 48 tsp = 1 cup. US customary
 * (236.588 ml/cup) is equally self-consistent but prints numbers no cookbook uses, and a metric
 * reader's entire experience of this table is the metric number on screen.
 *
 * Mass and length use the exact definitions. The friendly round numbers people expect come out of
 * the rounding bands anyway — 1 lb x 453.59237 = 453.6 g snaps to 450 g — so approximating the
 * factor buys nothing and makes the error compound across larger amounts.
 */
export const UNIT_META: Record<UnitCode, UnitMeta> = {
  g: { dimension: 'mass', base: 1, system: 'metric' },
  kg: { dimension: 'mass', base: 1000, system: 'metric' },
  oz: { dimension: 'mass', base: 28.349523125, system: 'imperial' },
  lb: { dimension: 'mass', base: 453.59237, system: 'imperial' },
  // A US stick of butter is defined as 4 oz. Recognised so "1 stick butter" converts instead of
  // silently surviving into a metric recipe; never rendered.
  stick: { dimension: 'mass', base: 113.3980925, system: 'imperial' },

  ml: { dimension: 'volume', base: 1, system: 'metric' },
  l: { dimension: 'volume', base: 1000, system: 'metric' },
  tsp: { dimension: 'volume', base: 5, system: 'both' },
  tbsp: { dimension: 'volume', base: 15, system: 'both' },
  cup: { dimension: 'volume', base: 240, system: 'imperial' },
  fl_oz: { dimension: 'volume', base: 30, system: 'imperial' },
  pt: { dimension: 'volume', base: 480, system: 'imperial' },
  qt: { dimension: 'volume', base: 960, system: 'imperial' },
  gal: { dimension: 'volume', base: 3840, system: 'imperial' },

  cm: { dimension: 'length', base: 1, system: 'metric' },
  in: { dimension: 'length', base: 2.54, system: 'imperial' },
};

export function isUnitCode(value: unknown): value is UnitCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UNIT_META, value);
}

export function toBase(value: number, unit: UnitCode): number {
  return value * UNIT_META[unit].base;
}

export function fromBase(base: number, unit: UnitCode): number {
  return base / UNIT_META[unit].base;
}

/**
 * The only unit values the AI model may emit. Four values, and none of them a choice the model is
 * better placed to make than we are: laddering g->kg and ml->tsp/tbsp/l, picking cups over ounces,
 * and spelling the unit in the reader's language all depend on the target system, which the model
 * is deliberately never told. `''` covers anything counted whole ("2 eggs"), where the plural noun
 * in `item` already carries the unit in the right language for free.
 *
 * `''` rather than `null`: OpenAI strict mode expresses nullability as a type union, and
 * `{"type": ["string","null"], "enum": [..., null]}` is the construct most likely to be mangled by
 * Gemini's OpenAI-compat translation into its own OpenAPI-subset schema.
 */
export const MODEL_UNIT_ENUM = ['g', 'ml', 'cm', ''] as const;

export type ModelUnit = (typeof MODEL_UNIT_ENUM)[number];

export function isModelUnit(value: unknown): value is ModelUnit {
  return typeof value === 'string' && (MODEL_UNIT_ENUM as readonly string[]).includes(value);
}

/** The dimension a model-emitted unit measures. `''` (countable) has none. */
export function modelUnitDimension(unit: ModelUnit): Dimension | null {
  return unit === '' ? null : UNIT_META[unit].dimension;
}
