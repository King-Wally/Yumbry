import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from '#lib/server/http/flash.ts';
import { getUser } from '#lib/server/auth/guards.ts';
import { failKinded } from '#lib/server/http/kinded-errors.ts';
import { familyJoinLimiter, limitClient } from '#lib/server/http/rate-limit.ts';
import { rememberReturnTo } from '#lib/server/auth/return-to.ts';
import { joinFamily } from '#lib/server/family/family.ts';
import type { Actions, PageServerLoad } from './$types';

// Public, so the invite can be read before logging in is asked for. Nothing happens on load:
// joining is a deliberate POST, so link previews and scanners can't use the invite up, and the
// token isn't checked until then either.
export const load: PageServerLoad = (event) => ({ signedIn: getUser(event) !== null });

export const actions: Actions = {
	default: async (event) => {
		const signedIn = getUser(event);
		if (!signedIn) {
			// Log in (or register, through onboarding), then back to this page.
			rememberReturnTo(event, event.url.pathname);
			redirect(303, '/login');
		}

		// An invite token is a bearer secret, and this is the one place one can be guessed at.
		const limit = limitClient(event, familyJoinLimiter);
		if (limit.limited) return fail(429, { message: limit.message });

		try {
			await joinFamily(signedIn.user.id, event.params.token);
		} catch (err) {
			return failKinded(err);
		}
		setFlash(event, 'family_joined');
		redirect(303, '/');
	}
};
