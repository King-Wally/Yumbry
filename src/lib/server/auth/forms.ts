import { fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { limitClient, type RateLimiter } from '#lib/server/http/rate-limit.ts';

// Shared by the login and register form actions, which call auth.api.* directly.

export interface CredentialsFailure {
	/** Echoed back so the field stays filled in. The password never is. */
	email: string;
	message: string;
}

export interface Credentials {
	email: string;
	password: string;
}

/** The submitted credentials, or a 429 once the client has tried too often. */
export async function readCredentials(
	event: RequestEvent,
	limiter: RateLimiter
): Promise<Credentials | ActionFailure<CredentialsFailure>> {
	const data = await event.request.formData();
	const email = String(data.get('email') ?? '').trim();
	const password = String(data.get('password') ?? '');

	const limit = limitClient(event, limiter);
	if (limit.limited) return fail(429, { email, message: limit.message });
	return { email, password };
}

/** better-auth's refusal (wrong password, email taken, password too short) with its own message,
 * as main showed it. Anything else is unexpected and rethrown. */
export function authRefusal(err: unknown, fallback: string): { status: number; message: string } {
	if (!isAPIError(err) || err.statusCode >= 500) throw err;
	return { status: err.statusCode, message: err.body?.message || fallback };
}

/** {@link authRefusal} as a login/register form failure. */
export function authFailure(
	err: unknown,
	email: string,
	fallback: string
): ActionFailure<CredentialsFailure> {
	const { status, message } = authRefusal(err, fallback);
	return fail(status, { email, message });
}
