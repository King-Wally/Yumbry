import type { SupportedLocale } from '../locale.js';
import { normalizeFractionChars, parseQuantityToken, QUANTITY_TOKEN_PATTERN } from '../quantity.js';
import { celsiusToFahrenheit, fahrenheitToCelsius } from './convert.js';
import { formatMeasurement } from './format.js';
import { textUnitLookup, tokensByLengthDesc } from './labels.js';
import { UNIT_META, type UnitCode } from './unit-model.js';
import { DEFAULT_SMALL_VOLUME_STYLE, type SmallVolumeStyle } from './small-volumes.js';
import type { UnitSystem } from './unit-system.js';

/**
 * Ingredients are structured, but instructions stay prose — and prose is where oven temperatures,
 * tin sizes and dice sizes live. This pass is narrower than the converter it replaces and yet does
 * strictly more: it only has to recognise metric symbols and English imperial words, and metric
 * symbols are identical in all four languages, so for the first time it works for Dutch, French
 * and Spanish instead of being a silent no-op there.
 *
 * The lexicon is scoped per call to the language-neutral core plus the active locale, rather than
 * the union of all four, because every extra word is another chance at a false positive in prose.
 */

const NUMBER = '\\d+(?:\\.\\d+)?';

function escapeToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

interface Lexicon {
  units: string;
  lookup: Map<string, UnitCode>;
}

const lexiconCache = new Map<SupportedLocale, Lexicon>();

function lexicon(locale: SupportedLocale): Lexicon {
  const cached = lexiconCache.get(locale);
  if (cached) return cached;

  const lookup = textUnitLookup(locale);
  const units = tokensByLengthDesc(lookup.keys()).map(escapeToken).join('|');
  const built = { units, lookup };
  lexiconCache.set(locale, built);
  return built;
}

// A unit word ends where a letter or an apostrophe does not follow: the apostrophe guard is what
// keeps French elision ("2 l'oignon" — two onions) from being read as two litres.
const UNIT_END = "\\.?(?![\\p{L}'’])";

function codeOf(lookup: Map<string, UnitCode>, word: string): UnitCode | undefined {
  // As written first: a trailing period belongs to some tokens ("c. à s.") and is decoration on
  // others ("1 lb."), so stripping it up front would lose the French spoon entirely.
  const normalized = word.toLowerCase().replace(/\s+/g, ' ');
  return lookup.get(normalized) ?? lookup.get(normalized.replace(/\.$/, ''));
}

function inSystem(code: UnitCode, system: UnitSystem): boolean {
  const unitSystem = UNIT_META[code].system;
  return unitSystem === system || unitSystem === 'both';
}

function renderTemperature(value: number, scale: 'C' | 'F', system: UnitSystem): string {
  if (system === 'imperial') {
    return `${scale === 'F' ? value : celsiusToFahrenheit(value)} °F`;
  }
  return `${scale === 'C' ? value : fahrenheitToCelsius(value)} °C`;
}

function temperatureScale(...candidates: (string | undefined)[]): 'C' | 'F' | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const first = candidate[0].toUpperCase();
    if (first === 'C' || first === 'F') return first;
  }
  return null;
}

interface Rules {
  dualUnit: RegExp;
  dualTemperature: RegExp;
  dimensions: RegExp;
  temperature: RegExp;
  standalone: RegExp;
}

const rulesCache = new Map<SupportedLocale, Rules>();

// Written out rather than a bare `C|F`: a lone uppercase F after a number is unambiguous in a
// recipe, but a lone C collides with the US shorthand for "cup", so Celsius needs the degree sign
// or the spelled-out word.
const SCALE_WORD = '(?:degrees?|graden|degrés|grados)\\s+(Celsius|Fahrenheit|celsius|fahrenheit)';
const SCALE = `(?:°\\s*([CFcf])|\\b(F)\\b|${SCALE_WORD})`;

function rules(locale: SupportedLocale): Rules {
  const cached = rulesCache.get(locale);
  if (cached) return cached;

  const { units } = lexicon(locale);
  const q = QUANTITY_TOKEN_PATTERN;

  const built: Rules = {
    // "1.5 lbs (680 g)" — the model sometimes converts inline. Keep whichever side the reader
    // wants verbatim instead of converting the other one independently and printing two numbers
    // that disagree. The bounded gap tolerates a hedge ("about", "approx.") before the number.
    dualUnit: new RegExp(
      `(${q})\\s*(${units})${UNIT_END}\\s*\\([^)]{0,24}?(${q})\\s*(${units})${UNIT_END}\\s*\\)`,
      'giu'
    ),
    dualTemperature: new RegExp(
      `(${NUMBER})\\s*${SCALE}\\s*\\([^)]{0,24}?(${NUMBER})\\s*${SCALE}\\s*\\)`,
      'gu'
    ),
    // "9x13-inch pan" must be handled before the standalone rule, which would otherwise convert
    // only the number the unit is attached to and leave "9x33 cm".
    dimensions: new RegExp(`(${NUMBER})\\s*[x×]\\s*(${NUMBER})[-\\s]*(${units})${UNIT_END}`, 'giu'),
    temperature: new RegExp(`(?:(${NUMBER})\\s*[-–]\\s*)?(${NUMBER})\\s*${SCALE}`, 'gu'),
    standalone: new RegExp(`(?:(${q})\\s*[-–]\\s*)?(${q})[-\\s]*(${units})${UNIT_END}`, 'giu'),
  };

  rulesCache.set(locale, built);
  return built;
}

/**
 * Rewrites every measurement in a block of instruction prose into the reader's unit system.
 *
 * Deliberately out of reach, and left untouched rather than guessed at: a bare "bake at 350" with
 * no scale marker (telling it from an ordinary number needs oven-verb lists in four languages, and
 * a wrong guess burns the dish), worded amounts ("a cup of flour", "un verre d'eau"), and sizes
 * given by comparison ("a pan the size of a dinner plate").
 */
export function convertTextUnits(
  text: string,
  system: UnitSystem,
  locale: SupportedLocale,
  smallVolumes: SmallVolumeStyle = DEFAULT_SMALL_VOLUME_STYLE
): string {
  try {
    const { lookup } = lexicon(locale);
    const rule = rules(locale);
    const context = { locale, unitSystem: system, smallVolumes };

    const renderRange = (start: number | null, end: number, unit: UnitCode): string => {
      const endText = formatMeasurement(end, unit, context);
      if (start === null) return endText;
      const startRendered = formatMeasurement(start, unit, context);
      // Both ends can land on the same value once rounded; "30-30 ml" must never ship.
      if (startRendered === endText) return endText;
      // Only the last of the two carries the unit word, as ranges are conventionally written.
      return `${startRendered.replace(/\s+\S+$/, '')}-${endText}`;
    };

    return normalizeFractionChars(text)
      .replace(
        rule.dualUnit,
        (whole, aValue: string, aUnit: string, bValue: string, bUnit: string) => {
          const aCode = codeOf(lookup, aUnit);
          const bCode = codeOf(lookup, bUnit);
          if (!aCode || !bCode) return whole;
          const keepB = !inSystem(aCode, system) && inSystem(bCode, system);
          const [value, code] = keepB
            ? [parseQuantityToken(bValue), bCode]
            : [parseQuantityToken(aValue), aCode];
          if (!Number.isFinite(value)) return whole;
          return formatMeasurement(value, code, context);
        }
      )
      .replace(
        rule.dualTemperature,
        (
          whole,
          aValue: string,
          aSign: string | undefined,
          aBare: string | undefined,
          aWord: string | undefined,
          bValue: string,
          bSign: string | undefined,
          bBare: string | undefined,
          bWord: string | undefined
        ) => {
          const aScale = temperatureScale(aSign, aBare, aWord);
          const bScale = temperatureScale(bSign, bBare, bWord);
          if (!aScale || !bScale) return whole;
          const wanted = system === 'imperial' ? 'F' : 'C';
          const keepB = aScale !== wanted && bScale === wanted;
          return keepB
            ? renderTemperature(Number(bValue), bScale, system)
            : renderTemperature(Number(aValue), aScale, system);
        }
      )
      .replace(rule.dimensions, (whole, a: string, b: string, unitWord: string) => {
        const code = codeOf(lookup, unitWord);
        if (!code) return whole;
        const first = formatMeasurement(Number(a), code, context);
        const second = formatMeasurement(Number(b), code, context);
        const label = second.replace(/^\S+\s*/, '');
        const firstValue = first.replace(/\s+\S+$/, '');
        const secondValue = second.replace(/\s+\S+$/, '');
        return `${firstValue}x${secondValue} ${label}`;
      })
      .replace(
        rule.temperature,
        (
          whole,
          start: string | undefined,
          end: string,
          sign: string | undefined,
          bare: string | undefined,
          word: string | undefined
        ) => {
          const scale = temperatureScale(sign, bare, word);
          if (!scale) return whole;
          const endText = renderTemperature(Number(end), scale, system);
          if (start === undefined) return endText;
          const startText = renderTemperature(Number(start), scale, system);
          if (startText === endText) return endText;
          return `${startText.replace(/\s+\S+$/, '')}-${endText}`;
        }
      )
      .replace(
        rule.standalone,
        (whole, start: string | undefined, end: string, unitWord: string) => {
          const code = codeOf(lookup, unitWord);
          if (!code) return whole;
          const endValue = parseQuantityToken(end);
          if (!Number.isFinite(endValue)) return whole;
          const startValue = start === undefined ? null : parseQuantityToken(start);
          if (startValue !== null && !Number.isFinite(startValue)) return whole;
          return renderRange(startValue, endValue, code);
        }
      );
  } catch {
    // A recipe is never worth throwing over; an unconverted instruction is a far better outcome
    // than a 502 on the whole turn.
    return text;
  }
}
