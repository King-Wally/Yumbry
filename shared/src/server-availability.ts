/** Statuses a gateway or tunnel returns when the origin is unreachable: 502/504, 503 (the
 * offline Worker's fallback) and Cloudflare's 52x family except 524 — a 524 is an origin
 * timeout, so the origin was reached and is up. */
const UNAVAILABLE_STATUSES = new Set([
  502,
  503,
  504,
  ...Array.from({ length: 11 }, (_, i) => 520 + i).filter((status) => status !== 524),
]);

/** True when a response looks like "the server is down" rather than an application error.
 * Our own 503s (AI provider errors) are JSON, so a non-JSON one is a gateway's. */
export function isServerUnavailableResponse(status: number, isJson: boolean): boolean {
  return !isJson && UNAVAILABLE_STATUSES.has(status);
}
