import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideOptions } from './paraglide.config.ts';

// Specs load modules that import `$app/env/private`, whose required variables are validated on
// import. Placeholders keep them hermetic (CI has no .env); nothing connects to them, as the db
// specs swap the client for TEST_DATABASE_URL's. Kit reads the config process's environment, so
// vitest's `test.env` is too late.
if (process.env.VITEST) {
	process.env.DATABASE_URL ||= 'postgres://placeholder:placeholder@localhost:5432/placeholder';
	process.env.ORIGIN ||= 'http://localhost:5173';
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// A PWA can stay open for days without a full load. Polling lets the next navigation after
			// a deploy load the new build (and update the service worker) instead of the old chunks.
			version: { pollInterval: 60 * 60 * 1000 },
			// helmet's default policy. The other security headers are set in hooks.server.ts. Kit
			// adds nonces/hashes for its own inline scripts ('auto').
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'base-uri': ['self'],
					'font-src': ['self', 'https:', 'data:'],
					'form-action': ['self'],
					'frame-ancestors': ['self'],
					// Wider than helmet's 'self' data:. Recipes imported via JSON-LD or URL keep the
					// original remote image URL (no re-hosting), and photo import previews the chosen
					// file as a blob: URL before upload.
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'object-src': ['none'],
					'script-src': ['self'],
					'script-src-attr': ['none'],
					'style-src': ['self', 'https:', 'unsafe-inline'],
					'upgrade-insecure-requests': true
				}
			}
		}),

		paraglideVitePlugin(paraglideOptions)
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.db.spec.ts']
				}
			},

			{
				// Service tests against a real Postgres (TEST_DATABASE_URL, skipped when unset). The files
				// share and reset one database, so they must not run in parallel.
				extends: './vite.config.ts',
				test: {
					name: 'server-db',
					environment: 'node',
					include: ['src/**/*.db.spec.ts'],
					fileParallelism: false
				}
			}
		]
	}
});
