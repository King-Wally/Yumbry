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

/**
 * A Postgres numeric as the recipe DTOs and version snapshots carry it: without trailing zeros,
 * so a `numeric(8,2)` "14.50" reads "14.5" and "4.00" reads "4".
 */
export function decimalString(value: string): string;
export function decimalString(value: string | null): string | null;
export function decimalString(value: string | null): string | null {
	if (value === null || !value.includes('.')) return value;
	return value.replace(/\.?0+$/, '');
}
