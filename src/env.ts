import { building, dev } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

// Validators run twice: once while `vite build` analyses the app (`building` is true, and the
// environment is usually empty — CI and `docker build` have no secrets), and again when the server
// starts. Required variables only insist on a value at start-up, so a build needs no environment.

/** Must be non-empty when the server starts. */
const required = (value: string | undefined): string => {
	if (value) return value;
	if (building) return '';
	throw new Error('Must be set.');
};

/** Unset and empty are the same thing: the e2e harness passes `''` to switch features off. */
const optional = (value: string | undefined) => value || undefined;

/** A non-negative number, or undefined when unset. Garbage fails at start-up rather than silently
 * falling back to the service's default. */
const optionalNonNegativeNumber = (value: string | undefined): number | undefined => {
	const raw = value?.trim();
	if (!raw) return undefined;
	const number = Number(raw);
	if (!Number.isFinite(number) || number < 0) {
		throw new Error(`Must be a non-negative number, got "${raw}".`);
	}
	return number;
};

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.', schema: required },
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.',
		schema: required
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. Changing it logs everyone out. See [Better Auth installation](https://www.better-auth.com/docs/installation).',
		// Required in production only. Dev gets a fixed placeholder rather than a random one, because
		// a secret that changed per boot would log everyone out on every restart.
		schema: (value: string | undefined): string => {
			if (value) return value;
			if (dev || building) return 'dev-only-better-auth-secret-not-for-production';
			throw new Error('Must be set in production.');
		}
	},
	COOKIE_SECURE: {
		description: '`true` to mark auth cookies Secure (the app is served over HTTPS).',
		schema: (value: string | undefined) => value === 'true'
	},
	DISABLE_RATE_LIMITS: {
		description:
			"`1` turns off rate limiting, both better-auth's and the app's own (the E2E suite runs a production build from one IP).",
		schema: (value: string | undefined) => value === '1'
	},
	UPLOADS_DIR: {
		description: 'Where recipe photos are stored. Defaults to `./uploads`.',
		schema: optional
	},

	RESEND_API_KEY: {
		description: 'Resend API key for password-reset emails. Unset disables password reset.',
		schema: optional
	},
	EMAIL_FROM: {
		description: 'The "From" address for emails. Must use a domain verified in Resend.',
		schema: optional
	},
	RESEND_BASE_URL: {
		description: "Overrides Resend's API base URL. Test-only (the e2e fakes).",
		schema: optional
	},

	OPENROUTER_API_KEY: {
		description: 'OpenRouter API key. Unset disables the AI assistant.',
		schema: optional
	},
	OPENROUTER_BASE_URL: {
		description: "Overrides OpenRouter's API base URL. Test-only (the e2e fakes).",
		schema: optional
	},
	GEMINI_API_KEY: {
		description: 'Google Gemini API key for nutrition estimates. Unset disables them only.',
		schema: optional
	},
	GEMINI_BASE_URL: {
		description: "Overrides Gemini's OpenAI-compatible base URL. Test-only (the e2e fakes).",
		schema: optional
	},
	AI_MODEL_BIG: {
		description: 'OpenRouter model for the first turn of a recipe written from scratch.',
		schema: optional
	},
	AI_MODEL_MEDIUM: {
		description: 'OpenRouter model for every later chat turn and every improve turn.',
		schema: optional
	},
	AI_MODEL_SMALL: {
		description: 'Gemini model id (no `google/` prefix) for nutrition estimates.',
		schema: optional
	},
	AI_MODEL_IMAGE: {
		description: 'Vision-capable OpenRouter model for photo import.',
		schema: optional
	},
	AI_MONTHLY_BUDGET_USD: {
		description: 'Monthly OpenRouter budget in USD, accrued one day at a time.',
		schema: optionalNonNegativeNumber
	},
	AI_USER_DAILY_BUDGET_USD: {
		description: 'Per-user OpenRouter cap per UTC day in USD. `0` turns it off.',
		schema: optionalNonNegativeNumber
	},
	GEMINI_DAILY_REQUEST_LIMIT: {
		description: 'Gemini requests allowed per Pacific-time day.',
		schema: optionalNonNegativeNumber
	},

	BROWSER_CDP_URL: {
		description: 'CDP endpoint of the CloakBrowser sidecar for URL import. Unset disables it.',
		schema: optional
	},
	BROWSER_PROXY_HOST: {
		description: "The host the browser reaches the app's SSRF proxy at. Defaults to `127.0.0.1`.",
		schema: optional
	},
	E2E_SAFE_FETCH_ALLOW: {
		description:
			'Test-only: `host:port` pairs URL import may fetch despite being private addresses.',
		schema: optional
	}
});
