import rateLimit from 'express-rate-limit';

/** Applied to /api/auth/register and /api/auth/login only — brute-force
 * protection, keyed by IP since this app has no per-account lockout state. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

/** Applied to all of /api/* — a broad backstop so a buggy or abusive client
 * can't hammer the backend/Postgres through any endpoint, not just login.
 * Limits are generous relative to real single-household usage. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});
