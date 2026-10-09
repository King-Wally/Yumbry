import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { aiUsage } from '#lib/server/db/schema.ts';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
	insertUser,
	resetTestDatabase,
	testDb
} from '#lib/server/db/testing.ts';
import { AiQuotaExceededError } from '#lib/server/ai/errors.ts';

const env = vi.hoisted(() => ({
	AI_MONTHLY_BUDGET_USD: 100 as number | undefined,
	AI_USER_DAILY_BUDGET_USD: 1 as number | undefined,
	GEMINI_DAILY_REQUEST_LIMIT: 3 as number | undefined
}));

vi.mock('$app/env/private', () => env);

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/db/testing.ts');
	return {
		get db() {
			return testDb();
		}
	};
});

const {
	assertGeminiQuota,
	assertOpenRouterBudget,
	getGeminiQuota,
	getOpenRouterBudget,
	recordAiUsage
} = await import('#lib/server/ai/budget.ts');

// September 2026 has 30 days.
const NOW = new Date('2026-09-10T12:00:00Z');

async function spend(row: {
	userId: string | null;
	backend?: 'openrouter' | 'gemini';
	costUsd?: number;
	requestCount?: number;
	createdAt?: Date;
}): Promise<void> {
	await testDb()
		.insert(aiUsage)
		.values({
			userId: row.userId,
			backend: row.backend ?? 'openrouter',
			tier: 'medium',
			model: 'test/model',
			costUsd: String(row.costUsd ?? 0),
			requestCount: row.requestCount ?? 1,
			...(row.createdAt && { createdAt: row.createdAt })
		});
}

describeDb('AI budget ledger', () => {
	let userId: string;
	let otherUserId: string;

	beforeEach(async () => {
		await resetTestDatabase();
		const familyId = await insertFamily();
		userId = await insertUser(familyId);
		otherUserId = await insertUser(familyId);
	});
	afterAll(closeTestDatabase);

	it('sums this month’s OpenRouter spend, and the user’s own spend today', async () => {
		await spend({ userId, costUsd: 0.25, createdAt: NOW });
		await spend({ userId, costUsd: 0.125, createdAt: new Date('2026-09-10T00:00:00Z') });
		// Earlier this month: the pool, but not today's cap.
		await spend({ userId, costUsd: 2, createdAt: new Date('2026-09-09T23:59:59Z') });
		await spend({ userId: otherUserId, costUsd: 0.5, createdAt: NOW });
		// A deleted account's spend still counts for the pool.
		await spend({ userId: null, costUsd: 1, createdAt: NOW });
		// Not counted: last month, and Gemini.
		await spend({ userId, costUsd: 50, createdAt: new Date('2026-08-31T23:59:59Z') });
		await spend({ userId, backend: 'gemini', costUsd: 9, createdAt: NOW });

		const budget = await getOpenRouterBudget(userId, NOW);

		expect(budget.userSpentTodayUsd).toBeCloseTo(0.375);
		expect(budget.availableUsd).toBeCloseTo((100 / 30) * 10 - (0.375 + 2 + 0.5 + 1));
		expect(budget).toMatchObject({ userDailyCapUsd: 1, allowed: true, blockedBy: null });
	});

	it('turns the per-user cap off at 0, and defaults it to three days of accrual when unset', async () => {
		env.AI_USER_DAILY_BUDGET_USD = 0;
		expect((await getOpenRouterBudget(userId, NOW)).userDailyCapUsd).toBeNull();

		env.AI_USER_DAILY_BUDGET_USD = undefined;
		expect((await getOpenRouterBudget(userId, NOW)).userDailyCapUsd).toBeCloseTo((100 / 30) * 3);

		env.AI_USER_DAILY_BUDGET_USD = 1;
	});

	it('counts Gemini requests since midnight Pacific time', async () => {
		// 2026-09-10T12:00Z is 05:00 in Los Angeles, whose day began at 07:00Z.
		await spend({ userId, backend: 'gemini', requestCount: 2, createdAt: NOW });
		await spend({
			userId,
			backend: 'gemini',
			createdAt: new Date('2026-09-10T07:00:00Z')
		});
		await spend({ userId, backend: 'gemini', createdAt: new Date('2026-09-10T06:59:59Z') });
		await spend({ userId, requestCount: 5, createdAt: NOW });

		expect(await getGeminiQuota(NOW)).toEqual({
			used: 3,
			limit: 3,
			allowed: false,
			retryAt: '2026-09-11T07:00:00.000Z'
		});
	});

	it('refuses a user who spent today’s cap, with scope and retry time', async () => {
		await assertOpenRouterBudget(userId);
		await spend({ userId, costUsd: 1 });

		const refusal = await assertOpenRouterBudget(userId).catch((err: unknown) => err);
		expect(refusal).toBeInstanceOf(AiQuotaExceededError);
		expect(refusal).toMatchObject({ kind: 'quota_exceeded', scope: 'user' });
		expect((refusal as AiQuotaExceededError).retryAt).toMatch(/T00:00:00\.000Z$/);

		// Another user is not affected.
		await assertOpenRouterBudget(otherUserId);
	});

	it('refuses everyone once the shared pool is spent', async () => {
		await spend({ userId: null, costUsd: 100 });

		await expect(assertOpenRouterBudget(otherUserId)).rejects.toMatchObject({
			kind: 'quota_exceeded',
			scope: 'shared'
		});
	});

	it('refuses Gemini calls once the day’s requests are used', async () => {
		await spend({ userId, backend: 'gemini', requestCount: 2 });
		await assertGeminiQuota();
		await spend({ userId: otherUserId, backend: 'gemini' });

		await expect(assertGeminiQuota()).rejects.toMatchObject({
			kind: 'quota_exceeded',
			scope: 'shared',
			retryAt: expect.any(String)
		});
	});

	it('records a usage row, keeping a sub-cent cost exact', async () => {
		await recordAiUsage({
			userId,
			backend: 'openrouter',
			tier: 'big',
			model: 'vendor/model',
			promptTokens: 120,
			completionTokens: 40,
			costUsd: 0.00042,
			requestCount: 1
		});

		const [row] = await testDb().select().from(aiUsage);
		expect(row).toMatchObject({
			userId,
			backend: 'openrouter',
			tier: 'big',
			model: 'vendor/model',
			promptTokens: 120,
			completionTokens: 40,
			costUsd: '0.00042000',
			requestCount: 1
		});
	});

	it('logs rather than throws when the row cannot be written', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		await recordAiUsage({
			userId: 'no-such-user',
			backend: 'gemini',
			tier: 'small',
			model: 'gemini',
			costUsd: 0,
			requestCount: 1
		});

		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining('failed to record AI usage'),
			expect.anything()
		);
		logged.mockRestore();
	});
});
