import type { RequestHandler } from './$types';

// Installs of main's app (v1.x) run a Workbox service worker registered at /sw.js. It serves the
// cached React shell for every navigation, so the new app would never load, and it checks /sw.js for
// an update on each navigation. This is that update. Once installed, it deletes every cache,
// unregisters itself and reloads its pages, which then come from the server. The new app then
// registers /service-worker.js (src/service-worker/index.ts).
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
