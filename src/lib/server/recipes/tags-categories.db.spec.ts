import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
	insertRecipe,
	resetTestDatabase
} from '#lib/server/db/testing.ts';

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/db/testing.ts');
	// A getter, so a run without TEST_DATABASE_URL can still load the file and skip it.
	return {
		get db() {
			return testDb();
		}
	};
});

const { listVocabulary } = await import('#lib/server/recipes/tags-categories.ts');

describeDb('listVocabulary', () => {
	let family: number;
	let emptyFamily: number;

	beforeAll(async () => {
		await resetTestDatabase();
		family = await insertFamily();
		emptyFamily = await insertFamily();
		const otherFamily = await insertFamily();

		await insertRecipe(family, { title: 'Dal', category: 'main', tags: ['vegan', 'indian'] });
		await insertRecipe(family, { title: 'Chana', category: 'main', tags: ['vegan', 'curry'] });
		await insertRecipe(family, { title: 'Soup', category: 'soup', tags: ['vegan'] });
		await insertRecipe(otherFamily, { title: 'Steak', category: 'grill', tags: ['beef'] });
	});

	afterAll(closeTestDatabase);

	it('lists the most-used names first, then by name', async () => {
		expect(await listVocabulary(family)).toEqual({
			tags: ['vegan', 'curry', 'indian'],
			categories: ['main', 'soup']
		});
	});

	it('stops at the limits', async () => {
		expect(await listVocabulary(family, { tags: 2, categories: 1 })).toEqual({
			tags: ['vegan', 'curry'],
			categories: ['main']
		});
	});

	it("never lists another family's names", async () => {
		expect(await listVocabulary(emptyFamily)).toEqual({ tags: [], categories: [] });
	});
});
