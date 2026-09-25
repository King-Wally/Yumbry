import type { AiBudgetStatus, AiQuotaScope } from 'yumbry-shared';
import { prisma } from '../db/prisma.js';

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

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.warn(`[ai-budget] ${name}=${raw} is not a non-negative number; using ${fallback}`);
    return fallback;
  }
  return value;
}

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
    retryAt: retryAt ? retryAt.toISOString() : null,
  };
}

// Read lazily, like the AI keys, so a changed .env takes effect without touching module state.
function budgetConfig(now: Date): { monthlyBudgetUsd: number; userDailyCapUsd: number | null } {
  const monthlyBudgetUsd = readNumberEnv('AI_MONTHLY_BUDGET_USD', DEFAULT_MONTHLY_BUDGET_USD);
  const defaultCap = (monthlyBudgetUsd / daysInUtcMonth(now)) * DEFAULT_USER_DAILY_CAP_DAYS;
  const cap = readNumberEnv('AI_USER_DAILY_BUDGET_USD', defaultCap);
  return { monthlyBudgetUsd, userDailyCapUsd: cap === 0 ? null : cap };
}

async function sumCost(where: {
  backend: AiBackendName;
  since: Date;
  userId?: string;
}): Promise<number> {
  const result = await prisma.aiUsage.aggregate({
    _sum: { costUsd: true },
    where: {
      backend: where.backend,
      createdAt: { gte: where.since },
      ...(where.userId ? { userId: where.userId } : {}),
    },
  });
  return Number(result._sum.costUsd ?? 0);
}

export async function getOpenRouterBudget(
  userId: string,
  now: Date = new Date()
): Promise<AiBudgetStatus> {
  const [spentThisMonthUsd, userSpentTodayUsd] = await Promise.all([
    sumCost({ backend: 'openrouter', since: startOfUtcMonth(now) }),
    sumCost({ backend: 'openrouter', since: startOfUtcDay(now), userId }),
  ]);
  return computeOpenRouterBudget({
    now,
    ...budgetConfig(now),
    spentThisMonthUsd,
    userSpentTodayUsd,
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
    second: '2-digit',
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
  const limit = readNumberEnv('GEMINI_DAILY_REQUEST_LIMIT', DEFAULT_GEMINI_DAILY_REQUEST_LIMIT);
  const { start, end } = zonedDayBounds(now, GEMINI_QUOTA_TIME_ZONE);
  const result = await prisma.aiUsage.aggregate({
    _sum: { requestCount: true },
    where: { backend: 'gemini', createdAt: { gte: start } },
  });
  const used = result._sum.requestCount ?? 0;
  const allowed = used < limit;
  return { used, limit, allowed, retryAt: allowed ? null : end.toISOString() };
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
    await prisma.aiUsage.create({ data: record });
  } catch (err) {
    console.error('[ai-budget] failed to record AI usage:', err);
  }
}
