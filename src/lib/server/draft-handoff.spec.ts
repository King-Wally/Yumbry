import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { RecipeBody } from '#lib/server/recipe-schema.ts';
import { DRAFT_COOKIE, stashDraft, takeDraft } from './draft-handoff.ts';

/** Just enough of Kit's cookie jar: one browser's cookies, ignoring paths. */
function cookieJar(): Cookies & { values: Map<string, string> } {
	const values = new Map<string, string>();
	const cookies = {
		values,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name)
	};
	return cookies as unknown as Cookies & { values: Map<string, string> };
}

const draft: RecipeBody = {
	title: 'Pancakes',
	servings: 4,
	ingredients: ['200 g flour'],
	instructions: [{ step_number: 1, text: 'Mix.' }],
	tags: [],
	category: null
};

describe('draft hand-off', () => {
	it('hands the draft and its source to the same user', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url', null);
		expect(cookies.values.get(DRAFT_COOKIE)).toMatch(/^[0-9a-f]{48}$/);

		expect(takeDraft(cookies, 'user-1', null)).toEqual({ draft, source: 'url' });
	});

	it('is taken once', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url', null);
		takeDraft(cookies, 'user-1', null);

		expect(cookies.values.has(DRAFT_COOKIE)).toBe(false);
		expect(takeDraft(cookies, 'user-1', null)).toBeNull();
	});

	it('is gone even if the cookie is replayed after taking it', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url', null);
		const id = cookies.values.get(DRAFT_COOKIE)!;
		takeDraft(cookies, 'user-1', null);

		cookies.set(DRAFT_COOKIE, id, { path: '/' });
		expect(takeDraft(cookies, 'user-1', null)).toBeNull();
	});

	it("never hands one user's draft to another", () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url', null);

		expect(takeDraft(cookies, 'user-2', null)).toBeNull();
	});

	it('expires', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'photo', null, 0);

		expect(takeDraft(cookies, 'user-1', null, 10 * 60 * 1000)).toBeNull();
	});

	it('is nothing without a cookie, or with an unknown one', () => {
		const cookies = cookieJar();
		expect(takeDraft(cookies, 'user-1', null)).toBeNull();
		cookies.set(DRAFT_COOKIE, 'not-a-draft', { path: '/' });
		expect(takeDraft(cookies, 'user-1', null)).toBeNull();
	});

	it('goes only to the form it was made for, which can still take it after another looked', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'ai', 7);

		expect(takeDraft(cookies, 'user-1', null)).toBeNull();
		expect(takeDraft(cookies, 'user-1', 8)).toBeNull();
		expect(takeDraft(cookies, 'user-1', 7)).toEqual({ draft, source: 'ai' });
		expect(cookies.values.has(DRAFT_COOKIE)).toBe(false);
	});

	it('keeps a new-recipe draft away from an edit form', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'photo', null);

		expect(takeDraft(cookies, 'user-1', 7)).toBeNull();
		expect(takeDraft(cookies, 'user-1', null)).toEqual({ draft, source: 'photo' });
	});
});
