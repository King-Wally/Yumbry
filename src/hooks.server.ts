import { building } from '$app/env';
import { auth } from '#lib/server/auth.ts';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import {
	type Handle,
	type HandleServerError,
	type ServerInit,
	sequence
} from '@sveltejs/kit/hooks';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { CLIENT_ADDRESS_HEADER } from '#lib/server/client-address.ts';
import { handleSecurityHeaders } from '#lib/server/security-headers.ts';
import { sweepOrphanedFamilies } from '#lib/server/services/family.ts';

export const init: ServerInit = () => {
	if (building) return;
	// Not awaited: an unreachable database must not hold up the first request.
	sweepOrphanedFamilies()
		.then((count) => {
			if (count > 0) console.log(`Swept ${count} orphaned families`);
		})
		.catch((err) => console.error('Failed to sweep orphaned families', err));
};

// Always overwritten, so a client can't choose the address better-auth rate-limits on.
const handleClientAddress: Handle = ({ event, resolve }) => {
	event.request.headers.set(CLIENT_ADDRESS_HEADER, event.getClientAddress());
	return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(
	handleSecurityHeaders,
	handleClientAddress,
	handleParaglide,
	handleBetterAuth
);

// Runs for every error except redirects. error() bodies, 404s and validation errors keep Kit's
// defaults; an unexpected error is logged, and the user learns nothing about the internals.
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;
	console.error(`${event.request.method} ${event.url.pathname} failed:`, error);
	return { message: 'Internal server error' };
};
