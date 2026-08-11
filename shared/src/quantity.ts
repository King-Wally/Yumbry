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
