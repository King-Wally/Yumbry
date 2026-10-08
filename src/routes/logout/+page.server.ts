import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

// Only the header's Log out form posts here; there is nothing to show.
export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.session) {
			// Deletes the session row; the sveltekitCookies plugin clears the cookies.
			await auth.api.signOut({ headers: event.request.headers });
		}
		redirect(303, '/login');
	}
};
