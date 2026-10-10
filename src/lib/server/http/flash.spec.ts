import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { FLASH_COOKIE, setFlash, takeFlash } from '#lib/server/http/flash.ts';

function event(jar: Record<string, string> = {}) {
	const cookies = {
		get: (name: string) => jar[name],
		set: (name: string, value: string) => {
			jar[name] = value;
		},
		delete: (name: string) => {
			delete jar[name];
		}
	};
	return { event: { cookies } as unknown as RequestEvent, jar };
}

describe('flash', () => {
	it('hands out a notice once', () => {
		const { event: e } = event();
		setFlash(e, 'family_joined');
		expect(takeFlash(e)).toBe('family_joined');
		expect(takeFlash(e)).toBeNull();
	});

	it('drops an unknown key', () => {
		const { event: e, jar } = event({ [FLASH_COOKIE]: 'nonsense' });
		expect(takeFlash(e)).toBeNull();
		expect(jar).toEqual({});
	});
});
