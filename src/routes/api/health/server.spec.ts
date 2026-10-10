import { describe, expect, it } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

describe('GET /api/health', () => {
	it('answers 200 {"status":"ok"}', async () => {
		const response = await GET({} as RequestEvent);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});
});
