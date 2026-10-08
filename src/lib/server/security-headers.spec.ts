import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { handleSecurityHeaders, SECURITY_HEADERS } from '#lib/server/security-headers.ts';

async function respond(headers: Record<string, string> = {}) {
	return handleSecurityHeaders({
		event: {} as RequestEvent,
		resolve: async () => new Response('ok', { headers })
	});
}

describe('handleSecurityHeaders', () => {
	it("adds helmet's default headers", async () => {
		const response = await respond();
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			expect(response.headers.get(name)).toBe(value);
		}
		expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
	});

	it('keeps a header the route already set', async () => {
		const response = await respond({ 'Cross-Origin-Resource-Policy': 'cross-origin' });
		expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
	});
});
