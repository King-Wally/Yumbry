import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. Changing it logs everyone out. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	RESEND_API_KEY: {
		description: 'Resend API key for password-reset emails. Unset disables password reset.',
		schema: optional
	},
	EMAIL_FROM: {
		description: 'The "From" address for emails. Must use a domain verified in Resend.',
		schema: optional
	},
	COOKIE_SECURE: {
		description: '`true` to mark auth cookies Secure (the app is served over HTTPS).',
		schema: (value: string | undefined) => value === 'true'
	},
	DISABLE_RATE_LIMITS: {
		description: '`1` turns off better-auth rate limiting (the E2E suite runs a production build).',
		schema: (value: string | undefined) => value === '1'
	}
});
