import { redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/guards.ts';
import { parseRecipeForm } from '#lib/server/recipe-form-action.ts';
import { createRecipe } from '#lib/server/services/recipes.ts';
import { listCategories, listTags } from '#lib/server/services/tags-categories.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { familyId } = requireUser(event);
	const [tags, categories] = await Promise.all([listTags(familyId), listCategories(familyId)]);
	return { tags, categories };
};

export const actions: Actions = {
	save: async (event) => {
		const { user, familyId } = requireUser(event);
		const parsed = await parseRecipeForm(event.request);
		if (!('input' in parsed)) return parsed;

		const id = await createRecipe(parsed.input, { familyId, authorId: user.id });
		redirect(303, `/recipes/${id}`);
	}
};
