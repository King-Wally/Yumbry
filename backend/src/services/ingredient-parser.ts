export interface ParsedIngredient {
  raw_text: string;
  amount: number | null;
  unit: string | null;
  name: string;
  is_scalable: boolean;
}

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

function normalizeDecimalComma(text: string): string {
  return text.replace(/^(\d+),(\d+)(?=\s|$)/, '$1.$2');
}

function roundAmount(amount: number): number {
  return Math.round(amount * 1000) / 1000;
}

const LEADING_QUANTITY_REGEX = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?=\s|$)/;

interface LeadingQuantity {
  amount: number;
  rest: string;
}

function parseLeadingQuantity(text: string): LeadingQuantity | null {
  const normalized = normalizeDecimalComma(normalizeFractionChars(text));
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
