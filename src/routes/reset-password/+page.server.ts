import { fail, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { auth } from '#lib/server/auth/better-auth.ts';
import { authRefusal } from '#lib/server/auth/forms.ts';
import { formString } from '#lib/server/http/form.ts';
import { limitClient, passwordResetLimiter } from '#lib/server/http/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

// The reset email links here as /reset-password?token=…; links in inboxes depend on that URL.
export const load: PageServerLoad = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const token = formString(data, 'token');
		const newPassword = formString(data, 'newPassword');

		const limit = limitClient(event, passwordResetLimiter);
		if (limit.limited) return fail(429, { message: limit.message });
		if (!token) return fail(400, { message: m.auth_reset_password_invalid_link_body() });

		try {
			await auth.api.resetPassword({
				body: { token, newPassword },
				headers: event.request.headers
			});
		} catch (err) {
			// better-auth's own text: "Invalid token" for a made-up or expired one, "Password too short".
			const { status, message } = authRefusal(err, m.auth_reset_password_error());
			return fail(status, { message });
		}
		// revokeSessionsOnPasswordReset has dropped every session, this browser's included, so the
		// user signs in again with the new password.
		redirect(303, '/login');
	}
};
