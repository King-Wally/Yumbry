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
		stashDraft(cookies, 'user-1', draft, 'url');
		expect(cookies.values.get(DRAFT_COOKIE)).toMatch(/^[0-9a-f]{48}$/);

		expect(takeDraft(cookies, 'user-1')).toEqual({ draft, source: 'url' });
	});

	it('is taken once', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url');
		takeDraft(cookies, 'user-1');

		expect(cookies.values.has(DRAFT_COOKIE)).toBe(false);
		expect(takeDraft(cookies, 'user-1')).toBeNull();
	});

	it('is gone even if the cookie is replayed after taking it', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url');
		const id = cookies.values.get(DRAFT_COOKIE)!;
		takeDraft(cookies, 'user-1');

		cookies.set(DRAFT_COOKIE, id, { path: '/' });
		expect(takeDraft(cookies, 'user-1')).toBeNull();
	});

	it("never hands one user's draft to another", () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'url');

		expect(takeDraft(cookies, 'user-2')).toBeNull();
	});

	it('expires', () => {
		const cookies = cookieJar();
		stashDraft(cookies, 'user-1', draft, 'photo', 0);

		expect(takeDraft(cookies, 'user-1', 10 * 60 * 1000)).toBeNull();
	});

	it('is nothing without a cookie, or with an unknown one', () => {
		const cookies = cookieJar();
		expect(takeDraft(cookies, 'user-1')).toBeNull();
		cookies.set(DRAFT_COOKIE, 'not-a-draft', { path: '/' });
		expect(takeDraft(cookies, 'user-1')).toBeNull();
	});
});
