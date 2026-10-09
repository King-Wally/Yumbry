import { requireUser } from '#lib/server/auth/guards.ts';
import type { LayoutServerLoad } from './$types';

// Every page in this group needs a signed-in user; signed-out visitors go to /login.
//
// This only covers navigation. Page loads run in parallel with this one, and form actions don't
// run it at all, so each of them must still call requireUser (or requireRecipe) itself.
export const load: LayoutServerLoad = (event) => {
	requireUser(event);
};
