import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ DISABLE_RATE_LIMITS: false }));

const { createRateLimiter, limitClient } = await import('#lib/server/http/rate-limit.ts');

function limiter(opts: { limit?: number; disabled?: boolean } = {}) {
	let time = 1_000_000;
	const rl = createRateLimiter({
		windowMs: 60_000,
		limit: opts.limit ?? 3,
		message: 'Slow down.',
		now: () => time,
		disabled: () => opts.disabled ?? false
	});
	return { rl, advance: (ms: number) => (time += ms) };
}

describe('createRateLimiter', () => {
	it('allows up to the limit, then refuses with the message', () => {
		const { rl } = limiter();
		for (let i = 0; i < 3; i++) expect(rl.hit('a')).toEqual({ limited: false });
		expect(rl.hit('a')).toEqual({ limited: true, retryAfterSeconds: 60, message: 'Slow down.' });
	});

	it('reports the time left in the window', () => {
		const { rl, advance } = limiter({ limit: 1 });
		rl.hit('a');
		advance(45_500);
		expect(rl.hit('a')).toMatchObject({ limited: true, retryAfterSeconds: 15 });
	});

	it('starts a fresh window once the old one ends', () => {
		const { rl, advance } = limiter({ limit: 1 });
		rl.hit('a');
		expect(rl.hit('a').limited).toBe(true);
		advance(60_000);
		expect(rl.hit('a').limited).toBe(false);
		expect(rl.hit('a').limited).toBe(true);
	});

	it('counts each key separately', () => {
		const { rl } = limiter({ limit: 1 });
		rl.hit('a');
		expect(rl.hit('a').limited).toBe(true);
		expect(rl.hit('b').limited).toBe(false);
	});

	it('never limits when disabled', () => {
		const { rl } = limiter({ limit: 1, disabled: true });
		for (let i = 0; i < 10; i++) expect(rl.hit('a').limited).toBe(false);
		expect(rl.size).toBe(0);
	});

	it('drops expired windows once many keys are tracked', () => {
		const { rl, advance } = limiter();
		for (let i = 0; i < 1000; i++) rl.hit(`ip-${i}`);
		expect(rl.size).toBe(1000);
		advance(60_000);
		rl.hit('fresh');
		expect(rl.size).toBe(1);
	});
});

describe('limitClient', () => {
	it('keys on the client address', () => {
		const { rl } = limiter({ limit: 1 });
		const event = (ip: string) => ({ getClientAddress: () => ip }) as never;
		limitClient(event('1.2.3.4'), rl);
		expect(limitClient(event('1.2.3.4'), rl).limited).toBe(true);
		expect(limitClient(event('5.6.7.8'), rl).limited).toBe(false);
	});
});
