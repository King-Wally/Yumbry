// Whether the server answers, for the outage cover (<ServerUnavailable /> in the root layout).
// Browser only. SSR still renders a page when the API is gone (the PWA case, or the spec's aborted
// /api/**), so the client asks /api/health itself: once on start, and whenever a same-origin fetch
// fails like an outage. Every suspicion is confirmed by a health ping before anything is shown, so a
// single slow 524 on an AI call never covers the app.
import { isServerUnavailableResponse } from '#lib/shared/server-availability.ts';

/** `checking` is the short window where a health ping is confirming a suspected outage. */
export type ServerStatus = 'up' | 'checking' | 'down';

const PING_TIMEOUT_MS = 5000;

let status: ServerStatus = $state('up');

export const serverStatus = {
	get current(): ServerStatus {
		return status;
	}
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// The fetch from before observeFetch() wrapped it, so the ping never reports on itself.
let rawFetch: Fetch = (input, init) => fetch(input, init);

/** Asks the health endpoint whether the server answers. Never throws. */
export async function pingServer(): Promise<boolean> {
	try {
		const res = await rawFetch('/api/health', {
			cache: 'no-store',
			signal: AbortSignal.timeout(PING_TIMEOUT_MS)
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Something failed like an outage (or the app just started): confirm with a health ping. */
export function checkServer(): Promise<void> {
	if (status !== 'up') return Promise.resolve();
	status = 'checking';
	return pingServer().then((ok) => {
		if (status === 'checking') status = ok ? 'up' : 'down';
	});
}

/** The server answered again (the cover's "Try again"). */
export function markServerUp(): void {
	status = 'up';
}

function isSameOrigin(input: RequestInfo | URL): boolean {
	const url = input instanceof Request ? input.url : String(input);
	return new URL(url, location.href).origin === location.origin;
}

let observing = false;

/** Watches every same-origin fetch, which covers Kit's `__data.json` loads (navigation,
 * invalidateAll) and form actions, however an enhance callback handles the result. Kit calls
 * `window.fetch` at request time precisely so it can be wrapped like this. Responses pass through
 * untouched. Our own error replies are JSON, a gateway's or the offline Worker's are not. */
export function observeFetch(target: Window = window): void {
	if (observing) return;
	observing = true;
	const original: Fetch = target.fetch.bind(target);
	rawFetch = original;
	const observed: Fetch = async (input, init) => {
		const watched = isSameOrigin(input);
		try {
			const res = await original(input, init);
			const isJson = res.headers.get('content-type')?.includes('application/json') ?? false;
			if (watched && isServerUnavailableResponse(res.status, isJson)) void checkServer();
			return res;
		} catch (err) {
			if (watched && !(err instanceof DOMException && err.name === 'AbortError')) {
				void checkServer();
			}
			throw err;
		}
	};
	// Keeps any extra members the runtime's fetch has (Bun's types add `preconnect`).
	target.fetch = Object.assign(observed, target.fetch);
}

/** Test helper: back to the initial state. */
export function resetServerStatus(): void {
	status = 'up';
}
