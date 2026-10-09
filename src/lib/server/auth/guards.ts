import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Session } from '#lib/server/auth/better-auth.ts';
import { parseRecipeId } from '#lib/server/recipes/recipe-id.ts';
import { rememberReturnTo } from '#lib/server/auth/return-to.ts';
import { recipeBelongsToFamily } from '#lib/server/recipes/recipes.ts';

export interface SignedIn {
	user: Session['user'];
	familyId: number;
}

/** The signed-in user, or null. `locals` is filled from the database on every request
 * (hooks.server.ts; better-auth's cookieCache is off), so familyId is always current. */
export function getUser(event: RequestEvent): SignedIn | null {
	const { user } = event.locals;
	if (!user) return null;

	// familyId is an optional additionalField in better-auth.ts (better-auth validates required fields
	// against the signup payload, which can never carry it), so its type is nullable even though the
	// column is NOT NULL. Fail loudly rather than cast: an undefined familyId in a `where` would
	// match nothing at best and the wrong rows at worst.
	if (typeof user.familyId !== 'number') {
		throw new Error(`User ${user.id} has no familyId`);
	}
	return { user, familyId: user.familyId };
}

/** The signed-in user, or a redirect to /login, which comes back here afterwards (the page is
 * remembered in a cookie, see #lib/server/auth/return-to.ts). */
export function requireUser(event: RequestEvent): SignedIn {
	const signedIn = getUser(event);
	if (signedIn) return signedIn;
	rememberReturnTo(event);
	redirect(303, '/login');
}

/** The signed-in user plus a recipe id their family owns. A malformed id, a missing recipe and
 * another family's recipe all get the same 404, so ids leak nothing. */
export async function requireRecipe(
	event: RequestEvent,
	rawId: string | undefined
): Promise<SignedIn & { recipeId: number }> {
	const signedIn = requireUser(event);
	const recipeId = parseRecipeId(rawId);
	if (recipeId === null || !(await recipeBelongsToFamily(recipeId, signedIn.familyId))) {
		recipeNotFound();
	}
	return { ...signedIn, recipeId };
}

/** The 404 for a recipe the family can't see, whatever the reason. */
export function recipeNotFound(): never {
	error(404, 'Recipe not found.');
}

/** `signedIn` back, or a 404: JSON import and export exist only while the user has them turned
 * on in settings. */
export function requireJsonImportExport<T extends SignedIn>(signedIn: T): T {
	if (!signedIn.user.jsonImportExportEnabled) error(404, 'Not found.');
	return signedIn;
}
