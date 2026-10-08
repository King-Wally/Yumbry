import type { Session } from '#lib/server/auth.ts';

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
			/** A domain error's kind (see #lib/server/kinded-errors.ts), for the page to branch on. */
			kind?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
