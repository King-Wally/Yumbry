import { error, redirect } from '@sveltejs/kit';
import { requireRecipe } from '#lib/server/guards.ts';
import { disableShare, enableShare, shareUrl } from '#lib/server/services/recipe-share.ts';
import { deleteRecipe, getRecipe } from '#lib/server/services/recipes.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { recipeId, familyId } = await requireRecipe(event, event.params.id);
	// Null only if the recipe was deleted since requireRecipe looked.
	const recipe = await getRecipe(recipeId, familyId);
	if (!recipe) error(404, 'Recipe not found.');
	return {
		recipe,
		shareUrl: recipe.share_token ? shareUrl(event.url.origin, recipe.share_token) : null
	};
};

export const actions: Actions = {
	delete: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		if (!(await deleteRecipe(recipeId, familyId))) error(404, 'Recipe not found.');
		redirect(303, '/');
	},
	// Idempotent: an already shared recipe keeps its link. The reloaded page shows it.
	share: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		if ((await enableShare(recipeId, familyId)) === null) error(404, 'Recipe not found.');
	},
	unshare: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		if (!(await disableShare(recipeId, familyId))) error(404, 'Recipe not found.');
	}
};
