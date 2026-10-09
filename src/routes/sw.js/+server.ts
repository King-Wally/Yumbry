import type { RequestHandler } from './$types';

// Transitional: takes over installs of v1.x, whose service worker is registered at /sw.js, serves
// a cached page shell for every navigation and checks this URL for an update. This is that update:
// it deletes every cache, unregisters itself and reloads its windows, which then load this app.
// Remove once requests for /sw.js have stopped showing up in the logs.
//
// no-cache: the browser's update check skips the HTTP cache, but Cloudflare's edge would otherwise
// keep a copy of a .js file.
const RETIRE_LEGACY_WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		for (const key of await caches.keys()) await caches.delete(key);
		await self.registration.unregister();
		const windows = await self.clients.matchAll({ type: 'window' });
		for (const client of windows) client.navigate(client.url).catch(() => {});
	})());
});
`;

export const GET: RequestHandler = () =>
	new Response(RETIRE_LEGACY_WORKER, {
		headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }
	});
