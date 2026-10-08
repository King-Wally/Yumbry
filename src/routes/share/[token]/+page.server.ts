import { error, redirect } from '@sveltejs/kit';
import { setFlash } from '#lib/server/flash.ts';
import { getUser } from '#lib/server/guards.ts';
import { rememberReturnTo } from '#lib/server/return-to.ts';
import {
	getSharedRecipe,
	importSharedRecipe,
	isShareToken
} from '#lib/server/services/recipe-share.ts';
import type { Actions, PageServerLoad } from './$types';

// Public: the token in the URL is the credential for reading. Saving a copy needs an account.
// An unknown, stopped or malformed token is a 404, which +error.svelte shows as the dead-link page.

export const load: PageServerLoad = async (event) => {
	const { token } = event.params;
	const signedIn = getUser(event);
	const recipe = isShareToken(token) ? await getSharedRecipe(token, signedIn?.familyId) : null;
	if (!recipe) error(404, 'Shared recipe not found');

	// Stopping sharing must take effect on the next load, not after a cache expiry.
	event.setHeaders({ 'cache-control': 'no-store' });
	return { recipe, signedIn: signedIn !== null };
};

export const actions: Actions = {
	import: async (event) => {
		const signedIn = getUser(event);
		if (!signedIn) {
			// Log in (or register, through onboarding), then back to this page.
			rememberReturnTo(event, event.url.pathname);
			redirect(303, '/login');
		}

		const { token } = event.params;
		const id = isShareToken(token)
			? await importSharedRecipe(token, {
					familyId: signedIn.familyId,
					authorId: signedIn.user.id
				})
			: null;
		if (id === null) error(404, 'Shared recipe not found');

		setFlash(event, 'recipe_imported');
		redirect(303, `/recipes/${id}`);
	}
};
