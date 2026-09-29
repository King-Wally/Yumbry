import type { AiBudgetStatus } from './ai-budget.js';

// How an AiBudgetStatus is presented to the person it belongs to. Formatting of the numbers
// themselves (locale, digits) stays with the UI; these decide what the numbers are.

/** Share of today's per-user allowance still unspent, as a whole percentage clamped to 0–100.
 * `null` when the per-user cap is switched off. */
export function userAllowancePercentLeft(budget: AiBudgetStatus): number | null {
  if (budget.userDailyCapUsd === null) return null;
  const left = 1 - budget.userSpentTodayUsd / budget.userDailyCapUsd;
  return Math.round(Math.min(1, Math.max(0, left)) * 100);
}

/** How many days of accrual the shared pool holds right now; never negative. */
export function sharedPoolDaysLeft(budget: AiBudgetStatus): number {
  return Math.max(0, budget.availableUsd / budget.dailyAllowanceUsd);
}

/** The user's cap resets, and the shared pool gains a day's share, at every UTC midnight. */
export function nextUtcMidnight(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  ).toISOString();
}

/** When a spent AI budget next accepts a request, in the reader's own time zone: just the time
 * when that is later today, otherwise the day as well. */
export function formatRetryAt(iso: string, locale: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { weekday: 'long', day: 'numeric', month: 'long' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}
