/** Postgres int4 upper bound, the type of recipes.id. A larger id would make the query fail
 * rather than find nothing. */
const MAX_INT4 = 2147483647;

/** Parses a recipe id from a route param, or returns null.
 *
 * The regex runs before any number conversion, so no NaN can exist downstream. It refuses '',
 * '0', '-1', '1.0', '1e3', ' 1', '007', 'abc' and every traversal form such as '../../etc' (Kit
 * decodes params, so `..%2F` arrives as `../`). The {0,9} length cap means the int4 check only
 * ever sees a safe integer. */
export function parseRecipeId(raw: unknown): number | null {
	if (typeof raw !== 'string' || !/^[1-9]\d{0,9}$/.test(raw)) return null;
	const id = Number(raw);
	return id <= MAX_INT4 ? id : null;
}
