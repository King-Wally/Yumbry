import { requireRecipe } from '#lib/server/guards.ts';
import type { PageServerLoad } from './$types';

// Placeholder until step 12: only the access check, so other families' recipes already 404.
export const load: PageServerLoad = async (event) => {
	await requireRecipe(event, event.params.id);
};
