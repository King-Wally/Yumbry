import { redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { auth } from '#lib/server/auth.ts';
import { authFailure, readCredentials } from '#lib/server/auth-forms.ts';
import { getUser } from '#lib/server/guards.ts';
import { signUpLimiter } from '#lib/server/rate-limit.ts';
import { rememberRequestedReturnTo, takeReturnTo } from '#lib/server/return-to.ts';
import type { Actions, PageServerLoad } from './$types';

// A link may ask to come back to its page afterwards (the share page's "Log in"). Already signed
// in: go where they were headed instead.
export const load: PageServerLoad = (event) => {
	rememberRequestedReturnTo(event);
	if (getUser(event)) redirect(303, takeReturnTo(event));
};

export const actions: Actions = {
	default: async (event) => {
		const credentials = await readCredentials(event, signUpLimiter);
		if (!('password' in credentials)) return credentials;

		try {
			// better-auth requires a name; the app has none, so the email stands in for it.
			// autoSignIn (auth.ts) starts the session, and sveltekitCookies sets its cookie here.
			await auth.api.signUpEmail({
				body: { ...credentials, name: credentials.email },
				headers: event.request.headers
			});
		} catch (err) {
			return authFailure(err, credentials.email, m.auth_register_error());
		}
		// Every signup goes through onboarding. A remembered return-to page (an invite link
		// followed while signed out) is left for onboarding to send them on to.
		redirect(303, '/onboarding');
	}
};
