import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { saveLocaleChoice } from '#lib/server/http/locale.ts';
import type { Preferences } from '#lib/server/preferences/parse.ts';

/** Saves the signed-in user's preferences. These are better-auth fields with `input: false`, so its
 * own updateUser endpoint can't write them; this is the only way in. */
export async function updatePreferences(
	event: RequestEvent,
	userId: string,
	{ locale, ...rest }: Preferences
): Promise<void> {
	// The language also sets the Paraglide cookie, so it goes through the one place that does both.
	if (locale) await saveLocaleChoice(event, locale);

	const columns = Object.fromEntries(
		Object.entries(rest).filter(([, value]) => value !== undefined)
	) as Omit<Preferences, 'locale'>;
	if (Object.keys(columns).length === 0) return;

	await db.update(users).set(columns).where(eq(users.id, userId));
	// Keep the rest of this request (the page's load after the action) in step with the database.
	if (event.locals.user) Object.assign(event.locals.user, columns);
}
