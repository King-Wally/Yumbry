import type { Response } from 'express';

export type UrlImportErrorKind =
  | 'invalid_url'
  | 'blocked_url'
  | 'timeout'
  | 'network_error'
  | 'unsupported_content_type'
  | 'too_large'
  | 'too_many_redirects'
  | 'no_jsonld'
  | 'no_recipe_found';

/** Thrown by safe-fetch.ts and url-recipe-import.service.ts for every way
 * fetching/parsing a user-supplied recipe URL can fail. */
export class UrlImportError extends Error {
  readonly kind: UrlImportErrorKind;

  constructor(message: string, kind: UrlImportErrorKind, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'UrlImportError';
    this.kind = kind;
  }
}

/** 502 for upstream-fetch failures (the page itself didn't respond in time
 * or at all); 400 for everything shaped like a problem with the user's
 * input or the page's content. */
const STATUS_BY_KIND: Record<UrlImportErrorKind, number> = {
  invalid_url: 400,
  blocked_url: 400,
  timeout: 502,
  network_error: 502,
  unsupported_content_type: 400,
  too_large: 400,
  too_many_redirects: 400,
  no_jsonld: 400,
  no_recipe_found: 400,
};

/** Turns a UrlImportError into the right HTTP response; rethrows anything
 * else so asyncHandler forwards it to app.ts's generic 500 handler. */
export function sendUrlImportError(res: Response, err: unknown): void {
  if (!(err instanceof UrlImportError)) throw err;
  res.status(STATUS_BY_KIND[err.kind]).json({ error: err.message, kind: err.kind });
}
