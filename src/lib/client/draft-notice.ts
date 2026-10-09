import { m } from '#lib/paraglide/messages.js';

/** The notice over a recipe form holding a handed-off draft (#lib/server/recipes/draft-handoff.ts), saying
 * where it came from so the cook knows nothing is saved yet. */
export function draftNotice(source: 'url' | 'photo' | 'ai' | null): string | undefined {
	switch (source) {
		case 'url':
			return m.recipe_form_reviewing_url_draft();
		case 'photo':
			return m.recipe_form_reviewing_photo_draft();
		case 'ai':
			return m.recipe_form_reviewing_ai_draft();
		default:
			return undefined;
	}
}
