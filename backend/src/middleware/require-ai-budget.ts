import type { NextFunction, Request, Response } from 'express';
import { quotaExceededMessage, type AiQuotaScope } from 'yumbry-shared';
import { getGeminiQuota, getOpenRouterBudget } from '../services/ai-budget.service.js';

// Checked on the route rather than inside chatWithAi so a refused request never reaches multer
// (a blocked photo import is not uploaded first) and so the check runs against the real ledger
// even in tests that mock the provider call.

function sendQuotaExceeded(res: Response, scope: AiQuotaScope, retryAt: string | null): void {
  res
    .status(429)
    .json({ error: quotaExceededMessage(scope), kind: 'quota_exceeded', scope, retryAt });
}

/** Refuses OpenRouter-backed calls (chat, photo import) once the shared monthly pool or the
 * user's own daily cap is used up. */
export async function requireOpenRouterBudget(req: Request, res: Response, next: NextFunction) {
  const budget = await getOpenRouterBudget(req.userId!);
  if (!budget.allowed) return sendQuotaExceeded(res, budget.blockedBy!, budget.retryAt);
  next();
}

/** Refuses Gemini-backed calls (nutrition) once the free tier's daily request quota is used up. */
export async function requireGeminiQuota(_req: Request, res: Response, next: NextFunction) {
  const quota = await getGeminiQuota();
  if (!quota.allowed) return sendQuotaExceeded(res, 'shared', quota.retryAt);
  next();
}
