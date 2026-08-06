export interface ParsedIngredient {
  raw_text: string;
  amount: number | null;
  unit: string | null;
  name: string;
  is_scalable: boolean;
}

// Common cooking units, one entry per recognized spelling (short form, plural,
// and common alternates), matched case-insensitively. `unit` is returned
// exactly as written in the ingredient line and stored as free text
// downstream (no DB enum/FK), so this table only needs to cover what recipe
// text realistically uses — it doesn't need to normalize to a canonical form.
const UNIT_WORDS = new Set([
  'cup',
  'cups',
  'c',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'tbsps',
  'tbs',
  'teaspoon',
  'teaspoons',
  'tsp',
  'tsps',
  'ounce',
  'ounces',
  'oz',
  'pound',
  'pounds',
  'lb',
  'lbs',
  'gram',
  'grams',
  'g',
  'gr',
  'kilogram',
  'kilograms',
  'kg',
  'kgs',
  'milligram',
  'milligrams',
  'mg',
  'milliliter',
  'milliliters',
  'millilitre',
  'millilitres',
  'ml',
  'liter',
  'liters',
  'litre',
  'litres',
  'l',
  'pinch',
  'pinches',
  'dash',
  'dashes',
  'clove',
  'cloves',
  'can',
  'cans',
  'package',
  'packages',
  'pack',
  'packs',
  'pkg',
  'slice',
  'slices',
  'piece',
  'pieces',
  'pint',
  'pints',
  'quart',
  'quarts',
  'gallon',
  'gallons',
  'inch',
  'inches',
  'centimeter',
  'centimeters',
  'centimetre',
  'centimetres',
  'cm',
  'stick',
  'sticks',
  'sprig',
  'sprigs',
  'bunch',
  'bunches',
]);

// Unicode vulgar fractions and the fraction-slash character, normalized to
// ASCII "n/d" (or "/") before numeric parsing.
const VULGAR_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅐': '1/7',
  '⅑': '1/9',
  '⅒': '1/10',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
  '⁄': '/',
};

function normalizeFractionChars(text: string): string {
  return text.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]/g, (char) => VULGAR_FRACTIONS[char] ?? char);
}

function roundAmount(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

// Matches, at the start of a string: a mixed number ("1 1/2"), a plain
// fraction ("1/2"), or a decimal/integer ("2" / "2.5"), followed by
// whitespace or end-of-string.
const LEADING_QUANTITY_REGEX = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?=\s|$)/;

interface LeadingQuantity {
  amount: number;
  rest: string;
}

function parseLeadingQuantity(text: string): LeadingQuantity | null {
  const normalized = normalizeFractionChars(text);
  const match = LEADING_QUANTITY_REGEX.exec(normalized);
  if (!match) {
    return null;
  }

  const token = match[0];
  const rest = normalized.slice(match[0].length);

  const mixedMatch = /^(\d+)\s+(\d+)\/(\d+)$/.exec(token);
  if (mixedMatch) {
    const [, whole, num, den] = mixedMatch;
    return { amount: roundAmount(Number(whole) + Number(num) / Number(den)), rest };
  }

  const fractionMatch = /^(\d+)\/(\d+)$/.exec(token);
  if (fractionMatch) {
    const [, num, den] = fractionMatch;
    return { amount: roundAmount(Number(num) / Number(den)), rest };
  }

  return { amount: roundAmount(Number(token)), rest };
}

interface UnitMatch {
  unit: string;
  rest: string;
}

function matchUnitPrefix(text: string): UnitMatch | null {
  const trimmed = text.trimStart();
  // Allow an optional trailing period on the unit word itself (e.g. "lb.",
  // "tbsp.") without absorbing it into the remainder, then also consume any
  // punctuation/whitespace separating the unit from the rest of the line.
  const wordMatch = /^([A-Za-z]+)\.?\b/.exec(trimmed);
  if (!wordMatch) {
    return null;
  }

  const word = wordMatch[1];
  if (!UNIT_WORDS.has(word.toLowerCase())) {
    return null;
  }

  const rest = trimmed.slice(wordMatch[0].length).replace(/^[\s,.;]+/, ' ');
  return { unit: word, rest };
}

function stripLeadingOf(text: string): string {
  return text.replace(/^[\s,.;]*of\s+/i, '');
}

/**
 * Parses a single raw ingredient line into structured amount/unit/name fields.
 * Never throws: unparseable lines fall back to the raw text with amount: null
 * and is_scalable: false, per the import spec.
 */
export function parseIngredientLine(rawText: string): ParsedIngredient {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      raw_text: rawText,
      amount: null,
      unit: null,
      name: rawText,
      is_scalable: false,
    };
  }

  const leading = parseLeadingQuantity(trimmed);

  if (!leading) {
    // No leading quantity found (e.g. "For the icing:" or "salt to taste") —
    // treated as unscalable free text, same as an unparseable line.
    return {
      raw_text: rawText,
      amount: null,
      unit: null,
      name: rawText,
      is_scalable: false,
    };
  }

  const unitMatch = matchUnitPrefix(leading.rest);
  const remainder = unitMatch ? unitMatch.rest : leading.rest;
  const name = stripLeadingOf(remainder).trim() || rawText;

  return {
    raw_text: rawText,
    amount: leading.amount,
    unit: unitMatch?.unit ?? null,
    name,
    is_scalable: true,
  };
}
