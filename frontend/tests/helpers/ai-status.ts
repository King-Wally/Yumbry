import type { AiBudgetStatus, AiStatusResponse } from 'yumbry-shared';

/** A `GET /api/ai/status` body with an untouched budget, overridable field by field. */
export function aiStatus(
  configured: boolean,
  budget: Partial<AiBudgetStatus> = {}
): AiStatusResponse {
  return {
    configured,
    budget: {
      monthlyBudgetUsd: 1,
      dailyAllowanceUsd: 1 / 30,
      availableUsd: 1 / 30,
      userDailyCapUsd: 0.1,
      userSpentTodayUsd: 0,
      allowed: true,
      blockedBy: null,
      retryAt: null,
      ...budget,
    },
  };
}
