import rateLimit from 'express-rate-limit';

// DISABLE_RATE_LIMITS=1 lets the E2E suite drive the built app without tripping per-IP limits
// (every browser in a run shares 127.0.0.1). Checked per request; never set it in production.
const skip = () => process.env.DISABLE_RATE_LIMITS === '1';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many attempts. Try again later.' },
});

export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many attempts. Try again later.' },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many requests. Slow down.' },
});

export const urlImportRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many import attempts. Try again later.' },
});

// Half the URL-import allowance: every call here spends a full image through the big model, which
// is by some distance the most expensive thing a single request in this app can do.
export const photoImportRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many import attempts. Try again later.' },
});
