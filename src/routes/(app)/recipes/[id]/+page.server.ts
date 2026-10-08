import { error } from '@sveltejs/kit';
import { requireRecipe } from '#lib/server/guards.ts';
import { getRecipe } from '#lib/server/services/recipes.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { recipeId, familyId } = await requireRecipe(event, event.params.id);
	// Null only if the recipe was deleted since requireRecipe looked.
	const recipe = await getRecipe(recipeId, familyId);
	if (!recipe) error(404, 'Recipe not found.');
	return { recipe };
};
