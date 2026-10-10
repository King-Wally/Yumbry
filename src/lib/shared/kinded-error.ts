import type { AiQuotaScope } from '#lib/shared/ai/budget.ts';

/** What a failed action or load returns for a domain error (#lib/server/http/kinded-errors.ts). */
export interface KindedErrorData {
	/** Already in the reader's language. */
	message: string;
	kind: string;
	/** Only on a spent AI budget: whose it was and when it refills. */
	scope?: AiQuotaScope;
	retryAt?: string | null;
}
