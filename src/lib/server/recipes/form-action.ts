import { fail, type ActionFailure } from '@sveltejs/kit';
import * as z from 'zod';
import { RecipeBodySchema, type RecipeBody } from '#lib/server/recipes/body-schema.ts';
import {
	formStateFromFormData,
	recipeInputFromForm,
	type RecipeFormState
} from '#lib/shared/recipe/form.ts';

/** Field name → messages, for the fields a refused save got wrong. */
type RecipeFieldErrors = Partial<Record<keyof RecipeBody, string[]>>;

interface RecipeFormFailure {
	/** What was submitted, so the form re-renders with it after a submit made before hydration. */
	values: RecipeFormState;
	errors: RecipeFieldErrors;
}

/** Reads a submitted recipe form into what the services save, or the 400 to answer with. */
export async function parseRecipeForm(
	request: Request
): Promise<{ input: RecipeBody } | ActionFailure<RecipeFormFailure>> {
	const values = formStateFromFormData(await request.formData());
	const result = RecipeBodySchema.safeParse(recipeInputFromForm(values));
	if (!result.success) {
		return fail(400, { values, errors: z.flattenError(result.error).fieldErrors });
	}
	return { input: result.data };
}
