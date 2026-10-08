import { error, redirect } from '@sveltejs/kit';
import { requireRecipe } from '#lib/server/guards.ts';
import { deleteRecipe, getRecipe } from '#lib/server/services/recipes.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { recipeId, familyId } = await requireRecipe(event, event.params.id);
	// Null only if the recipe was deleted since requireRecipe looked.
	const recipe = await getRecipe(recipeId, familyId);
	if (!recipe) error(404, 'Recipe not found.');
	return { recipe };
};

export const actions: Actions = {
	delete: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		if (!(await deleteRecipe(recipeId, familyId))) error(404, 'Recipe not found.');
		redirect(303, '/');
	}
};
