import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { AiQuotaScope } from '#lib/shared/ai-budget.ts';
import {
	AiProviderError,
	AiQuotaExceededError,
	type AiProviderErrorKind
} from '#lib/shared/ai-provider-error.ts';
import { FamilyError, type FamilyErrorKind } from '#lib/server/family-error.ts';
import { UrlImportError, type UrlImportErrorKind } from '#lib/server/url-import-error.ts';

// Domain errors carry a `kind`; this is the one place that turns a kind into an HTTP status.
//
// Never 502 or 504: behind Cloudflare, an origin 502/504 is replaced by Cloudflare's own error page,
// so the user would lose our message. 503 bodies pass through.

const AI_PROVIDER_STATUS: Record<AiProviderErrorKind, number> = {
	unreachable: 503,
	bad_status: 503,
	malformed_response: 503,
	not_configured: 503,
	quota_exceeded: 429
};

const URL_IMPORT_STATUS: Record<UrlImportErrorKind, number> = {
	invalid_url: 400,
	blocked_url: 400,
	timeout: 422,
	network_error: 422,
	unsupported_content_type: 400,
	too_large: 400,
	too_many_redirects: 400,
	bot_challenge: 422,
	no_jsonld: 400,
	no_recipe_found: 400
};

const FAMILY_STATUS: Record<FamilyErrorKind, number> = {
	invalid_invite: 404,
	already_member: 409,
	nothing_to_leave: 409
};

export interface KindedError {
	status: number;
	message: string;
	kind: string;
	/** Only on a spent AI budget: whose it was and when it refills. */
	scope?: AiQuotaScope;
	retryAt?: string | null;
}

type KindedData = Omit<KindedError, 'status'>;

/** The status, message and kind for a known domain error, or null for anything else. */
export function kindedError(err: unknown): KindedError | null {
	if (err instanceof AiQuotaExceededError) {
		return {
			status: AI_PROVIDER_STATUS[err.kind],
			message: err.message,
			kind: err.kind,
			scope: err.scope,
			retryAt: err.retryAt
		};
	}
	if (err instanceof AiProviderError) {
		return { status: AI_PROVIDER_STATUS[err.kind], message: err.message, kind: err.kind };
	}
	if (err instanceof UrlImportError) {
		return { status: URL_IMPORT_STATUS[err.kind], message: err.message, kind: err.kind };
	}
	if (err instanceof FamilyError) {
		return { status: FAMILY_STATUS[err.kind], message: err.message, kind: err.kind };
	}
	return null;
}

/** For form actions: a known domain error becomes `fail(status, { message, kind })`, plus `scope`
 * and `retryAt` for a spent AI budget. Anything else is rethrown unchanged, so it reaches
 * handleError as a 500. */
export function failKinded(err: unknown): ActionFailure<KindedData> {
	const known = kindedError(err);
	if (!known) throw err;
	const { status, ...data } = known;
	return fail(status, data);
}

/** For loads and `+server` handlers: a known domain error becomes `error(status, { message, kind })`.
 * Anything else is rethrown unchanged. */
export function throwKinded(err: unknown): never {
	const known = kindedError(err);
	if (!known) throw err;
	const { status, ...data } = known;
	error(status, data);
}
