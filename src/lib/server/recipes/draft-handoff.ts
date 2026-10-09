import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { RecipeBody } from '#lib/server/recipes/body-schema.ts';

// Hands a draft recipe (from URL import, photo import or the AI assistant) to a recipe form for
// review, without saving anything: /recipes/new, or for "Improve with AI" the edit form of the
// recipe being improved. The action that made the draft stashes it and redirects; the form's load
// takes it. Like flash.ts this rides on a cookie rather than an
// enhance callback, so it survives a plain form POST. A draft can outgrow a cookie's 4 KB, so the
// cookie carries only a random id and the draft waits here, in memory: one process serves the app
// (as for rate-limit.ts), and a restart merely drops drafts nobody has opened yet.

export type DraftSource = 'url' | 'photo' | 'ai';

/** The form the draft is for: null for /recipes/new, or the id of the recipe whose edit form
 * reviews it. */
export type DraftTarget = number | null;

export interface Draft {
	draft: RecipeBody;
	source: DraftSource;
}

export const DRAFT_COOKIE = 'yumbry-draft';
// The cookie is sent to the recipe pages only (both forms and their __data.json). The stored
// target decides which form may take it.
const COOKIE_PATH = '/recipes';
const TTL_MS = 10 * 60 * 1000;
const MAX_DRAFTS = 500;

interface StoredDraft extends Draft {
	userId: string;
	target: DraftTarget;
	expiresAt: number;
}

const drafts = new Map<string, StoredDraft>();

function sweep(time: number): void {
	for (const [id, stored] of drafts) if (stored.expiresAt <= time) drafts.delete(id);
	// Map iteration is insertion order, so the first keys are the oldest.
	for (const id of drafts.keys()) {
		if (drafts.size < MAX_DRAFTS) break;
		drafts.delete(id);
	}
}

export function stashDraft(
	cookies: Cookies,
	userId: string,
	draft: RecipeBody,
	source: DraftSource,
	target: DraftTarget,
	now = Date.now()
): void {
	sweep(now);
	const id = randomBytes(24).toString('hex');
	drafts.set(id, { userId, draft, source, target, expiresAt: now + TTL_MS });
	cookies.set(DRAFT_COOKIE, id, {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		maxAge: TTL_MS / 1000
	});
}

/** The pending draft for this user and form (forgetting it), or null. Taken once, so opening a
 * blank form later never brings back a draft that was abandoned. A draft for another form stays
 * where it is: that form is the one being redirected to. */
export function takeDraft(
	cookies: Cookies,
	userId: string,
	target: DraftTarget,
	now = Date.now()
): Draft | null {
	const id = cookies.get(DRAFT_COOKIE);
	if (id === undefined) return null;

	const stored = drafts.get(id);
	if (stored && stored.userId === userId && stored.target !== target) return null;
	cookies.delete(DRAFT_COOKIE, { path: COOKIE_PATH });
	if (!stored || stored.userId !== userId) return null;
	drafts.delete(id);
	if (stored.expiresAt <= now) return null;
	return { draft: stored.draft, source: stored.source };
}
