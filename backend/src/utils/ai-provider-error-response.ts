import type { Response } from 'express';
import { AiProviderError, type AiProviderErrorKind } from 'yumbry-shared';
import { sendKindedError } from './kinded-error-response.js';

// 503, not 502: behind Cloudflare an origin 502/504 is replaced by Cloudflare's own error page,
// dropping our message. 503 bodies pass through.
const STATUS_BY_KIND: Record<AiProviderErrorKind, number> = {
  unreachable: 503,
  bad_status: 503,
  malformed_response: 503,
  not_configured: 503,
};

/** Turns an AiProviderError into the right HTTP response; rethrows anything
 * else so asyncHandler forwards it to app.ts's generic 500 handler. */
export function sendAiProviderError(res: Response, err: unknown): void {
  sendKindedError(res, err, AiProviderError, STATUS_BY_KIND);
}
