import { OPENROUTER_API_KEY } from '$app/env/private';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { LayoutServerLoad } from './$types';

// What the app shell needs on every page: who is signed in, which Add recipe entries to offer, and
// the language this response was rendered in (a change re-renders the shell, see +layout.svelte).
export const load: LayoutServerLoad = ({ locals }) => ({
	locale: getLocale(),
	user: locals.user ? { jsonImportExportEnabled: locals.user.jsonImportExportEnabled } : null,
	aiConfigured: Boolean(OPENROUTER_API_KEY)
});
