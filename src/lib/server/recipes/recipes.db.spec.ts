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

const { getRecipe, listRecipes } = await import('#lib/server/recipes/recipes.ts');
const { listCategories, listTags } = await import('#lib/server/recipes/tags-categories.ts');

describeDb('recipe read services', () => {
	let family: number;
	let otherFamily: number;
	let bread: number;
	let chili: number;
	let cake: number;
	let secret: number;

	const titles = (list: { title: string }[]) => list.map((r) => r.title);

	beforeAll(async () => {
		await resetTestDatabase();
		family = await insertFamily();
		otherFamily = await insertFamily();

		bread = await insertRecipe(family, {
			title: 'Banana Bread',
			description: 'Moist loaf with 100% banana',
			category: 'baking',
			tags: ['sweet'],
			createdAt: new Date('2026-01-01T00:00:00Z')
		});
		chili = await insertRecipe(family, {
			title: 'Chili Con Carne',
			category: 'dinner',
			tags: ['spicy'],
			createdAt: new Date('2026-01-02T00:00:00Z')
		});
		cake = await insertRecipe(family, {
			title: 'Chocolate Chili Cake',
			servings: 4,
			calories: 420,
			category: 'baking',
			tags: ['sweet', 'spicy'],
			ingredients: [
				{ raw: '200 g flour', amount: 200, unit: 'g', name: 'flour' },
				{ raw: '2 eggs', amount: 2, name: 'eggs' },
				{ raw: 'salt to taste' }
			],
			instructions: ['Mix the batter.', 'Bake.'],
			createdAt: new Date('2026-01-03T00:00:00Z')
		});
		secret = await insertRecipe(otherFamily, {
			title: 'Secret Chili',
			category: 'secretcategory',
			tags: ['secrettag']
		});
	});

	afterAll(closeTestDatabase);

	it('lists only the family’s recipes, newest first', async () => {
		expect(titles(await listRecipes(family))).toEqual([
			'Chocolate Chili Cake',
			'Chili Con Carne',
			'Banana Bread'
		]);
		expect(titles(await listRecipes(otherFamily))).toEqual(['Secret Chili']);
	});

	it('searches title and description case-insensitively', async () => {
		expect(titles(await listRecipes(family, { search: 'CHILI' }))).toEqual([
			'Chocolate Chili Cake',
			'Chili Con Carne'
		]);
		expect(titles(await listRecipes(family, { search: 'moist' }))).toEqual(['Banana Bread']);
	});

	it('matches LIKE wildcards literally', async () => {
		expect(titles(await listRecipes(family, { search: '100%' }))).toEqual(['Banana Bread']);
		expect(await listRecipes(family, { search: '%' })).toHaveLength(1);
		expect(await listRecipes(family, { search: '_' })).toEqual([]);
	});

	it('filters by exact tag and category name, and combines filters', async () => {
		expect(titles(await listRecipes(family, { tag: 'spicy' }))).toEqual([
			'Chocolate Chili Cake',
			'Chili Con Carne'
		]);
		expect(titles(await listRecipes(family, { category: 'baking' }))).toEqual([
			'Chocolate Chili Cake',
			'Banana Bread'
		]);
		expect(titles(await listRecipes(family, { category: 'baking', tag: 'spicy' }))).toEqual([
			'Chocolate Chili Cake'
		]);
		expect(
			await listRecipes(family, { category: 'baking', tag: 'spicy', search: 'banana' })
		).toEqual([]);
		expect(await listRecipes(family, { tag: 'Spicy' })).toEqual([]);
	});

	it('never matches another family’s tag or category', async () => {
		expect(await listRecipes(family, { tag: 'secrettag' })).toEqual([]);
		expect(await listRecipes(family, { category: 'secretcategory' })).toEqual([]);
	});

	it('ignores empty filters', async () => {
		expect(await listRecipes(family, { search: '', tag: '', category: '' })).toHaveLength(3);
	});

	it('returns tags sorted by name and the category', async () => {
		const [latest] = await listRecipes(family);
		expect(latest.tags.map((t) => t.name)).toEqual(['spicy', 'sweet']);
		expect(latest.category?.name).toBe('baking');
	});

	it('gets a recipe with ordered ingredients and steps, and tidy decimals', async () => {
		const recipe = await getRecipe(cake, family);
		expect(recipe).toMatchObject({
			id: cake,
			title: 'Chocolate Chili Cake',
			servings: '4',
			calories: '420',
			fat_content: null,
			category: { name: 'baking' }
		});
		expect(recipe?.ingredients.map((i) => [i.raw_text, i.amount, i.is_scalable])).toEqual([
			['200 g flour', '200', true],
			['2 eggs', '2', true],
			['salt to taste', null, false]
		]);
		expect(recipe?.instructions.map((s) => [s.step_number, s.text])).toEqual([
			[1, 'Mix the batter.'],
			[2, 'Bake.']
		]);
	});

	it('gets nothing for another family’s recipe or a missing id', async () => {
		expect(await getRecipe(secret, family)).toBeNull();
		expect(await getRecipe(bread, otherFamily)).toBeNull();
		expect(await getRecipe(2_000_000_000, family)).toBeNull();
		expect(await getRecipe(chili, family)).not.toBeNull();
	});

	it('lists only the family’s tags and categories, by name', async () => {
		expect((await listTags(family)).map((t) => t.name)).toEqual(['spicy', 'sweet']);
		expect((await listCategories(family)).map((c) => c.name)).toEqual(['baking', 'dinner']);
		expect(await listTags(otherFamily)).toEqual([{ id: expect.any(Number), name: 'secrettag' }]);
		expect(await listCategories(otherFamily)).toEqual([
			{ id: expect.any(Number), name: 'secretcategory' }
		]);
	});
});
