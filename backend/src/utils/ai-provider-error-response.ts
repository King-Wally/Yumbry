import type { Response } from 'express';
import { AiProviderError, type AiProviderErrorKind } from 'yumbry-shared';

const STATUS_BY_KIND: Record<AiProviderErrorKind, number> = {
  unreachable: 502,
  bad_status: 502,
  malformed_response: 502,
};

/** Turns an AiProviderError into the right HTTP response; rethrows anything
 * else so asyncHandler forwards it to app.ts's generic 500 handler. */
export function sendAiProviderError(res: Response, err: unknown): void {
  if (!(err instanceof AiProviderError)) throw err;
  res.status(STATUS_BY_KIND[err.kind]).json({ error: err.message, kind: err.kind });
}
