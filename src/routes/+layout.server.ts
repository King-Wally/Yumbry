import { GEMINI_API_KEY, OPENROUTER_API_KEY } from '$app/env/private';
import { getLocale } from '#lib/paraglide/runtime.js';
import { takeFlash } from '#lib/server/flash.ts';
import type { LayoutServerLoad } from './$types';

// What the app shell needs on every page: who is signed in, which Add recipe entries to offer, and
// the language this response was rendered in (a change re-renders the shell, see +layout.svelte),
// and a notice a form action left for the page it redirected to (#lib/server/flash.ts). A redirect
// from an enhanced form re-runs this load (invalidateAll), a plain POST loads the page afresh.
export const load: LayoutServerLoad = (event) => ({
	locale: getLocale(),
	user: event.locals.user
		? { jsonImportExportEnabled: event.locals.user.jsonImportExportEnabled }
		: null,
	// Which AI features this server offers: chat and photo import run on OpenRouter, nutrition
	// estimates on Gemini. The minimal (keyless) server shows neither.
	aiConfigured: Boolean(OPENROUTER_API_KEY),
	nutritionConfigured: Boolean(GEMINI_API_KEY),
	flash: takeFlash(event)
});
