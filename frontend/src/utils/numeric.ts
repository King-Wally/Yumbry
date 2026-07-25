/** Converts a Postgres NUMERIC-as-string API value to a number, with a fallback for null/undefined. */
export function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}
