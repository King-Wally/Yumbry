import { redirect } from '@sveltejs/kit';
import { takeDraft } from '#lib/server/draft-handoff.ts';
import { requireUser } from '#lib/server/guards.ts';
import { parseRecipeForm } from '#lib/server/recipe-form-action.ts';
import { createRecipe } from '#lib/server/services/recipes.ts';
import { listCategories, listTags } from '#lib/server/services/tags-categories.ts';
import { formStateFromDraft } from '#lib/shared/recipe-form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user, familyId } = requireUser(event);
	// A draft handed over by an import (draft-handoff.ts) pre-fills the form for review.
	const pending = takeDraft(event.cookies, user.id);
	const [tags, categories] = await Promise.all([listTags(familyId), listCategories(familyId)]);
	return {
		tags,
		categories,
		draft: pending ? formStateFromDraft(pending.draft) : null,
		draftSource: pending?.source ?? null
	};
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
