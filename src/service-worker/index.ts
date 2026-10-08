// The app's service worker. It speeds up loads and keeps recipe photos at hand. It never caches
// pages: they are rendered per user, so navigations, `__data.json`, form posts and /api always go
// to the network, and a PWA opened without a connection shows the browser's offline page. A
// request this worker doesn't answer goes out exactly as it would without one.
//
// Installs of main's app had a Workbox worker at /sw.js. src/routes/sw.js/+server.ts retires it.
import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';

const APP_CACHE = `cache-${version}`;
// Not versioned, so photos survive a deploy.
const UPLOADS_CACHE = 'uploads';
// As main's Workbox `maxEntries`.
const MAX_UPLOADS = 300;

// Both lists are relative to the base path, which is the worker's scope.
const toPathname = (path: string) => new URL(path, self.registration.scope).pathname;

// The manifest stays network-only, so a change to it reaches installs without a new worker.
const ASSETS = [...immutable, ...assets]
	.map((file) => toPathname(file.path))
	.filter((path) => path !== '/manifest.webmanifest');
const ASSET_SET = new Set(ASSETS);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(APP_CACHE);
			await cache.addAll(ASSETS);
			// It serves only hashed assets and photos, never a page, so taking over at once is safe.
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Also clears what an older worker left behind, Workbox's caches included.
			for (const key of await caches.keys()) {
				if (key !== APP_CACHE && key !== UPLOADS_CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

async function fromAppCache(request: Request): Promise<Response> {
	const cached = await caches.match(request, { cacheName: APP_CACHE });
	return cached ?? fetch(request);
}

async function trimUploads(cache: Cache): Promise<void> {
	// keys() lists entries in insertion order, so the oldest go first.
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - MAX_UPLOADS))) {
		await cache.delete(key);
	}
}

/** Stale-while-revalidate. Only a plain 200 is kept: a 401, 403 or 404 must not be replayed. */
async function fromUploads(event: FetchEvent): Promise<Response> {
	const cache = await caches.open(UPLOADS_CACHE);
	const cached = await cache.match(event.request);
	const network = fetch(event.request).then(async (response) => {
		if (response.status === 200 && response.type === 'basic') {
			await cache.put(event.request, response.clone());
			await trimUploads(cache);
		}
		return response;
	});
	if (!cached) return network;
	event.waitUntil(network.catch(() => {}));
	return cached;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || request.mode === 'navigate') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (ASSET_SET.has(url.pathname)) {
		event.respondWith(fromAppCache(request));
	} else if (url.pathname.startsWith('/uploads/')) {
		event.respondWith(fromUploads(event));
	}
});
