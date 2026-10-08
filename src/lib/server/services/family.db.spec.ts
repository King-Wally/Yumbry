import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { categories, families, recipes, recipeTags, tags, users } from '#lib/server/db/schema.ts';
import { FamilyError } from '#lib/server/family-error.ts';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
	insertRecipe,
	insertUser,
	resetTestDatabase,
	testDb
} from '#lib/server/testing/db.ts';

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/testing/db.ts');
	return {
		get db() {
			return testDb();
		}
	};
});

const { getFamily, joinFamily, leaveFamily } = await import('#lib/server/services/family.ts');

describeDb('getFamily', () => {
	beforeAll(resetTestDatabase);
	afterAll(closeTestDatabase);

	it('lists the members oldest account first, with the invite token', async () => {
		const family = await insertFamily();
		const newer = await insertUser(family);
		const older = await insertUser(family);
		await testDb()
			.update(users)
			.set({ createdAt: new Date('2020-01-01') })
			.where(eq(users.id, older));
		await insertUser(await insertFamily());

		const [{ inviteToken }] = await testDb()
			.select({ inviteToken: families.inviteToken })
			.from(families)
			.where(eq(families.id, family));
		const result = await getFamily(family);

		expect(result).toEqual({
			id: family,
			invite_token: inviteToken,
			members: [
				{ id: older, email: `${older}@example.test` },
				{ id: newer, email: `${newer}@example.test` }
			]
		});
	});

	it('returns null for a family that does not exist', async () => {
		expect(await getFamily(999_999)).toBeNull();
	});
});

async function inviteTokenOf(familyId: number): Promise<string> {
	const [{ inviteToken }] = await testDb()
		.select({ inviteToken: families.inviteToken })
		.from(families)
		.where(eq(families.id, familyId));
	return inviteToken;
}

async function familyIdOf(userId: string): Promise<number> {
	const [{ familyId }] = await testDb()
		.select({ familyId: users.familyId })
		.from(users)
		.where(eq(users.id, userId));
	return familyId;
}

async function familyExists(familyId: number): Promise<boolean> {
	const rows = await testDb().select().from(families).where(eq(families.id, familyId));
	return rows.length > 0;
}

async function recipeTitles(familyId: number): Promise<string[]> {
	const rows = await testDb()
		.select({ title: recipes.title })
		.from(recipes)
		.where(eq(recipes.familyId, familyId))
		.orderBy(asc(recipes.title));
	return rows.map((row) => row.title);
}

async function namesIn(table: typeof tags | typeof categories, familyId: number) {
	const rows = await testDb()
		.select({ id: table.id, name: table.name })
		.from(table)
		.where(eq(table.familyId, familyId))
		.orderBy(asc(table.name));
	return rows;
}

async function refusal(promise: Promise<unknown>): Promise<string> {
	const err = await promise.then(
		() => null,
		(e: unknown) => e
	);
	expect(err).toBeInstanceOf(FamilyError);
	return (err as FamilyError).kind;
}

describeDb('joinFamily', () => {
	beforeAll(resetTestDatabase);
	afterAll(closeTestDatabase);

	it("brings a lone joiner's collection along and deletes their old family", async () => {
		const target = await insertFamily();
		await insertUser(target);
		await insertRecipe(target, { title: 'Lasagne' });
		const mine = await insertFamily();
		const me = await insertUser(mine);
		await insertRecipe(mine, { title: 'Bread' });

		const result = await joinFamily(me, await inviteTokenOf(target));

		expect(result).toEqual({ familyId: target });
		expect(await familyIdOf(me)).toBe(target);
		expect(await recipeTitles(target)).toEqual(['Bread', 'Lasagne']);
		expect(await familyExists(mine)).toBe(false);
	});

	it('merges duplicate tags by name and keeps them on the moved recipe', async () => {
		const target = await insertFamily();
		await insertUser(target);
		await insertRecipe(target, { title: 'Theirs', tags: ['quick', 'vegan'] });
		const mine = await insertFamily();
		const me = await insertUser(mine);
		const recipe = await insertRecipe(mine, { title: 'Mine', tags: ['quick', 'spicy'] });
		const targetTags = await namesIn(tags, target);

		await joinFamily(me, await inviteTokenOf(target));

		const merged = await namesIn(tags, target);
		expect(merged.map((tag) => tag.name)).toEqual(['quick', 'spicy', 'vegan']);
		// The existing "quick" survives; only "spicy" is new.
		expect(merged.find((tag) => tag.name === 'quick')?.id).toBe(
			targetTags.find((tag) => tag.name === 'quick')?.id
		);
		const onRecipe = await testDb()
			.select({ name: tags.name })
			.from(recipeTags)
			.innerJoin(tags, eq(tags.id, recipeTags.tagId))
			.where(eq(recipeTags.recipeId, recipe))
			.orderBy(asc(tags.name));
		expect(onRecipe.map((tag) => tag.name)).toEqual(['quick', 'spicy']);
	});

	it('merges duplicate categories without orphaning any recipe', async () => {
		const target = await insertFamily();
		await insertUser(target);
		await insertRecipe(target, { title: 'Theirs', category: 'mains' });
		const mine = await insertFamily();
		const me = await insertUser(mine);
		const mainsRecipe = await insertRecipe(mine, { title: 'Mine', category: 'mains' });
		const breadRecipe = await insertRecipe(mine, { title: 'Loaf', category: 'breads' });

		await joinFamily(me, await inviteTokenOf(target));

		const merged = await namesIn(categories, target);
		expect(merged.map((category) => category.name)).toEqual(['breads', 'mains']);
		const categoryOf = async (recipeId: number) => {
			const [row] = await testDb()
				.select({ categoryId: recipes.categoryId })
				.from(recipes)
				.where(eq(recipes.id, recipeId));
			return row.categoryId;
		};
		expect(await categoryOf(mainsRecipe)).toBe(merged.find((c) => c.name === 'mains')?.id);
		expect(await categoryOf(breadRecipe)).toBe(merged.find((c) => c.name === 'breads')?.id);
	});

	it('rejects an unknown invite token and changes nothing', async () => {
		const mine = await insertFamily();
		const me = await insertUser(mine);

		expect(await refusal(joinFamily(me, 'not-a-real-token'))).toBe('invalid_invite');
		expect(await familyIdOf(me)).toBe(mine);
	});

	it('rejects joining the family you are already in', async () => {
		const mine = await insertFamily();
		const me = await insertUser(mine);
		await insertRecipe(mine, { title: 'Stays' });

		expect(await refusal(joinFamily(me, await inviteTokenOf(mine)))).toBe('already_member');
		expect(await familyIdOf(me)).toBe(mine);
		expect(await recipeTitles(mine)).toEqual(['Stays']);
	});

	it('does not drag a shared collection along when a member joins a third family', async () => {
		const shared = await insertFamily();
		const me = await insertUser(shared);
		const other = await insertUser(shared);
		await insertRecipe(shared, { title: 'Shared Soup', tags: ['soup'], category: 'starters' });
		const third = await insertFamily();
		await insertUser(third);

		await joinFamily(me, await inviteTokenOf(third));

		expect(await familyIdOf(me)).toBe(third);
		expect(await familyIdOf(other)).toBe(shared);
		expect(await recipeTitles(shared)).toEqual(['Shared Soup']);
		expect(await namesIn(tags, shared)).toHaveLength(1);
		expect(await namesIn(categories, shared)).toHaveLength(1);
		expect(await recipeTitles(third)).toEqual([]);
	});
});

describeDb('leaveFamily', () => {
	beforeAll(resetTestDatabase);
	afterAll(closeTestDatabase);

	it('starts the leaver over in an empty family and leaves the collection behind', async () => {
		const shared = await insertFamily();
		const me = await insertUser(shared);
		const other = await insertUser(shared);
		await insertRecipe(shared, { title: 'Stew', tags: ['hearty'], category: 'mains' });

		const { familyId } = await leaveFamily(me);

		expect(familyId).not.toBe(shared);
		expect(await familyIdOf(me)).toBe(familyId);
		expect(await familyIdOf(other)).toBe(shared);
		expect(await recipeTitles(familyId)).toEqual([]);
		expect(await recipeTitles(shared)).toEqual(['Stew']);
		expect(await namesIn(tags, shared)).toHaveLength(1);
		expect(await namesIn(categories, shared)).toHaveLength(1);
		expect(await getFamily(familyId)).toMatchObject({ members: [{ id: me }] });
	});

	it('refuses to let the last member leave, which would delete their recipes', async () => {
		const mine = await insertFamily();
		const me = await insertUser(mine);
		await insertRecipe(mine, { title: 'Mine' });

		expect(await refusal(leaveFamily(me))).toBe('nothing_to_leave');
		expect(await familyIdOf(me)).toBe(mine);
		expect(await recipeTitles(mine)).toEqual(['Mine']);
	});
});
