import {
  normalizeDecimalComma,
  normalizeFractionChars,
  parseQuantityToken,
  QUANTITY_TOKEN_PATTERN,
} from '../quantity.js';
import type { DensityKey } from './density.js';
import { RECOGNIZED_UNITS, tokensByLengthDesc } from './labels.js';
import {
  METRIC_LENGTH_BANDS,
  METRIC_MASS_BANDS,
  METRIC_VOLUME_BANDS,
  snapBands,
} from './rounding.js';
import { toBase, UNIT_META, type UnitCode } from './unit-model.js';
import type { AiIngredient } from './format.js';

const LEADING_QUANTITY_REGEX = new RegExp(`^(${QUANTITY_TOKEN_PATTERN})(?=\\s|$)`);

// Longest-first so "fl oz" beats "oz" and "cuillère à soupe" beats "cuillère". The old parser
// matched a single ASCII word, which could never see "c. à s." at all.
const UNIT_TOKENS = tokensByLengthDesc(RECOGNIZED_UNITS.keys());

export interface ParsedPrefix {
  quantity: number | null;
  /** Set when the unit word maps to something we can convert. */
  unit: UnitCode | null;
  /** The unit word exactly as written, whether or not it is convertible. */
  unitWord: string | null;
  /** What is left after the quantity and unit — the ingredient itself. */
  rest: string;
}

function boundaryAt(text: string, index: number): boolean {
  if (index >= text.length) return true;
  const next = text[index];
  // An apostrophe is not a boundary: French elision means "2 l'oignon" is two onions, not two
  // litres of "oignon".
  if (next === "'" || next === '’') return false;
  return !/[\p{L}\p{N}]/u.test(next);
}

/** Longest recognised unit word at the start of `text`, tolerating inner whitespace variation. */
export function matchUnitWord(text: string): { word: string; length: number } | null {
  const lowered = text.toLowerCase();

  for (const token of UNIT_TOKENS) {
    // Tokens may contain spaces ("fl oz", "c. à s."); allow any run of whitespace where the token
    // has one, and an optional trailing period on abbreviations.
    const pattern = new RegExp(
      `^${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\.?`,
      'i'
    );
    const match = pattern.exec(lowered);
    if (!match) continue;
    if (!boundaryAt(text, match[0].length)) continue;
    return { word: text.slice(0, match[0].length).trim(), length: match[0].length };
  }

  return null;
}

export function parseMeasurementPrefix(rawText: string): ParsedPrefix {
  const normalized = normalizeDecimalComma(normalizeFractionChars(rawText.trim()));
  const quantityMatch = LEADING_QUANTITY_REGEX.exec(normalized);

  if (!quantityMatch) {
    return { quantity: null, unit: null, unitWord: null, rest: normalized };
  }

  const quantity = parseQuantityToken(quantityMatch[0]);
  const afterQuantity = normalized.slice(quantityMatch[0].length).trimStart();
  const unitMatch = matchUnitWord(afterQuantity);

  if (!unitMatch) {
    return {
      quantity: Number.isFinite(quantity) ? quantity : null,
      unit: null,
      unitWord: null,
      rest: afterQuantity,
    };
  }

  // Look the word up as written before trying it without a trailing period: the period is part of
  // some tokens ("c. à s.") and merely decoration on others ("1 lb."), and stripping it first
  // would make the French spoon unrecognisable.
  const matched = unitMatch.word;
  const lowered = matched.toLowerCase();
  const exact = RECOGNIZED_UNITS.has(lowered);
  const code =
    (exact ? RECOGNIZED_UNITS.get(lowered) : RECOGNIZED_UNITS.get(lowered.replace(/\.$/, ''))) ??
    null;
  const word = exact ? matched : matched.replace(/\.$/, '');

  return {
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit: code,
    unitWord: word,
    rest: afterQuantity.slice(unitMatch.length).replace(/^[\s,.;]+/, ''),
  };
}

function stripLeadingOf(text: string): string {
  return text.replace(/^(?:of|van)\s+/i, '').trim();
}

/**
 * Normalises a value written in any recognised unit into the canonical metric base for its
 * dimension. Imperial sources are snapped to culinary metric values here and not again later, so
 * "1 lb" becomes 450 g rather than 453.59237 g and stays there however many times it is re-parsed.
 */
export function toCanonicalMetric(
  quantity: number,
  unit: UnitCode
): { quantity: number; unit: 'g' | 'ml' | 'cm' } {
  const base = toBase(quantity, unit);
  const { dimension, system } = UNIT_META[unit];
  const canonical = dimension === 'mass' ? 'g' : dimension === 'volume' ? 'ml' : 'cm';

  if (system === 'metric') return { quantity: base, unit: canonical };

  const bands =
    dimension === 'mass'
      ? METRIC_MASS_BANDS
      : dimension === 'volume'
        ? METRIC_VOLUME_BANDS
        : METRIC_LENGTH_BANDS;

  return { quantity: snapBands(base, bands), unit: canonical };
}

/**
 * Turns a free-form ingredient line into the canonical structured form. Used wherever a line
 * reaches us as text instead of as an object: a model that ignored the schema on the no-schema
 * fallback rung, or a draft seeded from a recipe that was typed or imported rather than generated.
 *
 * The line may itself be imperial — it might even be a line we rendered for an imperial reader on
 * the previous turn and the client echoed back — so this normalises rather than merely parsing.
 */
export function toCanonicalIngredient(line: string, densityKey: DensityKey = 'none'): AiIngredient {
  const parsed = parseMeasurementPrefix(line);

  if (parsed.quantity === null) {
    return { item: line.trim(), quantity: null, unit: '', note: null, density_key: densityKey };
  }

  if (parsed.unit) {
    const canonical = toCanonicalMetric(parsed.quantity, parsed.unit);
    return {
      item: stripLeadingOf(parsed.rest) || line.trim(),
      quantity: canonical.quantity,
      unit: canonical.unit,
      note: null,
      density_key: densityKey,
    };
  }

  return {
    item: stripLeadingOf(parsed.rest) || line.trim(),
    quantity: parsed.quantity,
    // A recognised-but-inconvertible word ("clove", "snuifje") is kept verbatim so the line still
    // reads correctly; an absent one means the item is simply counted.
    unit: parsed.unitWord ?? '',
    note: null,
    density_key: densityKey,
  };
}
