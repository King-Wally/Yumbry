import { db } from '#lib/server/db/index.ts';
import { recipeImportAttempts } from '#lib/server/db/schema.ts';
import type { ImportMethod, UrlImportErrorKind } from '#lib/server/url-import/errors.ts';

const MAX_ERROR_MESSAGE_LENGTH = 500;

type LogImportAttemptInput =
	| { url: string; success: true; method?: ImportMethod }
	| {
			url: string;
			success: false;
			/** Omitted when no fetch was attempted (e.g. a rejected request body). */
			method?: ImportMethod;
			errorKind: UrlImportErrorKind | 'validation_error' | 'unknown';
			errorMessage: string;
	  };

/** The URL's hostname, or the raw string when it doesn't parse: logging must never be what fails. */
function extractHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/**
 * Records one row of site-level URL import analytics (`recipe_import_attempts`): hostname,
 * success or failure and the error kind, keyed only by the URL, with no user or family. Best-effort:
 * a failed write is logged, never thrown, so it can't break the import itself.
 */
export async function logImportAttempt(input: LogImportAttemptInput): Promise<void> {
	try {
		await db.insert(recipeImportAttempts).values({
			url: input.url,
			hostname: extractHostname(input.url),
			success: input.success,
			method: input.method ?? null,
			errorKind: input.success ? null : input.errorKind,
			errorMessage: input.success ? null : input.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH)
		});
	} catch (err) {
		console.error('Failed to record import attempt analytics:', err);
	}
}
