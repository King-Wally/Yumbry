import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Session } from '#lib/server/auth.ts';
import { parseRecipeId } from '#lib/server/recipe-id.ts';
import { recipeBelongsToFamily } from '#lib/server/services/recipes.ts';

export interface SignedIn {
	user: Session['user'];
	familyId: number;
}

/** The signed-in user, or null. `locals` is filled from the database on every request
 * (hooks.server.ts; better-auth's cookieCache is off), so familyId is always current. */
export function getUser(event: RequestEvent): SignedIn | null {
	const { user } = event.locals;
	if (!user) return null;

	// familyId is an optional additionalField in auth.ts (better-auth validates required fields
	// against the signup payload, which can never carry it), so its type is nullable even though the
	// column is NOT NULL. Fail loudly rather than cast: an undefined familyId in a `where` would
	// match nothing at best and the wrong rows at worst.
	if (typeof user.familyId !== 'number') {
		throw new Error(`User ${user.id} has no familyId`);
	}
	return { user, familyId: user.familyId };
}

/** The signed-in user, or a redirect to the login page that comes back here afterwards. */
export function requireUser(event: RequestEvent): SignedIn {
	const signedIn = getUser(event);
	if (signedIn) return signedIn;
	const back = event.url.pathname + event.url.search;
	redirect(303, `/login?redirectTo=${encodeURIComponent(back)}`);
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
		error(404, 'Recipe not found.');
	}
	return { ...signedIn, recipeId };
}
