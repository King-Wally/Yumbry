import { error, fail, redirect } from '@sveltejs/kit';
import { setFlash } from '#lib/server/http/flash.ts';
import { requireRecipe } from '#lib/server/auth/guards.ts';
import { parseRecipeId } from '#lib/server/recipes/recipe-id.ts';
import { getVersion, listVersions, revertToVersion } from '#lib/server/recipes/versions.ts';
import { getRecipe } from '#lib/server/recipes/recipes.ts';
import { diffRecipes } from '#lib/shared/recipe/diff.ts';
import { toRecipeSnapshot } from '#lib/shared/recipe/snapshot.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { recipeId, familyId } = await requireRecipe(event, event.params.id);
	const [recipe, versions] = await Promise.all([
		getRecipe(recipeId, familyId),
		listVersions(recipeId, familyId)
	]);
	// Null only if the recipe was deleted since requireRecipe looked.
	if (!recipe) error(404, 'Recipe not found.');

	// `?version=` picks one; anything else (missing, malformed, not this recipe's) means the newest.
	const picked = parseRecipeId(event.url.searchParams.get('version'));
	const selectedId = versions.find((v) => v.id === picked)?.id ?? versions[0]?.id ?? null;
	const version = selectedId === null ? null : await getVersion(recipeId, selectedId, familyId);

	return {
		recipeId,
		currentSavedAt: recipe.updated_at.toISOString(),
		versions,
		selected: version && { id: version.id, saved_at: version.saved_at },
		diff: version && diffRecipes(version.snapshot, toRecipeSnapshot(recipe))
	};
};

export const actions: Actions = {
	revert: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		const versionId = parseRecipeId((await event.request.formData()).get('version'));
		if (versionId === null || !(await revertToVersion(recipeId, versionId, familyId))) {
			return fail(404, { revertError: true });
		}
		setFlash(event, 'recipe_reverted');
		redirect(303, `/recipes/${recipeId}`);
	}
};
