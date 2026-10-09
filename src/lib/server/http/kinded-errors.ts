import { fail, type ActionFailure } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import {
	AiProviderError,
	AiQuotaExceededError,
	type AiProviderErrorKind
} from '#lib/server/ai/errors.ts';
import { FamilyError, type FamilyErrorKind } from '#lib/server/family/errors.ts';
import {
	JsonLdImportError,
	type JsonLdImportErrorKind
} from '#lib/server/recipes/jsonld-import.ts';
import { UrlImportError, type UrlImportErrorKind } from '#lib/server/url-import/errors.ts';
import type { KindedErrorData } from '#lib/shared/kinded-error.ts';

// Domain errors carry a `kind`; this is the one place that turns a kind into an HTTP status and the
// message the user reads, in their language. The error's own message is English, for the logs.
//
// Never 502 or 504: behind Cloudflare, an origin 502/504 is replaced by Cloudflare's own error page,
// so the user would lose our message. 503 bodies pass through.

type Mapping<K extends string> = Record<K, [status: number, message: () => string]>;

const AI_PROVIDER: Mapping<Exclude<AiProviderErrorKind, 'quota_exceeded'>> = {
	unreachable: [503, m.ai_error_unreachable],
	bad_status: [503, m.ai_error_bad_status],
	malformed_response: [503, m.ai_error_malformed_response],
	not_configured: [503, m.ai_error_not_configured]
};

const URL_IMPORT: Mapping<UrlImportErrorKind> = {
	invalid_url: [400, m.url_import_error_invalid_url],
	blocked_url: [400, m.url_import_error_blocked_url],
	timeout: [422, m.url_import_error_timeout],
	network_error: [422, m.url_import_error_network_error],
	unsupported_content_type: [400, m.url_import_error_unsupported_content_type],
	too_large: [400, m.url_import_error_too_large],
	too_many_redirects: [400, m.url_import_error_too_many_redirects],
	bot_challenge: [422, m.url_import_error_bot_challenge],
	no_jsonld: [400, m.url_import_error_no_jsonld],
	no_recipe_found: [400, m.url_import_error_no_recipe_found]
};

const JSON_LD_IMPORT: Mapping<JsonLdImportErrorKind> = {
	invalid_json: [400, m.import_json_error_invalid_json],
	not_a_document: [400, m.import_json_error_not_a_document],
	no_recipe: [400, m.import_json_error_no_recipe]
};

const FAMILY: Mapping<FamilyErrorKind> = {
	invalid_invite: [404, m.family_error_invalid_invite],
	already_member: [409, m.family_error_already_member],
	nothing_to_leave: [409, m.family_error_nothing_to_leave]
};

export interface KindedError extends KindedErrorData {
	status: number;
}

function mapped<K extends string>(mapping: Mapping<K>, kind: K): KindedError {
	const [status, message] = mapping[kind];
	return { status, message: message(), kind };
}

/** The status, translated message and kind for a known domain error, or null for anything else. */
export function kindedError(err: unknown): KindedError | null {
	if (err instanceof AiQuotaExceededError) {
		return {
			status: 429,
			message: err.scope === 'user' ? m.ai_quota_user_exceeded() : m.ai_quota_shared_exceeded(),
			kind: err.kind,
			scope: err.scope,
			retryAt: err.retryAt
		};
	}
	if (err instanceof AiProviderError && err.kind !== 'quota_exceeded') {
		return mapped(AI_PROVIDER, err.kind);
	}
	if (err instanceof UrlImportError) return mapped(URL_IMPORT, err.kind);
	if (err instanceof JsonLdImportError) return mapped(JSON_LD_IMPORT, err.kind);
	if (err instanceof FamilyError) return mapped(FAMILY, err.kind);
	return null;
}

/** For form actions: a known domain error becomes `fail(status, { message, kind })`, plus `scope`
 * and `retryAt` for a spent AI budget. Anything else is rethrown unchanged, so it reaches
 * handleError as a 500. */
export function failKinded(err: unknown): ActionFailure<KindedErrorData> {
	const known = kindedError(err);
	if (!known) throw err;
	const { status, ...data } = known;
	return fail(status, data);
}
