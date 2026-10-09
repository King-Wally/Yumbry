import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import * as z from 'zod';
import { requireUser, type SignedIn } from '#lib/server/guards.ts';
import { parseRecipeFromJsonLd } from '#lib/server/jsonld-import.ts';
import { createRecipe } from '#lib/server/services/recipes.ts';
import type { Actions, PageServerLoad } from './$types';

const JSON_IMPORT_LIMIT_MB = 2;

/** The page exists only while the user has JSON import/export turned on. */
function requireJsonImport(event: RequestEvent): SignedIn {
	const signedIn = requireUser(event);
	if (!signedIn.user.jsonImportExportEnabled) error(404, 'Not found');
	return signedIn;
}

export const load: PageServerLoad = (event) => {
	requireJsonImport(event);
};

export const actions: Actions = {
	// Pasted text or an uploaded .json file, saved straight away. A file wins over text. Errors are
	// main's English messages, as main showed the server's text.
	default: async (event) => {
		const { user, familyId } = requireJsonImport(event);
		const form = await event.request.formData();
		const file = form.get('file');
		const pasted = form.get('jsonLd');
		const jsonLd = typeof pasted === 'string' ? pasted : '';

		let text: string;
		if (file instanceof File && file.size > 0) {
			if (file.size > JSON_IMPORT_LIMIT_MB * 1024 * 1024) {
				return fail(413, {
					message: `That file is too large. Please use one under ${JSON_IMPORT_LIMIT_MB} MB.`
				});
			}
			text = await file.text();
		} else if (jsonLd.trim()) {
			text = jsonLd;
		} else {
			return fail(400, { message: 'Provide JSON-LD text or upload a .json file.' });
		}

		let id: number;
		try {
			id = await createRecipe(parseRecipeFromJsonLd(text), { familyId, authorId: user.id });
		} catch (err) {
			if (err instanceof z.ZodError) {
				return fail(400, {
					message: 'The JSON-LD document must be a JSON object or array.'
				});
			}
			if (
				err instanceof SyntaxError ||
				(err instanceof Error && err.message.includes('No schema.org Recipe'))
			) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
		redirect(303, `/recipes/${id}`);
	}
};
