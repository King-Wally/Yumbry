import { expect, test } from '../../e2e/support/fixtures.ts';

test.describe('legacy service worker retirement', () => {
	test('/sw.js and /registerSW.js are served uncached', async ({ request }) => {
		const worker = await request.get('/sw.js');
		expect(worker.status()).toBe(200);
		expect(worker.headers()['content-type']).toContain('text/javascript');
		expect(worker.headers()['cache-control']).toBe('no-cache');

		const register = await request.get('/registerSW.js');
		expect(register.status()).toBe(200);
		expect(register.headers()['cache-control']).toBe('no-cache');
	});

	test('the worker clears every cache and unregisters itself', async ({ browser, baseURL }) => {
		// The suite blocks service workers everywhere else; this one needs a real one.
		const context = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
		try {
			const page = await context.newPage();
			await page.goto('/login');
			await page.evaluate(async () => {
				await caches.open('workbox-precache-legacy');
				await navigator.serviceWorker.register('/sw.js', { scope: '/legacy/' });
			});

			// The app registers its own worker and cache here too; only the legacy ones must go.
			await expect
				.poll(() => page.evaluate(() => caches.keys()))
				.not.toContain('workbox-precache-legacy');
			// An unregistered worker's registration goes once the page has moved on.
			await page.reload();
			await expect
				.poll(() =>
					page.evaluate(
						async () =>
							(await navigator.serviceWorker.getRegistrations()).filter((r) =>
								r.scope.endsWith('/legacy/')
							).length
					)
				)
				.toBe(0);
		} finally {
			await context.close();
		}
	});
});
