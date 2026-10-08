import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { auth } from '#lib/server/auth.ts';
import { authRefusal } from '#lib/server/auth-forms.ts';
import { limitClient, passwordResetRequestLimiter } from '#lib/server/rate-limit.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = String(data.get('email') ?? '').trim();

		const limit = limitClient(event, passwordResetRequestLimiter);
		if (limit.limited) return fail(429, { email, message: limit.message });

		try {
			// Succeeds for unknown emails too, without sending anything, so the confirmation can't be
			// used to find out who has an account. auth.ts sends the email itself.
			await auth.api.requestPasswordReset({ body: { email }, headers: event.request.headers });
		} catch (err) {
			const { status, message } = authRefusal(err, m.common_something_went_wrong());
			return fail(status, { email, message });
		}
		return { sent: true };
	}
};
