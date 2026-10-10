import type { AiQuotaScope } from '#lib/shared/ai/budget.ts';

export type AiProviderErrorKind =
	'unreachable' | 'bad_status' | 'malformed_response' | 'not_configured' | 'quota_exceeded';

/** An AI call that failed. The message is for the logs; the user reads the kind's translated
 * message (#lib/server/http/kinded-errors.ts). */
export class AiProviderError extends Error {
	readonly kind: AiProviderErrorKind;

	constructor(message: string, kind: AiProviderErrorKind, cause?: unknown) {
		super(message, cause !== undefined ? { cause } : undefined);
		this.name = 'AiProviderError';
		this.kind = kind;
	}
}

/** A request refused before it reached the provider because a budget is spent. `scope` says whose,
 * and `retryAt` when it refills, so the page can say it in the reader's language and time zone. */
export class AiQuotaExceededError extends AiProviderError {
	readonly scope: AiQuotaScope;
	readonly retryAt: string | null;

	constructor(scope: AiQuotaScope, retryAt: string | null) {
		super(`AI budget spent (${scope}).`, 'quota_exceeded');
		this.name = 'AiQuotaExceededError';
		this.scope = scope;
		this.retryAt = retryAt;
	}
}

/** Runs a parser over the model's answer; whatever it throws is a malformed answer. */
export function parseModelAnswer<T>(parse: () => T): T {
	try {
		return parse();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new AiProviderError(message, 'malformed_response', err);
	}
}
