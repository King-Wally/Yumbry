import { describe, expect, it } from 'vitest';
import { planLegacyLocaleMigration } from '#lib/client/legacy-locale.ts';

describe('planLegacyLocaleMigration', () => {
	it('does nothing without a stored choice', () => {
		expect(planLegacyLocaleMigration({ stored: null, hasCookie: false, current: 'en' })).toEqual({
			remove: false,
			reload: false
		});
	});

	it('drops an unsupported value', () => {
		expect(planLegacyLocaleMigration({ stored: 'de', hasCookie: false, current: 'en' })).toEqual({
			remove: true,
			reload: false
		});
	});

	it('only removes the key once a cookie exists, so it never loops', () => {
		expect(planLegacyLocaleMigration({ stored: 'fr', hasCookie: true, current: 'en' })).toEqual({
			remove: true,
			reload: false
		});
	});

	it('writes the cookie without reloading when the page is already in that language', () => {
		expect(planLegacyLocaleMigration({ stored: 'nl', hasCookie: false, current: 'nl' })).toEqual({
			remove: true,
			cookie: 'nl',
			reload: false
		});
	});

	it('writes the cookie and reloads when the page is in another language', () => {
		expect(planLegacyLocaleMigration({ stored: 'fr', hasCookie: false, current: 'en' })).toEqual({
			remove: true,
			cookie: 'fr',
			reload: true
		});
	});
});
