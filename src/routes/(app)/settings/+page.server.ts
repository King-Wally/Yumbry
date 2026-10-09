import { error, fail, redirect } from '@sveltejs/kit';
import { OPENROUTER_API_KEY } from '$app/env/private';
import { m } from '#lib/paraglide/messages.js';
import { auth } from '#lib/server/auth.ts';
import { authRefusal } from '#lib/server/auth-forms.ts';
import { requireUser } from '#lib/server/guards.ts';
import { kindedError } from '#lib/server/kinded-errors.ts';
import { parsePreferences } from '#lib/server/preferences.ts';
import {
	changePasswordLimiter,
	deleteAccountLimiter,
	limitClient
} from '#lib/server/rate-limit.ts';
import { getOpenRouterBudget } from '#lib/server/services/ai-budget.ts';
import { getFamily, inviteUrl, leaveFamily } from '#lib/server/services/family.ts';
import { updatePreferences } from '#lib/server/services/user-preferences.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user, familyId } = requireUser(event);
	const [family, aiBudget] = await Promise.all([
		getFamily(familyId),
		// The AI usage card: only where there is an AI to spend on.
		OPENROUTER_API_KEY ? getOpenRouterBudget(user.id) : null
	]);
	if (!family) error(404, 'Family not found.');
	return {
		userId: user.id,
		preferences: { locale: user.locale, jsonImportExportEnabled: user.jsonImportExportEnabled },
		family: {
			members: family.members,
			inviteUrl: inviteUrl(event.url.origin, family.invite_token)
		},
		aiBudget
	};
};

export const actions: Actions = {
	// Any subset of the four preferences. The page posts the language and the JSON switch; the AI
	// chat page posts its unit system and small-volume selects here too.
	preferences: async (event) => {
		const { user } = requireUser(event);
		const formData = await event.request.formData();
		const parsed = parsePreferences(formData);
		if (!parsed.success) {
			// Which card shows the error: the language picker, or the switch.
			const target = formData.has('locale') ? ('locale' as const) : ('other' as const);
			return fail(400, { preferencesError: m.common_something_went_wrong(), target });
		}

		await updatePreferences(event, user.id, parsed.data);
		if (!parsed.data.locale) return { saved: 'other' as const };

		// This response's language was settled before the action ran. An enhanced submit re-renders in
		// the new one on the client (#lib/locale-client.ts); a plain form POST (no JS yet) has to load
		// the page again to get it, at the cost of the "saved" note.
		if (!event.request.headers.get('accept')?.includes('application/json')) {
			redirect(303, '/settings');
		}
		return { saved: 'locale' as const };
	},

	password: async (event) => {
		requireUser(event);
		const data = await event.request.formData();
		const currentPassword = String(data.get('currentPassword') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const confirmNewPassword = String(data.get('confirmNewPassword') ?? '');

		const limit = limitClient(event, changePasswordLimiter);
		if (limit.limited) return fail(429, { passwordError: limit.message });
		// The page flags this before submitting; this covers a submit without JS.
		if (newPassword !== confirmNewPassword) {
			return fail(400, { passwordError: m.settings_password_mismatch() });
		}

		try {
			// Signing out every other device is what changing the password always did. better-auth
			// issues this device a new session, and the sveltekitCookies plugin sets its cookie.
			await auth.api.changePassword({
				body: { currentPassword, newPassword, revokeOtherSessions: true },
				headers: event.request.headers
			});
		} catch (err) {
			const { status, message } = authRefusal(err, m.common_something_went_wrong());
			return fail(status, { passwordError: message });
		}
		return { passwordSaved: true };
	},

	// Into a new, empty family of one; the shared recipes stay behind. Every page load reads the
	// family afresh (guards.ts), so pages of the old family 404 from the next navigation on.
	leaveFamily: async (event) => {
		const { user } = requireUser(event);
		try {
			await leaveFamily(user.id);
		} catch (err) {
			const known = kindedError(err);
			if (!known) throw err;
			return fail(known.status, { leaveError: known.message });
		}
		return { left: true };
	},

	deleteAccount: async (event) => {
		requireUser(event);
		const data = await event.request.formData();
		const password = String(data.get('password') ?? '');

		const limit = limitClient(event, deleteAccountLimiter);
		if (limit.limited) return fail(429, { deleteError: limit.message });

		try {
			// Deletes the user and their sessions, clears the cookie, then runs the family clean-up
			// (auth.ts).
			await auth.api.deleteUser({ body: { password }, headers: event.request.headers });
		} catch (err) {
			const { status, message } = authRefusal(err, m.common_something_went_wrong());
			return fail(status, { deleteError: message });
		}
		redirect(303, '/login');
	}
};
