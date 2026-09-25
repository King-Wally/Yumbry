import { describe, expect, it } from 'vitest';
import { computeOpenRouterBudget, zonedDayBounds } from '../src/services/ai-budget.service.js';

// September 2026 has 30 days, so $1/month is exactly 1/30 of a dollar a day.
const DAILY = 1 / 30;

function budget(overrides: Partial<Parameters<typeof computeOpenRouterBudget>[0]> = {}) {
  return computeOpenRouterBudget({
    now: new Date('2026-09-10T12:00:00Z'),
    monthlyBudgetUsd: 1,
    spentThisMonthUsd: 0,
    userSpentTodayUsd: 0,
    userDailyCapUsd: 0.1,
    ...overrides,
  });
}

describe('computeOpenRouterBudget', () => {
  it('grants one day’s allowance on the 1st', () => {
    const b = budget({ now: new Date('2026-09-01T00:00:00Z') });
    expect(b.dailyAllowanceUsd).toBeCloseTo(DAILY);
    expect(b.availableUsd).toBeCloseTo(DAILY);
    expect(b.allowed).toBe(true);
  });

  it('rolls unspent days forward: nothing spent by the 10th leaves ten days available', () => {
    expect(budget().availableUsd).toBeCloseTo(10 * DAILY);
  });

  it('subtracts the month’s spend from what has accrued', () => {
    expect(budget({ spentThisMonthUsd: 0.2 }).availableUsd).toBeCloseTo(10 * DAILY - 0.2);
  });

  it('makes the whole monthly budget available on the last day', () => {
    const b = budget({ now: new Date('2026-09-30T23:59:59Z'), spentThisMonthUsd: 0.5 });
    expect(b.availableUsd).toBeCloseTo(0.5);
  });

  it('resets on the 1st: last month’s spend is not carried over', () => {
    // The ledger query is scoped to the month, so a new month starts from zero spend.
    const b = budget({ now: new Date('2026-10-01T00:00:01Z') });
    expect(b.dailyAllowanceUsd).toBeCloseTo(1 / 31);
    expect(b.availableUsd).toBeCloseTo(1 / 31);
  });

  it('splits February into 28 days', () => {
    const b = budget({ now: new Date('2027-02-14T08:00:00Z') });
    expect(b.dailyAllowanceUsd).toBeCloseTo(1 / 28);
    expect(b.availableUsd).toBeCloseTo(0.5);
  });

  it('blocks everyone once the shared pool is empty, until the first midnight that covers it', () => {
    // Spent 12 days' worth by the 10th: the 11th only accrues to 11 days, the 12th to exactly 12
    // (still nothing left), so the 13th is the first day anything is available again.
    const b = budget({ spentThisMonthUsd: 12 * DAILY + 0.0001 });
    expect(b).toMatchObject({ allowed: false, blockedBy: 'shared' });
    expect(b.retryAt).toBe('2026-09-13T00:00:00.000Z');
  });

  it('points a user blocked by an exhausted month at the 1st of next month', () => {
    const b = budget({ now: new Date('2026-09-29T10:00:00Z'), spentThisMonthUsd: 1.01 });
    expect(b.retryAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('blocks a user who reached their daily cap while the pool still has budget', () => {
    const b = budget({ userSpentTodayUsd: 0.1 });
    expect(b).toMatchObject({ allowed: false, blockedBy: 'user' });
    expect(b.availableUsd).toBeGreaterThan(0);
    expect(b.retryAt).toBe('2026-09-11T00:00:00.000Z');
  });

  it('never blocks on the user cap when it is switched off', () => {
    const b = budget({ userDailyCapUsd: null, userSpentTodayUsd: 5, spentThisMonthUsd: 0 });
    expect(b).toMatchObject({ allowed: true, blockedBy: null, retryAt: null });
  });
});

describe('zonedDayBounds', () => {
  it('uses Pacific midnight, not UTC midnight, for the Gemini quota day', () => {
    // 05:00 UTC on the 25th is still 22:00 on the 24th in Los Angeles (PDT, UTC−7).
    const { start, end } = zonedDayBounds(new Date('2026-09-25T05:00:00Z'), 'America/Los_Angeles');
    expect(start.toISOString()).toBe('2026-09-24T07:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-25T07:00:00.000Z');
  });

  it('follows the offset across a DST change', () => {
    // US DST ends 2026-11-01: that day starts at PDT midnight and the next at PST midnight.
    const { start, end } = zonedDayBounds(new Date('2026-11-01T20:00:00Z'), 'America/Los_Angeles');
    expect(start.toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });
});
