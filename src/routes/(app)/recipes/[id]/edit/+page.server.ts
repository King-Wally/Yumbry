import { error, fail, redirect } from '@sveltejs/kit';
import { requireRecipe } from '#lib/server/guards.ts';
import { optimizeRecipePhoto, UnreadableImageError } from '#lib/server/image-prep.ts';
import { parseRecipeForm } from '#lib/server/recipe-form-action.ts';
import { getRecipe, setRecipePhoto, updateRecipe } from '#lib/server/services/recipes.ts';
import { listCategories, listTags } from '#lib/server/services/tags-categories.ts';
import {
	checkPhotoFile,
	deleteUploadedFile,
	saveRecipePhoto,
	type PhotoError
} from '#lib/server/uploads.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { recipeId, familyId } = await requireRecipe(event, event.params.id);
	const [recipe, tags, categories] = await Promise.all([
		getRecipe(recipeId, familyId),
		listTags(familyId),
		listCategories(familyId)
	]);
	// Null only if the recipe was deleted since requireRecipe looked.
	if (!recipe) error(404, 'Recipe not found.');
	return { recipe, tags, categories };
};

export const actions: Actions = {
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
