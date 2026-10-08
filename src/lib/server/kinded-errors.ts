import { error, fail, type ActionFailure } from '@sveltejs/kit';
import { AiProviderError, type AiProviderErrorKind } from '#lib/shared/ai-provider-error.ts';
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
}

/** The status, message and kind for a known domain error, or null for anything else. */
export function kindedError(err: unknown): KindedError | null {
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

/** For form actions: a known domain error becomes `fail(status, { message, kind })`. Anything else
 * is rethrown unchanged, so it reaches handleError as a 500. */
export function failKinded(err: unknown): ActionFailure<{ message: string; kind: string }> {
	const known = kindedError(err);
	if (!known) throw err;
	return fail(known.status, { message: known.message, kind: known.kind });
}

/** For loads and `+server` handlers: a known domain error becomes `error(status, { message, kind })`.
 * Anything else is rethrown unchanged. */
export function throwKinded(err: unknown): never {
	const known = kindedError(err);
	if (!known) throw err;
	error(known.status, { message: known.message, kind: known.kind });
}
