import { and, eq, gte, sum, type SQL } from 'drizzle-orm';
import {
	AI_MONTHLY_BUDGET_USD,
	AI_USER_DAILY_BUDGET_USD,
	GEMINI_DAILY_REQUEST_LIMIT
} from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { aiUsage } from '#lib/server/db/schema.ts';
import type { AiBudgetStatus, AiQuotaScope } from '#lib/shared/ai/budget.ts';
import { AiQuotaExceededError } from '#lib/server/ai/errors.ts';

// Every OpenRouter call is paid for out of one server-wide key, so its spend is capped here. The
// monthly budget accrues one day's share at a time and whatever a day leaves unspent rolls over,
// which is a single formula over the month's ledger rather than any stored carry-over:
//
//   available = monthlyBudget × dayOfMonth / daysInMonth − spentThisMonth
//
// It resets on the 1st (UTC), so a quiet month never banks budget for the next. On top of that, a
// per-user daily cap stops one account from draining the day's pool for everyone else.
//
// The cost of a call is only known once it returns, so a request is let through while anything is
// left and spend can overshoot by the calls already in flight — a fraction of a cent each. The
// OpenRouter key's own credit limit is the hard backstop for that.

const DEFAULT_MONTHLY_BUDGET_USD = 1;
// Days of accrual one user may spend in a single day when AI_USER_DAILY_BUDGET_USD is unset.
const DEFAULT_USER_DAILY_CAP_DAYS = 3;
// Leaves headroom under the free tier's 500 requests/day for anything this ledger misses.
const DEFAULT_GEMINI_DAILY_REQUEST_LIMIT = 450;
// Google resets the free tier's daily quota at midnight Pacific time.
const GEMINI_QUOTA_TIME_ZONE = 'America/Los_Angeles';

export type AiBackendName = 'openrouter' | 'gemini';

function daysInUtcMonth(now: Date): number {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
}

function startOfUtcMonth(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfUtcDay(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcMidnight(now: Date, dayOfMonth: number): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth));
}

interface OpenRouterBudgetInput {
	now: Date;
	monthlyBudgetUsd: number;
	spentThisMonthUsd: number;
	userSpentTodayUsd: number;
	/** `null` switches the per-user cap off. */
	userDailyCapUsd: number | null;
}

/** The whole budget rule, kept free of I/O so it can be tested against any date. */
export function computeOpenRouterBudget(input: OpenRouterBudgetInput): AiBudgetStatus {
	const { now, monthlyBudgetUsd, spentThisMonthUsd, userSpentTodayUsd, userDailyCapUsd } = input;
	const days = daysInUtcMonth(now);
	const today = now.getUTCDate();
	const dailyAllowanceUsd = monthlyBudgetUsd / days;
	const availableUsd = dailyAllowanceUsd * today - spentThisMonthUsd;

	const sharedBlocked = availableUsd <= 0;
	const userBlocked = userDailyCapUsd !== null && userSpentTodayUsd >= userDailyCapUsd;

	// The first midnight whose accrual covers what the month has already spent — which may be
	// several days out after an overshoot, or the 1st of next month when the month is used up.
	let sharedRetryAt: Date | null = null;
	if (sharedBlocked) {
		let day = today + 1;
		while (day <= days && dailyAllowanceUsd * day <= spentThisMonthUsd) day++;
		sharedRetryAt = utcMidnight(now, day);
	}
	const userRetryAt = userBlocked ? utcMidnight(now, today + 1) : null;

	const blockedBy: AiQuotaScope | null = sharedBlocked ? 'shared' : userBlocked ? 'user' : null;
	const retryAt = [sharedRetryAt, userRetryAt]
		.filter((d): d is Date => d !== null)
		.sort((a, b) => b.getTime() - a.getTime())[0];

	return {
		monthlyBudgetUsd,
		dailyAllowanceUsd,
		availableUsd,
		userDailyCapUsd,
		userSpentTodayUsd,
		allowed: blockedBy === null,
		blockedBy,
		retryAt: retryAt ? retryAt.toISOString() : null
	};
}

// Read at call time. env.ts has already refused anything that isn't a non-negative number.
function budgetConfig(now: Date): { monthlyBudgetUsd: number; userDailyCapUsd: number | null } {
	const monthlyBudgetUsd = AI_MONTHLY_BUDGET_USD ?? DEFAULT_MONTHLY_BUDGET_USD;
	const cap =
		AI_USER_DAILY_BUDGET_USD ??
		(monthlyBudgetUsd / daysInUtcMonth(now)) * DEFAULT_USER_DAILY_CAP_DAYS;
	return { monthlyBudgetUsd, userDailyCapUsd: cap === 0 ? null : cap };
}

// `sum` over a numeric column comes back as a string, or null over no rows.
async function sumOf(
	column: typeof aiUsage.costUsd | typeof aiUsage.requestCount,
	...where: (SQL | undefined)[]
): Promise<number> {
	const [row] = await db
		.select({ total: sum(column) })
		.from(aiUsage)
		.where(and(...where));
	return Number(row?.total ?? 0);
}

export async function getOpenRouterBudget(
	userId: string,
	now: Date = new Date()
): Promise<AiBudgetStatus> {
	const openRouter = eq(aiUsage.backend, 'openrouter');
	const [spentThisMonthUsd, userSpentTodayUsd] = await Promise.all([
		sumOf(aiUsage.costUsd, openRouter, gte(aiUsage.createdAt, startOfUtcMonth(now))),
		sumOf(
			aiUsage.costUsd,
			openRouter,
			gte(aiUsage.createdAt, startOfUtcDay(now)),
			eq(aiUsage.userId, userId)
		)
	]);
	return computeOpenRouterBudget({
		now,
		...budgetConfig(now),
		spentThisMonthUsd,
		userSpentTodayUsd
	});
}

// Offset of `timeZone` from UTC at `at`, in ms, from the wall-clock time Intl reports there.
function timeZoneOffsetMs(at: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(at);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const wallAsUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second')
	);
	return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight of the current day in `timeZone`, plus the midnight after it, as UTC instants. */
export function zonedDayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
	const local = new Date(now.getTime() + timeZoneOffsetMs(now, timeZone));
	const midnightAt = (dayOffset: number) => {
		const wall = Date.UTC(
			local.getUTCFullYear(),
			local.getUTCMonth(),
			local.getUTCDate() + dayOffset
		);
		// Re-read the offset at the candidate instant itself, so a DST change between midnight and
		// now doesn't shift the boundary by an hour.
		const guess = new Date(wall - timeZoneOffsetMs(now, timeZone));
		return new Date(wall - timeZoneOffsetMs(guess, timeZone));
	};
	return { start: midnightAt(0), end: midnightAt(1) };
}

export interface GeminiQuotaStatus {
	used: number;
	limit: number;
	allowed: boolean;
	retryAt: string | null;
}

export async function getGeminiQuota(now: Date = new Date()): Promise<GeminiQuotaStatus> {
	const limit = GEMINI_DAILY_REQUEST_LIMIT ?? DEFAULT_GEMINI_DAILY_REQUEST_LIMIT;
	const { start, end } = zonedDayBounds(now, GEMINI_QUOTA_TIME_ZONE);
	const used = await sumOf(
		aiUsage.requestCount,
		eq(aiUsage.backend, 'gemini'),
		gte(aiUsage.createdAt, start)
	);
	const allowed = used < limit;
	return { used, limit, allowed, retryAt: allowed ? null : end.toISOString() };
}

// The guards. An AI action calls one first, before it reads the request body, so a refused photo
// import is never uploaded. They run against the real ledger even where a test fakes the provider.

/** Refuses OpenRouter-backed calls (chat, photo import) once the shared monthly pool or the
 * user's own daily cap is used up. */
export async function assertOpenRouterBudget(userId: string): Promise<void> {
	const budget = await getOpenRouterBudget(userId);
	if (!budget.allowed) throw new AiQuotaExceededError(budget.blockedBy!, budget.retryAt);
}

/** Refuses Gemini-backed calls (nutrition) once the free tier's daily request quota is used up. */
export async function assertGeminiQuota(): Promise<void> {
	const quota = await getGeminiQuota();
	if (!quota.allowed) throw new AiQuotaExceededError('shared', quota.retryAt);
}

export interface AiUsageRecord {
	userId: string;
	backend: AiBackendName;
	tier: string;
	model: string;
	promptTokens?: number;
	completionTokens?: number;
	costUsd: number;
	requestCount: number;
}

/** Writes one ledger row. Never throws: a failed insert must not fail a request whose answer the
 * user has already paid for, so the error is only logged. */
export async function recordAiUsage(record: AiUsageRecord): Promise<void> {
	try {
		await db.insert(aiUsage).values({ ...record, costUsd: String(record.costUsd) });
	} catch (err) {
		console.error('[ai-budget] failed to record AI usage:', err);
	}
}
