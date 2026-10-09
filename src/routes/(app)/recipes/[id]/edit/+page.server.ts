import { error, fail, redirect } from '@sveltejs/kit';
import { takeDraft } from '#lib/server/recipes/draft-handoff.ts';
import { requireRecipe } from '#lib/server/auth/guards.ts';
import { optimizeRecipePhoto, UnreadableImageError } from '#lib/server/uploads/image-prep.ts';
import { estimateNutrition } from '#lib/server/ai/nutrition-action.ts';
import { parseRecipeForm } from '#lib/server/recipes/form-action.ts';
import { getRecipe, setRecipePhoto, updateRecipe } from '#lib/server/recipes/recipes.ts';
import { listCategories, listTags } from '#lib/server/recipes/tags-categories.ts';
import {
	checkPhotoFile,
	deleteUploadedFile,
	saveRecipePhoto,
	type PhotoError
} from '#lib/server/uploads/storage.ts';
import { formStateFromDraft } from '#lib/shared/recipe/form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user, recipeId, familyId } = await requireRecipe(event, event.params.id);
	// A draft from "Improve with AI" (draft-handoff.ts) replaces the saved values for review.
	const pending = takeDraft(event.cookies, user.id, recipeId);
	const [recipe, tags, categories] = await Promise.all([
		getRecipe(recipeId, familyId),
		listTags(familyId),
		listCategories(familyId)
	]);
	// Null only if the recipe was deleted since requireRecipe looked.
	if (!recipe) error(404, 'Recipe not found.');
	return {
		recipe,
		tags,
		categories,
		draft: pending ? formStateFromDraft(pending.draft) : null,
		draftSource: pending?.source ?? null
	};
};

export const actions: Actions = {
	estimateNutrition,

	save: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		const parsed = await parseRecipeForm(event.request);
		if (!('input' in parsed)) return parsed;

		if (!(await updateRecipe(recipeId, parsed.input, familyId))) error(404, 'Recipe not found.');
		redirect(303, `/recipes/${recipeId}`);
	},

	// Runs as soon as a file is picked, independently of saving the form. A refusal leaves the
	// current photo as it is.
	photo: async (event) => {
		const { recipeId, familyId } = await requireRecipe(event, event.params.id);
		const file = (await event.request.formData()).get('photo');
		const refusal = checkPhotoFile(file);
		if (refusal) return refuse(refusal);

		let webp: Buffer;
		try {
			webp = await optimizeRecipePhoto(Buffer.from(await (file as File).arrayBuffer()));
		} catch (err) {
			if (err instanceof UnreadableImageError) return refuse('unreadable_image');
			throw err;
		}

		const imagePath = await saveRecipePhoto(recipeId, webp);
		if (!(await setRecipePhoto(recipeId, imagePath, familyId))) {
			await deleteUploadedFile(imagePath);
			error(404, 'Recipe not found.');
		}
		return { image_path: imagePath };
	}
};

function refuse(photoError: PhotoError) {
	return fail(400, { photoError });
}
