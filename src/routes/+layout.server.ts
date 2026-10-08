import { OPENROUTER_API_KEY } from '$app/env/private';
import type { LayoutServerLoad } from './$types';

// What the app shell needs on every page: who is signed in, and which Add recipe entries to offer.
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user ? { jsonImportExportEnabled: locals.user.jsonImportExportEnabled } : null,
	aiConfigured: Boolean(OPENROUTER_API_KEY)
});
