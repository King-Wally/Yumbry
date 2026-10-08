import { fail, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { parseEnvelope, readerPreferences } from '#lib/server/ai-chat-action.ts';
import { stashDraft } from '#lib/server/draft-handoff.ts';
import { requireUser } from '#lib/server/guards.ts';
import { prepareImageForModel, UnreadableImageError } from '#lib/server/image-prep.ts';
import { failKinded } from '#lib/server/kinded-errors.ts';
import { limitClient, photoImportLimiter } from '#lib/server/rate-limit.ts';
import { assertOpenRouterBudget } from '#lib/server/services/ai-budget.ts';
import { chatWithAi } from '#lib/server/services/ai-provider.ts';
import { checkPhotoFile, PHOTO_LIMIT_MB, type PhotoRefusal } from '#lib/server/uploads.ts';
import { buildPhotoImportMessages } from '#lib/shared/ai-photo-import.ts';
import { AI_ENVELOPE_JSON_SCHEMA, RECIPE_SAMPLING } from '#lib/shared/ai-recipe-draft.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requireUser(event);
};

function refusalMessage(refusal: PhotoRefusal): string {
	switch (refusal) {
		case 'unsupported_type':
			return m.photo_error_unsupported_type();
		case 'too_large':
			return m.photo_error_too_large({ limitMb: PHOTO_LIMIT_MB });
		case 'missing':
			return m.photo_error_missing();
	}
}

export const actions: Actions = {
	// Reads a recipe off the photo with the vision model and hands it to /recipes/new as a draft for
	// review. The photo itself is not kept.
	default: async (event) => {
		const { user } = requireUser(event);

		const limit = limitClient(event, photoImportLimiter);
		if (limit.limited) return fail(429, { message: limit.message });

		let dataUrl: string;
		try {
			// Before the upload is read, so a refused import never has its photo taken in.
			await assertOpenRouterBudget(user.id);

			// The page has two inputs (camera and file); whichever was used carries the photo.
			const photos = (await event.request.formData()).getAll('photo');
			const file = photos.find((entry) => typeof entry !== 'string' && entry.size > 0) ?? null;
			const refusal = checkPhotoFile(file);
			if (refusal) return fail(400, { message: refusalMessage(refusal) });

			const prepared = await prepareImageForModel(Buffer.from(await (file as File).arrayBuffer()));
			dataUrl = `data:image/jpeg;base64,${prepared.toString('base64')}`;
		} catch (err) {
			if (err instanceof UnreadableImageError) {
				return fail(400, { message: m.photo_error_unreadable_image(), kind: 'unreadable_image' });
			}
			return failKinded(err);
		}

		let envelope;
		const preferences = readerPreferences(user);
		try {
			const raw = await chatWithAi(buildPhotoImportMessages(dataUrl, preferences.locale), {
				userId: user.id,
				jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
				sampling: RECIPE_SAMPLING,
				tier: 'image'
			});
			envelope = parseEnvelope(raw, { currentDraft: null, ...preferences });
		} catch (err) {
			return failKinded(err);
		}

		// A photo with no recipe in it comes back as `"recipe": null`, which the parser fills with an
		// empty draft. Show the model's own explanation rather than a blank form.
		const { recipe, reply } = envelope;
		if (!recipe.ingredients.length && !recipe.instructions.length) {
			return fail(422, { message: reply, kind: 'no_recipe_found' });
		}

		const draft = { ...recipe, ingredients_structured: undefined };
		stashDraft(event.cookies, user.id, draft, 'photo', null);
		redirect(303, '/recipes/new');
	}
};
