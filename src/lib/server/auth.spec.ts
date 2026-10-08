import { getCookies } from 'better-auth/cookies';
import { describe, expect, it, vi } from 'vitest';

// Pins the session cookie to the name and attributes the Express app used. Renaming it would sign
// every existing user out at the cutover.

vi.mock('$app/env/private', () => ({
	ORIGIN: 'http://app.test',
	BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
	COOKIE_SECURE: false,
	DISABLE_RATE_LIMITS: true
}));
vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({ db: {} }));
vi.mock('#lib/server/services/family.ts', () => ({ createFamily: vi.fn() }));

const { auth } = await import('#lib/server/auth.ts');

describe('session cookie', () => {
	it('keeps main’s name and attributes', () => {
		const { sessionToken } = getCookies(auth.options);
		expect(sessionToken.name).toBe('yumbry.session_token');
		expect(sessionToken.attributes).toMatchObject({
			httpOnly: true,
			sameSite: 'lax',
			path: '/',
			secure: false
		});
	});

	it('gets the __Secure- prefix when COOKIE_SECURE is on', () => {
		const { sessionToken } = getCookies({
			...auth.options,
			advanced: { ...auth.options.advanced, useSecureCookies: true }
		});
		expect(sessionToken.name).toBe('__Secure-yumbry.session_token');
		expect(sessionToken.attributes.secure).toBe(true);
	});
});
