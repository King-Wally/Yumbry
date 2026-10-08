import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import {
	RETURN_TO_COOKIE,
	rememberRequestedReturnTo,
	rememberReturnTo,
	safeReturnPath,
	takeReturnTo
} from '#lib/server/return-to.ts';

const ORIGIN = 'http://app.test';

function event(path: string, method = 'GET', jar: Record<string, string> = {}) {
	const cookies = {
		get: vi.fn((name: string) => jar[name]),
		set: vi.fn((name: string, value: string) => {
			jar[name] = value;
		}),
		delete: vi.fn((name: string) => {
			delete jar[name];
		})
	};
	return {
		event: { url: new URL(path, ORIGIN), request: { method }, cookies } as unknown as RequestEvent,
		cookies,
		jar
	};
}

describe('safeReturnPath', () => {
	it.each(['/', '/recipes/12', '/recipes?tag=soup&q=a%20b', '/join/abc#x'])('keeps %s', (path) => {
		expect(safeReturnPath(path, ORIGIN)).toBe(path);
	});

	it.each([
		undefined,
		'',
		'recipes',
		'https://evil.example/',
		'//evil.example/x',
		'/\\evil.example',
		'javascript:alert(1)'
	])('rejects %s', (raw) => {
		expect(safeReturnPath(raw, ORIGIN)).toBeNull();
	});
});

describe('rememberReturnTo', () => {
	it('stores the path and query of a GET in an httpOnly cookie', () => {
		const { event: e, cookies } = event('/recipes?tag=soup');
		rememberReturnTo(e);
		expect(cookies.set).toHaveBeenCalledWith(
			RETURN_TO_COOKIE,
			'/recipes?tag=soup',
			expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
		);
	});

	it('ignores anything but GET', () => {
		const { event: e, cookies } = event('/settings', 'POST');
		rememberReturnTo(e);
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('stores an explicit path from a form action', () => {
		const { event: e, cookies } = event('/join-family/abc?/join', 'POST');
		rememberReturnTo(e, '/join-family/abc');
		expect(cookies.set).toHaveBeenCalledWith(
			RETURN_TO_COOKIE,
			'/join-family/abc',
			expect.objectContaining({ path: '/', httpOnly: true })
		);
	});
});

describe('rememberRequestedReturnTo', () => {
	it('stores a same-origin ?redirectTo=', () => {
		const { event: e, jar } = event('/login?redirectTo=%2Fshare%2Fabc');
		rememberRequestedReturnTo(e);
		expect(jar).toEqual({ [RETURN_TO_COOKIE]: '/share/abc' });
	});

	it.each(['/login', '/login?redirectTo=', '/login?redirectTo=https%3A%2F%2Fevil.example'])(
		'stores nothing for %s',
		(path) => {
			const { event: e, cookies } = event(path);
			rememberRequestedReturnTo(e);
			expect(cookies.set).not.toHaveBeenCalled();
		}
	);
});

describe('takeReturnTo', () => {
	it('returns the remembered path once', () => {
		const { event: e, jar } = event('/login', 'POST', { [RETURN_TO_COOKIE]: '/recipes/12' });
		expect(takeReturnTo(e)).toBe('/recipes/12');
		expect(jar).toEqual({});
		expect(takeReturnTo(e)).toBe('/');
	});

	it('falls back to / for an off-site value', () => {
		const { event: e } = event('/login', 'POST', { [RETURN_TO_COOKIE]: '//evil.example' });
		expect(takeReturnTo(e)).toBe('/');
	});
});
