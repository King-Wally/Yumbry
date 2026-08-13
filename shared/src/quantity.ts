// A quantity token: a mixed number ("1 1/2"), a simple fraction ("1/2"), or a plain integer/decimal.
// Shared between the AI recipe draft's unit converter and the backend's ingredient-line parser so
// the two never drift apart on what counts as a parseable quantity.
export const QUANTITY_TOKEN_PATTERN = '\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?';

/**
 * Parses a quantity token matched via `QUANTITY_TOKEN_PATTERN` into a number. Returns `NaN` for a
 * fraction with a zero denominator (e.g. a garbled "5/0") rather than `Infinity`, so callers can
 * treat it the same as any other unparseable input instead of propagating an infinite value.
 */
export function parseQuantityToken(token: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(token);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator === 0 ? NaN : Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const fraction = /^(\d+)\/(\d+)$/.exec(token);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? NaN : Number(fraction[1]) / denominator;
  }

  return Number(token);
}

const VULGAR_FRACTION_CHARS = '¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';

export const VULGAR_FRACTIONS: Record<string, string> = {
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

const MIXED_VULGAR_REGEX = new RegExp(`(\\d)\\s*([${VULGAR_FRACTION_CHARS}])`, 'g');
const VULGAR_REGEX = new RegExp(`[${VULGAR_FRACTION_CHARS}⁄]`, 'g');

/**
 * Rewrites vulgar fraction characters as ASCII fractions ("½" -> "1/2") so the rest of the
 * pipeline only ever deals with `QUANTITY_TOKEN_PATTERN` shapes.
 *
 * The first pass exists because "1½" is a mixed number: substituting directly would splice it into
 * "11/2", which a leading-quantity match then reads as eleven halves — a silent 5.5x on any
 * recipe pasted in with vulgar fractions. Inserting the separator first yields "1 1/2".
 */
export function normalizeFractionChars(text: string): string {
  return text
    .replace(MIXED_VULGAR_REGEX, '$1 $2')
    .replace(VULGAR_REGEX, (char) => VULGAR_FRACTIONS[char] ?? char);
}

/** Turns a leading "4,5" into "4.5" so a comma-decimal locale still parses. */
export function normalizeDecimalComma(text: string): string {
  return text.replace(/^(\d+),(\d+)(?=\s|$)/, '$1.$2');
}
