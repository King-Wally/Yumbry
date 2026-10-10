// What is exhausted when an AI request is refused for budget reasons: `shared` is the server-wide
// OpenRouter pool (or the Gemini daily request quota), `user` is one user's own daily cap.
export type AiQuotaScope = 'shared' | 'user';

/** The OpenRouter budget as one user sees it (the rule is in #lib/server/ai/budget.ts). */
export interface AiBudgetStatus {
	monthlyBudgetUsd: number;
	dailyAllowanceUsd: number;
	/** The shared pool spendable right now; may dip slightly below 0 after the last request. */
	availableUsd: number;
	/** `null` when the per-user cap is switched off (`AI_USER_DAILY_BUDGET_USD=0`). */
	userDailyCapUsd: number | null;
	userSpentTodayUsd: number;
	allowed: boolean;
	blockedBy: AiQuotaScope | null;
	/** ISO timestamp of when a blocked user can next make a request; `null` while allowed. */
	retryAt: string | null;
}
