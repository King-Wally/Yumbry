import { describe, expect, it } from 'vitest';
import type { AiBudgetStatus } from '../src/ai-budget.js';
import {
  formatRetryAt,
  nextUtcMidnight,
  sharedPoolDaysLeft,
  userAllowancePercentLeft,
} from '../src/ai-budget-display.js';

function budget(overrides: Partial<AiBudgetStatus> = {}): AiBudgetStatus {
  return {
    monthlyBudgetUsd: 30,
    dailyAllowanceUsd: 1,
    availableUsd: 5,
    userDailyCapUsd: 3,
    userSpentTodayUsd: 0,
    allowed: true,
    blockedBy: null,
    retryAt: null,
    ...overrides,
  };
}

describe('userAllowancePercentLeft', () => {
  it('is 100 before anything is spent', () => {
    expect(userAllowancePercentLeft(budget())).toBe(100);
  });

  it('rounds to a whole percentage', () => {
    expect(userAllowancePercentLeft(budget({ userSpentTodayUsd: 1 }))).toBe(67);
  });

  it('clamps an overshoot to 0', () => {
    expect(userAllowancePercentLeft(budget({ userSpentTodayUsd: 4 }))).toBe(0);
  });

  it('is null when the per-user cap is off', () => {
    expect(userAllowancePercentLeft(budget({ userDailyCapUsd: null }))).toBeNull();
  });
});

describe('sharedPoolDaysLeft', () => {
  it('counts days of accrual in the pool', () => {
    expect(sharedPoolDaysLeft(budget({ availableUsd: 2.5, dailyAllowanceUsd: 0.5 }))).toBe(5);
  });

  it('never goes negative after an overshoot', () => {
    expect(sharedPoolDaysLeft(budget({ availableUsd: -0.01 }))).toBe(0);
  });
});

describe('nextUtcMidnight', () => {
  it('is the start of the next UTC day', () => {
    expect(nextUtcMidnight(new Date('2026-03-31T23:59:00Z'))).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('formatRetryAt', () => {
  it('shows only the time for later today', () => {
    const now = new Date(2026, 2, 10, 9, 0);
    const at = new Date(2026, 2, 10, 17, 30).toISOString();
    expect(formatRetryAt(at, 'en', now)).not.toMatch(/March/);
  });

  it('adds the day for another day', () => {
    const now = new Date(2026, 2, 10, 9, 0);
    const at = new Date(2026, 2, 12, 1, 0).toISOString();
    expect(formatRetryAt(at, 'en', now)).toMatch(/March/);
  });
});
