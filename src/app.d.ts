import type { Session } from '#lib/server/auth/better-auth.ts';
import type { AiQuotaScope } from '#lib/shared/ai/budget.ts';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: Session['user'];
			session?: Session['session'];
		}

		interface Error {
			message: string;
			/** A domain error's kind (see #lib/server/http/kinded-errors.ts), for the page to branch on. */
			kind?: string;
			/** On a spent AI budget: whose it was and when it refills. */
			scope?: AiQuotaScope;
			retryAt?: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
