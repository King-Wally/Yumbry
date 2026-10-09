import { DISABLE_RATE_LIMITS } from '$app/env/private';
import type { RequestEvent } from '@sveltejs/kit';

// The app's own limits for its expensive actions. better-auth limits /api/auth/* itself (better-auth.ts).
//
// There is no blanket limiter: main's 300/min on /api cushioned a JSON API that no longer exists.
// What is left under /api is better-auth (limited by better-auth), the health check (must never be
// limited: Docker and the tunnel probe it) and a few authenticated file endpoints. Page loads and
// form actions replace the JSON API, and a per-IP cap on all page traffic would mostly hit
// households sharing one NAT address.

export type RateLimitResult =
	{ limited: false } | { limited: true; retryAfterSeconds: number; message: string };

export interface RateLimiter {
	hit(key: string): RateLimitResult;
}

interface RateLimiterOptions {
	windowMs: number;
	limit: number;
	/** What the user is told once limited. */
	message: string;
	now?: () => number;
	/** Read per hit, so DISABLE_RATE_LIMITS stays the single switch. */
	disabled?: () => boolean;
}

/** Past this many tracked keys, a hit first drops the expired ones. */
const SWEEP_THRESHOLD = 1000;

/** A fixed-window counter per key, in memory. One process serves the app, so nothing needs
 * sharing; a restart forgives everyone, which is fine for limits this coarse. */
export function createRateLimiter({
	windowMs,
	limit,
	message,
	now = Date.now,
	disabled = () => DISABLE_RATE_LIMITS
}: RateLimiterOptions): RateLimiter & { readonly size: number } {
	const windows = new Map<string, { count: number; resetAt: number }>();

	return {
		get size() {
			return windows.size;
		},
		hit(key) {
			if (disabled()) return { limited: false };
			const time = now();

			if (windows.size >= SWEEP_THRESHOLD) {
				for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
			}

			let window = windows.get(key);
			if (!window || window.resetAt <= time) {
				window = { count: 0, resetAt: time + windowMs };
				windows.set(key, window);
			}

			window.count += 1;
			if (window.count <= limit) return { limited: false };
			return {
				limited: true,
				retryAfterSeconds: Math.ceil((window.resetAt - time) / 1000),
				message
			};
		}
	};
}

/** Counts a hit for the requesting client's address. In a form action:
 * `const limit = limitClient(event, urlImportLimiter); if (limit.limited) return fail(429, limit);` */
export function limitClient(event: RequestEvent, limiter: RateLimiter): RateLimitResult {
	return limiter.hit(event.getClientAddress());
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const urlImportLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 20,
	message: 'Too many import attempts. Try again later.'
});

// Half the URL-import allowance: every call spends a full image through the vision model, by some
// distance the most expensive thing a single request can do.
export const photoImportLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many import attempts. Try again later.'
});

// Invite tokens are guessable only by brute force; this keeps that out of reach.
export const familyJoinLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many attempts. Try again later.'
});

// The login and register form actions call auth.api.* directly, and better-auth only rate-limits
// requests through its HTTP router (/api/auth/*). These carry its /sign-in/email and
// /sign-up/email rules over to the forms.
export const signInLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many attempts. Try again later.'
});

export const signUpLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many attempts. Try again later.'
});

// Settings' change-password and delete-account actions, likewise carrying over better-auth's
// /change-password and /delete-user rules.
export const changePasswordLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many attempts. Try again later.'
});

export const deleteAccountLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many attempts. Try again later.'
});

// The forgot- and reset-password actions, likewise carrying over better-auth's
// /request-password-reset and /reset-password rules.
export const passwordResetRequestLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 5,
	message: 'Too many attempts. Try again later.'
});

export const passwordResetLimiter = createRateLimiter({
	windowMs: FIFTEEN_MINUTES,
	limit: 10,
	message: 'Too many attempts. Try again later.'
});
