import { redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { auth } from '#lib/server/auth.ts';
import { authFailure, readCredentials } from '#lib/server/auth-forms.ts';
import { getUser } from '#lib/server/guards.ts';
import { signInLimiter } from '#lib/server/rate-limit.ts';
import { takeReturnTo } from '#lib/server/return-to.ts';
import type { Actions, PageServerLoad } from './$types';

// Already signed in: go where they were headed instead.
export const load: PageServerLoad = (event) => {
	if (getUser(event)) redirect(303, takeReturnTo(event));
};

export const actions: Actions = {
	default: async (event) => {
		const credentials = await readCredentials(event, signInLimiter);
		if (!('password' in credentials)) return credentials;

		try {
			// The sveltekitCookies plugin (auth.ts) writes the session cookie onto this response.
			await auth.api.signInEmail({ body: credentials, headers: event.request.headers });
		} catch (err) {
			return authFailure(err, credentials.email, m.auth_login_error());
		}
		redirect(303, takeReturnTo(event));
	}
};
