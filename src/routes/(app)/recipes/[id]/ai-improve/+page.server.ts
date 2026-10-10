import { chatTurn, readerPreferences, reviewDraft } from '#lib/server/ai/chat-action.ts';
import { recipeNotFound, requireRecipe } from '#lib/server/auth/guards.ts';
import { getRecipe } from '#lib/server/recipes/recipes.ts';
import { draftFromRecipe } from '#lib/shared/recipe/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user, recipeId, familyId } = await requireRecipe(event, event.params.id);
	const recipe = await getRecipe(recipeId, familyId);
	if (!recipe) recipeNotFound();
	// The preview starts from the saved recipe, shown as it was saved; no AI call until the cook
	// asks for a change.
	return { recipeId, draft: draftFromRecipe(recipe), preferences: readerPreferences(user) };
};

export const actions: Actions = {
	chat: async (event) => chatTurn(event, await requireRecipe(event, event.params.id), 'improve'),
	review: async (event) => {
		const signedIn = await requireRecipe(event, event.params.id);
		return reviewDraft(event, signedIn, signedIn.recipeId);
	}
};
