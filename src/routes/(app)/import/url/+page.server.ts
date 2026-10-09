import { fail, redirect } from '@sveltejs/kit';
import * as z from 'zod';
import { stashDraft } from '#lib/server/recipes/draft-handoff.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { failKinded } from '#lib/server/http/kinded-errors.ts';
import { limitClient, urlImportLimiter } from '#lib/server/http/rate-limit.ts';
import { logImportAttempt } from '#lib/server/url-import/import-log.ts';
import { scrapeRecipeFromUrl } from '#lib/server/url-import/scrape.ts';
import { UrlImportError, type ImportMethod } from '#lib/server/url-import/errors.ts';
import { isSupportedLocale } from '#lib/shared/i18n/locale.ts';
import type { Actions, PageServerLoad } from './$types';

const UrlSchema = z
	.string()
	.trim()
	.min(1)
	.pipe(z.url({ protocol: /^https?$/ }));

const INVALID_URL_MESSAGE = 'Provide a valid recipe page URL.';

export const load: PageServerLoad = (event) => {
	requireUser(event);
};

export const actions: Actions = {
	// Fetches the page and hands its recipe to /recipes/new as a draft for review: nothing is saved
	// until the cook confirms it there. Errors are main's English messages, as main showed the
	// server's text. Every attempt is logged for site-level import analytics.
	default: async (event) => {
		const { user } = requireUser(event);
		const raw = (await event.request.formData()).get('url');
		const url = typeof raw === 'string' ? raw : '';

		const limit = limitClient(event, urlImportLimiter);
		if (limit.limited) return fail(429, { message: limit.message });

		const parsed = UrlSchema.safeParse(url);
		if (!parsed.success) {
			await logImportAttempt({
				url: url || '(invalid request body)',
				success: false,
				errorKind: 'validation_error',
				errorMessage: INVALID_URL_MESSAGE
			});
			return fail(400, { message: INVALID_URL_MESSAGE });
		}

		const trace: { method?: ImportMethod } = {};
		const locale = isSupportedLocale(user.locale) ? user.locale : undefined;
		let draft;
		try {
			draft = await scrapeRecipeFromUrl(parsed.data, locale, trace);
		} catch (err) {
			await logImportAttempt({
				url: parsed.data,
				success: false,
				method: trace.method,
				...(err instanceof UrlImportError
					? { errorKind: err.kind, errorMessage: err.message }
					: { errorKind: 'unknown', errorMessage: String(err) })
			});
			return failKinded(err);
		}

		await logImportAttempt({ url: parsed.data, success: true, method: trace.method });
		stashDraft(event.cookies, user.id, draft, 'url', null);
		redirect(303, '/recipes/new');
	}
};
