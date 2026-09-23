import type { Response } from 'express';
import { sendKindedError } from './kinded-error-response.js';

export type UrlImportErrorKind =
  | 'invalid_url'
  | 'blocked_url'
  | 'timeout'
  | 'network_error'
  | 'unsupported_content_type'
  | 'too_large'
  | 'too_many_redirects'
  | 'bot_challenge'
  | 'no_jsonld'
  | 'no_recipe_found';

export class UrlImportError extends Error {
  readonly kind: UrlImportErrorKind;

  constructor(message: string, kind: UrlImportErrorKind, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'UrlImportError';
    this.kind = kind;
  }
}

// Never 502/504 here: behind Cloudflare, an origin 502/504 is replaced by Cloudflare's own error
// page, so the user would lose this message and see a generic "server unavailable" instead.
const STATUS_BY_KIND: Record<UrlImportErrorKind, number> = {
  invalid_url: 400,
  blocked_url: 400,
  timeout: 422,
  network_error: 422,
  unsupported_content_type: 400,
  too_large: 400,
  too_many_redirects: 400,
  bot_challenge: 422,
  no_jsonld: 400,
  no_recipe_found: 400,
};

export function sendUrlImportError(res: Response, err: unknown): void {
  sendKindedError(res, err, UrlImportError, STATUS_BY_KIND);
}
