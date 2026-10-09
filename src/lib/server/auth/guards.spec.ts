import { isHttpError, isRedirect, type RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/recipes/recipes.ts', () => ({ recipeBelongsToFamily: vi.fn() }));

const { recipeBelongsToFamily } = await import('#lib/server/recipes/recipes.ts');
const { getUser, requireRecipe, requireUser } = await import('#lib/server/auth/guards.ts');

const belongs = vi.mocked(recipeBelongsToFamily);

function event(path: string, user?: Record<string, unknown>, method = 'GET'): RequestEvent {
	return {
		url: new URL(path, 'http://app.test'),
		request: { method },
		cookies: { set: vi.fn() },
		locals: { user }
	} as unknown as RequestEvent;
}

const alice = { id: 'u1', email: 'alice@example.com', familyId: 7 };

async function rejection(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(err: unknown) => err
	);
}

beforeEach(() => belongs.mockReset());

describe('getUser', () => {
	it('returns null when signed out', () => {
		expect(getUser(event('/'))).toBeNull();
	});

	it('returns the user and their familyId', () => {
		expect(getUser(event('/', alice))).toEqual({ user: alice, familyId: 7 });
	});

	it('fails loudly when the user has no familyId', () => {
		expect(() => getUser(event('/', { ...alice, familyId: null }))).toThrow(/no familyId/);
	});
});

describe('requireUser', () => {
	it('redirects to a bare /login, remembering the path and query', () => {
		const e = event('/recipes?tag=soup&q=a b');
		try {
			requireUser(e);
			expect.unreachable();
		} catch (err) {
			expect(isRedirect(err)).toBe(true);
			const { status, location } = err as { status: number; location: string };
			expect(status).toBe(303);
			expect(location).toBe('/login');
			expect(e.cookies.set).toHaveBeenCalledWith(
				'yumbry-return-to',
				'/recipes?tag=soup&q=a%20b',
				expect.anything()
			);
		}
	});

	it('remembers nothing for a form action', () => {
		const e = event('/settings', undefined, 'POST');
		expect(() => requireUser(e)).toThrow();
		expect(e.cookies.set).not.toHaveBeenCalled();
	});

	it('returns the signed-in user', () => {
		expect(requireUser(event('/', alice))).toEqual({ user: alice, familyId: 7 });
	});
});

describe('requireRecipe', () => {
	it("returns the id of a recipe the user's family owns", async () => {
		belongs.mockResolvedValue(true);
		await expect(requireRecipe(event('/recipes/12', alice), '12')).resolves.toEqual({
			user: alice,
			familyId: 7,
			recipeId: 12
		});
		expect(belongs).toHaveBeenCalledWith(12, 7);
	});

	it("404s for another family's recipe", async () => {
		belongs.mockResolvedValue(false);
		const err = await rejection(requireRecipe(event('/recipes/12', alice), '12'));
		expect(isHttpError(err, 404)).toBe(true);
		expect((err as { body: unknown }).body).toMatchObject({ message: 'Recipe not found.' });
	});

	it('404s for a malformed id without querying', async () => {
		const err = await rejection(requireRecipe(event('/recipes/abc', alice), '../1'));
		expect(isHttpError(err, 404)).toBe(true);
		expect(belongs).not.toHaveBeenCalled();
	});

	it('redirects a signed-out visitor before looking at the id', async () => {
		const err = await rejection(requireRecipe(event('/recipes/12'), '12'));
		expect(isRedirect(err)).toBe(true);
		expect(belongs).not.toHaveBeenCalled();
	});
});
