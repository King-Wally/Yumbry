import { prisma } from '../db/prisma.js';
import type { ImportMethod } from './url-recipe-import.service.js';
import type { UrlImportErrorKind } from '../utils/url-import-error.js';

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

/** Best-effort hostname extraction for the analytics row. Falls back to the
 * raw url string if it isn't parseable (e.g. the Zod-rejected/malformed case)
 * rather than throwing — this function must never be the reason logging
 * fails. */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Records one row of site-level import analytics (recipe_import_attempts):
 * hostname, success/failure and error kind, keyed only by the attempted URL —
 * no userId/familyId. Never allowed to break the import response itself: any
 * write failure here is caught and logged to console.error, not rethrown. */
export async function logImportAttempt(input: LogImportAttemptInput): Promise<void> {
  try {
    await prisma.recipeImportAttempt.create({
      data: {
        url: input.url,
        hostname: extractHostname(input.url),
        success: input.success,
        method: input.method ?? null,
        errorKind: input.success ? null : input.errorKind,
        errorMessage: input.success ? null : input.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      },
    });
  } catch (err) {
    console.error('Failed to record import attempt analytics:', err);
  }
}
