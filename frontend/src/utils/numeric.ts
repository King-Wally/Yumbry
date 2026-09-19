export function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}

/**
 * For the Decimal columns that may legitimately be absent (the nutrition values): a missing value
 * has to stay missing rather than collapsing to 0, which would read as a real measurement.
 */
export function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
