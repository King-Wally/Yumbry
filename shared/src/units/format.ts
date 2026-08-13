import { decimalSeparator, type SupportedLocale } from '../locale.js';
import { gramsToMillilitres, type DensityKey } from './density.js';
import { RECOGNIZED_UNITS, unitLabel } from './labels.js';
import { DEFAULT_SMALL_VOLUME_STYLE, type SmallVolumeStyle } from './small-volumes.js';
import {
  clean,
  IMPERIAL_INCH_BANDS,
  IMPERIAL_OUNCE_BANDS,
  IMPERIAL_POUND_BANDS,
  METRIC_LARGE_STEP,
  METRIC_SPOON_LADDER,
  METRIC_LENGTH_BANDS,
  METRIC_MASS_BANDS,
  METRIC_VOLUME_BANDS,
  snap,
  snapBands,
  snapLadder,
  snapLadderOrStep,
  SPOON_LADDER,
} from './rounding.js';
import {
  fromBase,
  isUnitCode,
  toBase,
  UNIT_META,
  type Dimension,
  type UnitCode,
} from './unit-model.js';
import type { UnitSystem } from './unit-system.js';

/**
 * An ingredient as the model is asked to produce it and as the engine keeps it: a number, one of
 * four canonical units, the thing itself in the reader's language, and the two hints that let code
 * do the rest.
 */
export interface AiIngredient {
  item: string;
  quantity: number | null;
  /**
   * `''` for anything counted whole, a canonical `UnitCode`, or — only via the tolerant parsing
   * path — a word we could not map, which is rendered verbatim and never converted.
   */
  unit: string;
  note: string | null;
  density_key: DensityKey;
}

export interface RenderContext {
  locale: SupportedLocale;
  unitSystem: UnitSystem;
  /** Metric only; imperial has no alternative to spoons at these sizes. Defaults to spoons. */
  smallVolumes?: SmallVolumeStyle;
}

export interface RenderedMeasurement {
  value: number;
  unit: UnitCode;
}

/** Units whose amounts a cook reads as fractions, because that is what the measure itself is. */
const FRACTIONAL_UNITS = new Set<UnitCode>(['tsp', 'tbsp', 'cup', 'oz', 'lb', 'in', 'stick']);

const FRACTION_PARTS: [number, string][] = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
];

const EPSILON = 1e-6;

export function formatDecimal(value: number, locale: SupportedLocale): string {
  const rounded = clean(Math.round(value * 1000) / 1000);
  return String(rounded).replace('.', decimalSeparator(locale));
}

/**
 * ASCII fractions ("1 1/2"), not vulgar ones ("1 1/2" as a single glyph): the recipe form is a
 * plain text input people edit by hand, and `QUANTITY_TOKEN_PATTERN` reads mixed numbers natively.
 */
export function formatFractional(value: number, locale: SupportedLocale): string {
  if (value < 0) return formatDecimal(value, locale);

  const whole = Math.floor(value + EPSILON);
  const fraction = value - whole;
  if (fraction < EPSILON) return String(whole);

  const part = FRACTION_PARTS.find(([size]) => Math.abs(size - fraction) < EPSILON);
  if (!part) return formatDecimal(value, locale);

  return whole === 0 ? part[1] : `${whole} ${part[1]}`;
}

export function formatQuantity(
  value: number,
  unit: UnitCode | null,
  locale: SupportedLocale
): string {
  const fractional = unit === null || FRACTIONAL_UNITS.has(unit);
  return fractional ? formatFractional(value, locale) : formatDecimal(value, locale);
}

/**
 * Whether the base value reached us by conversion. A metric amount the model wrote itself is
 * already culinary and passes through untouched — snapping it would turn a correct 125 g of flour
 * into 130 g and break the ratio. Only converted values get band rounding.
 */
function isConverted(sourceUnit: UnitCode): boolean {
  return UNIT_META[sourceUnit].system === 'imperial';
}

function renderMass(
  grams: number,
  context: RenderContext,
  densityKey: DensityKey,
  converted: boolean
): RenderedMeasurement {
  if (context.unitSystem === 'imperial') {
    // Americans measure flour, sugar and the other scoopables by volume, so a density hint turns
    // an otherwise-correct-but-alien "4 1/2 oz flour" into "1 cup flour". Anything without a hint,
    // or too small to be worth a measure, stays a weight — always right, merely less idiomatic.
    const millilitres = gramsToMillilitres(grams, densityKey);
    if (millilitres !== null && millilitres >= 2.5) {
      return renderVolume(millilitres, context, true);
    }

    const ounces = snapBands(fromBase(grams, 'oz'), IMPERIAL_OUNCE_BANDS);
    if (ounces >= 16) {
      return { value: snapBands(ounces / 16, IMPERIAL_POUND_BANDS), unit: 'lb' };
    }
    return { value: ounces, unit: 'oz' };
  }

  const value = converted ? snapBands(grams, METRIC_MASS_BANDS) : clean(grams);
  if (value >= 1000) {
    const kilos = fromBase(value, 'kg');
    return { value: converted ? snap(kilos, METRIC_LARGE_STEP) : clean(kilos), unit: 'kg' };
  }
  return { value, unit: 'g' };
}

/** How close a spoon rendering has to be before it beats simply printing millilitres. */
const SPOON_TOLERANCE = 0.02;

function renderVolume(
  millilitres: number,
  context: RenderContext,
  converted: boolean
): RenderedMeasurement {
  if (context.unitSystem === 'imperial') {
    if (millilitres < 15)
      return { value: snapLadder(fromBase(millilitres, 'tsp'), SPOON_LADDER), unit: 'tsp' };
    if (millilitres < 60)
      return { value: snapLadder(fromBase(millilitres, 'tbsp'), SPOON_LADDER), unit: 'tbsp' };
    return {
      value: snapLadderOrStep(fromBase(millilitres, 'cup'), SPOON_LADDER, 0.5),
      unit: 'cup',
    };
  }

  const value = converted ? snapBands(millilitres, METRIC_VOLUME_BANDS) : clean(millilitres);
  if (value >= 1000) {
    const litres = fromBase(value, 'l');
    return { value: converted ? snap(litres, METRIC_LARGE_STEP) : clean(litres), unit: 'l' };
  }

  // Metric cooking uses spoons for small amounts just as imperial does — "1 tl zout" reads right
  // where "5 ml zout" reads like a lab protocol. But only when the spoon count lands close enough
  // to a real measure; otherwise millilitres are the honest answer. Both forms are idiomatic, so
  // a cook who finds millilitres easier to measure can turn this off.
  if (value < 60 && (context.smallVolumes ?? DEFAULT_SMALL_VOLUME_STYLE) === 'spoons') {
    const spoon: UnitCode = value < 15 ? 'tsp' : 'tbsp';
    const count = snapLadder(fromBase(value, spoon), METRIC_SPOON_LADDER);
    if (Math.abs(toBase(count, spoon) - value) <= SPOON_TOLERANCE * value) {
      return { value: count, unit: spoon };
    }
  }

  return { value, unit: 'ml' };
}

function renderLength(
  centimetres: number,
  context: RenderContext,
  converted: boolean
): RenderedMeasurement {
  if (context.unitSystem === 'imperial') {
    return { value: snapBands(fromBase(centimetres, 'in'), IMPERIAL_INCH_BANDS), unit: 'in' };
  }
  return {
    value: converted ? snapBands(centimetres, METRIC_LENGTH_BANDS) : clean(centimetres),
    unit: 'cm',
  };
}

/** Converts one amount into the reader's system and rounds it to something a cook can measure. */
export function renderMeasurement(
  value: number,
  unit: UnitCode,
  context: RenderContext,
  densityKey: DensityKey = 'none'
): RenderedMeasurement {
  const base = toBase(value, unit);
  const converted = isConverted(unit);
  const dimension: Dimension = UNIT_META[unit].dimension;

  if (dimension === 'mass') return renderMass(base, context, densityKey, converted);
  if (dimension === 'volume') return renderVolume(base, context, converted);
  return renderLength(base, context, converted);
}

export function formatMeasurement(
  value: number,
  unit: UnitCode,
  context: RenderContext,
  densityKey: DensityKey = 'none'
): string {
  const rendered = renderMeasurement(value, unit, context, densityKey);
  const amount = formatQuantity(rendered.value, rendered.unit, context.locale);
  return `${amount} ${unitLabel(rendered.unit, context.locale, rendered.value)}`;
}

/**
 * Formats an amount that has been multiplied by a servings ratio, for a recipe already saved in
 * whatever units it was written in.
 *
 * It deliberately does NOT convert: this is the stored-recipe path, and a saved recipe keeps the
 * units it was saved with. Only the number is made measurable again — a third of a cup should read
 * "1/3", and 200 g scaled by a third should read "65 g", where the old formatter printed
 * "0,375 cup" and "66,625 g". Both of those are what you get from rounding every unit to eighths
 * and then printing the result as a decimal, which is neither a fraction nor a round number.
 *
 * Because the rounding tables are idempotent, snapping here — on every render, never written back
 * — cannot make a value drift.
 */
export function formatScaledAmount(
  amount: number,
  unitWord: string | null,
  locale: SupportedLocale
): string {
  if (!Number.isFinite(amount)) return '';

  const code = unitWord
    ? (RECOGNIZED_UNITS.get(unitWord.toLowerCase().replace(/\.$/, '')) ?? null)
    : null;

  if (code && !FRACTIONAL_UNITS.has(code)) {
    const dimension = UNIT_META[code].dimension;
    const bands =
      dimension === 'mass'
        ? METRIC_MASS_BANDS
        : dimension === 'volume'
          ? METRIC_VOLUME_BANDS
          : METRIC_LENGTH_BANDS;
    // Snap in base units so the band applies to the real magnitude: 2.13 kg is 2130 g, which the
    // 10 g band leaves untouched, where a naive snap of 2.13 would flatten it to 2.
    return formatDecimal(fromBase(snapBands(toBase(amount, code), bands), code), locale);
  }

  // Spoons, cups, imperial weights, portion words and bare counts all read as fractions.
  return formatFractional(snapLadderOrStep(amount, SPOON_LADDER, 0.25), locale);
}

/**
 * The single place a structured ingredient becomes the line the reader sees and the database
 * stores. Everything it emits has to survive `parseIngredientLine` with a non-null amount and
 * unit — that round trip is asserted by a cross-package test, because it is exactly the seam where
 * the old converter's table and the parser's word list drifted apart.
 */
export function renderIngredientLine(ingredient: AiIngredient, context: RenderContext): string {
  const { quantity, unit, item, note } = ingredient;
  const parts: string[] = [];

  if (quantity !== null && isUnitCode(unit)) {
    parts.push(formatMeasurement(quantity, unit, context, ingredient.density_key));
  } else {
    if (quantity !== null) parts.push(formatQuantity(quantity, null, context.locale));
    // An unrecognised unit word is kept and printed verbatim rather than guessed at or dropped:
    // "1 knob butter" is a better answer than "1 butter".
    if (unit && !isUnitCode(unit)) parts.push(unit);
  }

  parts.push(item);

  const line = parts
    .filter((part) => part.length > 0)
    .join(' ')
    .trim();

  return note ? `${line} (${note})` : line;
}
