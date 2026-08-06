import type { Response } from 'express';

/** Shared "domain error → HTTP response" adapter behind both
 * sendAiProviderError and sendUrlImportError: type-guards `err` against the
 * given class, looks up its HTTP status by `kind`, and responds with
 * `{error, kind}` — or rethrows anything that isn't an instance of
 * `ErrorClass`, so asyncHandler forwards it to app.ts's generic 500 handler. */
export function sendKindedError<K extends string>(
  res: Response,
  err: unknown,
  ErrorClass: new (...args: never[]) => Error & { kind: K },
  statusByKind: Record<K, number>
): void {
  if (!(err instanceof ErrorClass)) throw err;
  res.status(statusByKind[err.kind]).json({ error: err.message, kind: err.kind });
}
