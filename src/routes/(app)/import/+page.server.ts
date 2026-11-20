import { fail, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { requireJsonImportExport, requireUser } from '#lib/server/auth/guards.ts';
import { formString } from '#lib/server/http/form.ts';
import { failKinded } from '#lib/server/http/kinded-errors.ts';
import { RecipeBodySchema } from '#lib/server/recipes/body-schema.ts';
import { JsonLdImportError, parseRecipeFromJsonLd } from '#lib/server/recipes/jsonld-import.ts';
import { createRecipe } from '#lib/server/recipes/recipes.ts';
import type { Actions, PageServerLoad } from './$types';

const JSON_IMPORT_LIMIT_MB = 2;

export const load: PageServerLoad = (event) => {
	requireJsonImportExport(requireUser(event));
};

export const actions: Actions = {
	// Pasted text or an uploaded .json file, saved straight away. A file wins over text.
	default: async (event) => {
		const { user, familyId } = requireJsonImportExport(requireUser(event));
		const form = await event.request.formData();
		const file = form.get('file');
		const jsonLd = formString(form, 'jsonLd');

		let text: string;
		if (file instanceof File && file.size > 0) {
			if (file.size > JSON_IMPORT_LIMIT_MB * 1024 * 1024) {
				return fail(413, {
					message: m.import_json_error_too_large({ limitMb: JSON_IMPORT_LIMIT_MB })
				});
			}
			text = await file.text();
		} else if (jsonLd.trim()) {
			text = jsonLd;
		} else {
			return fail(400, { message: m.import_json_error_empty() });
		}

		let id: number;
		try {
			// The JSON-LD parser doesn't know the column limits or that a title is required.
			const body = RecipeBodySchema.safeParse(parseRecipeFromJsonLd(text));
			if (!body.success) throw new JsonLdImportError('Recipe fails validation.', 'invalid_recipe');
			id = await createRecipe(body.data, { familyId, authorId: user.id });
		} catch (err) {
			return failKinded(err);
		}
		redirect(303, `/recipes/${id}`);
	}
};
