import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { recipes, recipeVersions } from '#lib/server/db/schema.ts';
import type { RecipeBody } from '#lib/server/recipes/body-schema.ts';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
	insertUser,
	resetTestDatabase,
	testDb
} from '#lib/server/db/testing.ts';
import type { RecipeSnapshot } from '#lib/shared/recipe/snapshot.ts';

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/db/testing.ts');
	return {
		get db() {
			return testDb();
		}
	};
});

const uploadsDir = vi.hoisted(() => ({ path: '' }));
vi.mock('$app/env/private', () => ({
	get UPLOADS_DIR() {
		return uploadsDir.path;
	}
}));

const { createRecipe, deleteRecipe, getRecipe, setRecipePhoto, updateRecipe } =
	await import('#lib/server/recipes/recipes.ts');
const { listCategories, listTags } = await import('#lib/server/recipes/tags-categories.ts');
const { absoluteUploadPath, saveRecipePhoto } = await import('#lib/server/uploads/storage.ts');

function body(overrides: Partial<RecipeBody> = {}): RecipeBody {
	return {
		title: 'Tomato Soup',
		servings: 2,
		ingredients: [],
		instructions: [],
		tags: [],
		category: null,
		...overrides
	};
}

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

async function versionsOf(recipeId: number) {
	return testDb()
		.select()
		.from(recipeVersions)
		.where(eq(recipeVersions.recipeId, recipeId))
		.orderBy(recipeVersions.id);
}

describeDb('recipe write services', () => {
	let family: number;
	let otherFamily: number;
	let cook: { familyId: number; authorId: string };

	beforeAll(async () => {
		uploadsDir.path = mkdtempSync(path.join(tmpdir(), 'yumbry-uploads-'));
		await resetTestDatabase();
		family = await insertFamily();
		otherFamily = await insertFamily();
		cook = { familyId: family, authorId: await insertUser(family) };
	});

	afterAll(async () => {
		await closeTestDatabase();
		rmSync(uploadsDir.path, { recursive: true, force: true });
	});

	it('creates a recipe with every field, parsing the ingredient lines', async () => {
		const id = await createRecipe(
			body({
				title: 'Pancakes',
				description: 'Fluffy.',
				prep_time_minutes: 10,
				cook_time_minutes: 20,
				total_time_minutes: 30,
				servings: 6,
				calories: 420,
				fat_content: 12.5,
				ingredients: ['200 g flour', 'salt to taste'],
				instructions: [
					{ step_number: 1, text: 'Whisk.' },
					{ step_number: 2, text: 'Fry.' }
				],
				tags: ['Sweet', ' sweet ', 'Brunch', ''],
				category: ' Breakfast '
			}),
			cook
		);

		const recipe = await getRecipe(id, family);
		expect(recipe).toMatchObject({
			title: 'Pancakes',
			description: 'Fluffy.',
			prep_time_minutes: 10,
			cook_time_minutes: 20,
			total_time_minutes: 30,
			servings: '6',
			calories: '420',
			fat_content: '12.5',
			carbohydrate_content: null,
			category: { name: 'breakfast' },
			image_path: null
		});
		expect(names(recipe!.tags)).toEqual(['brunch', 'sweet']);
		expect(recipe!.ingredients.map((i) => [i.raw_text, i.amount, i.unit, i.name])).toEqual([
			['200 g flour', '200', 'g', 'flour'],
			['salt to taste', null, null, 'salt to taste']
		]);
		expect(recipe!.ingredients.map((i) => i.is_scalable)).toEqual([true, false]);
		expect(recipe!.instructions.map((i) => i.text)).toEqual(['Whisk.', 'Fry.']);
		expect(await versionsOf(id)).toEqual([]);
	});

	it('keeps only an external http(s) image_path on create', async () => {
		const create = (image_path: string) => createRecipe(body({ image_path }), cook);

		const remote = await getRecipe(await create('https://example.com/dish.jpg'), family);
		expect(remote!.image_path).toBe('https://example.com/dish.jpg');

		for (const foreign of ['/uploads/recipes/1/photo.webp', 'javascript:alert(1)', 'dish.jpg']) {
			expect((await getRecipe(await create(foreign), family))!.image_path).toBeNull();
		}
	});

	it('reuses a family’s tags and categories by name and never another family’s', async () => {
		const first = await createRecipe(body({ tags: ['Spicy'], category: 'Dinner' }), cook);
		const second = await createRecipe(body({ tags: ['spicy'], category: 'dinner' }), cook);
		await createRecipe(body({ tags: ['spicy'], category: 'dinner' }), {
			familyId: otherFamily,
			authorId: await insertUser(otherFamily)
		});

		const a = await getRecipe(first, family);
		const b = await getRecipe(second, family);
		expect(a!.tags[0].id).toBe(b!.tags[0].id);
		expect(a!.category!.id).toBe(b!.category!.id);
		expect(names(await listTags(otherFamily))).toEqual(['spicy']);
		expect((await listTags(otherFamily))[0].id).not.toBe(a!.tags[0].id);
	});

	it('snapshots the previous state before an edit, then replaces the content', async () => {
		const id = await createRecipe(
			body({
				servings: 2,
				category: 'Lunch',
				tags: ['soup'],
				image_path: 'https://example.com/soup.jpg',
				ingredients: ['500 g tomatoes'],
				instructions: [{ step_number: 1, text: 'Simmer.' }]
			}),
			cook
		);
		const before = await getRecipe(id, family);

		const saved = await updateRecipe(
			id,
			body({
				title: 'Roasted Tomato Soup',
				servings: 4,
				category: 'Dinner',
				tags: ['smoky'],
				image_path: null,
				ingredients: ['1 kg tomatoes', '1 onion'],
				instructions: [
					{ step_number: 1, text: 'Roast.' },
					{ step_number: 2, text: 'Blend.' }
				]
			}),
			family
		);
		expect(saved).toBe(true);

		const [version] = await versionsOf(id);
		expect(version.savedAt).toEqual(before!.updated_at);
		expect(version.snapshot).toEqual({
			title: 'Tomato Soup',
			description: null,
			prep_time_minutes: null,
			cook_time_minutes: null,
			total_time_minutes: null,
			servings: '2',
			calories: null,
			fat_content: null,
			carbohydrate_content: null,
			protein_content: null,
			category: 'lunch',
			tags: ['soup'],
			ingredients: ['500 g tomatoes'],
			instructions: [{ step_number: 1, text: 'Simmer.' }]
		} satisfies RecipeSnapshot);

		const after = await getRecipe(id, family);
		expect(after).toMatchObject({
			title: 'Roasted Tomato Soup',
			servings: '4',
			category: { name: 'dinner' },
			// An edit never touches the photo.
			image_path: 'https://example.com/soup.jpg'
		});
		expect(names(after!.tags)).toEqual(['smoky']);
		expect(after!.ingredients.map((i) => i.raw_text)).toEqual(['1 kg tomatoes', '1 onion']);
		expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
	});

	it('writes a version on every save, and clears omitted nullable fields', async () => {
		const id = await createRecipe(body({ calories: 300, description: 'Rich.' }), cook);
		await updateRecipe(id, body({ calories: 300, description: 'Rich.' }), family);
		await updateRecipe(id, body(), family);

		expect(await versionsOf(id)).toHaveLength(2);
		const recipe = await getRecipe(id, family);
		expect(recipe!.calories).toBeNull();
		expect(recipe!.description).toBeNull();
	});

	it('deletes tags and categories once their last use is gone', async () => {
		const id = await createRecipe(body({ tags: ['fleeting'], category: 'Ephemeral' }), cook);
		expect(names(await listTags(family))).toContain('fleeting');

		await updateRecipe(id, body({ tags: ['lasting'], category: null }), family);
		expect(names(await listTags(family))).not.toContain('fleeting');
		expect(names(await listCategories(family))).not.toContain('ephemeral');

		await deleteRecipe(id, family);
		expect(names(await listTags(family))).not.toContain('lasting');
	});

	it('refuses to edit, delete or set a photo on another family’s recipe', async () => {
		const id = await createRecipe(body({ title: 'Secret Stew' }), cook);

		expect(await updateRecipe(id, body({ title: 'Stolen' }), otherFamily)).toBe(false);
		expect(await deleteRecipe(id, otherFamily)).toBe(false);
		expect(await setRecipePhoto(id, '/uploads/recipes/1/x.webp', otherFamily)).toBe(false);

		const recipe = await getRecipe(id, family);
		expect(recipe).toMatchObject({ title: 'Secret Stew', image_path: null });
		expect(await versionsOf(id)).toEqual([]);
	});

	it('replaces a stored photo, removing the old file', async () => {
		const id = await createRecipe(body(), cook);
		const first = await saveRecipePhoto(id, new Uint8Array([1]));
		const second = await saveRecipePhoto(id, new Uint8Array([2]));

		expect(await setRecipePhoto(id, first, family)).toBe(true);
		expect(await setRecipePhoto(id, second, family)).toBe(true);

		expect((await getRecipe(id, family))!.image_path).toBe(second);
		expect(existsSync(absoluteUploadPath(first)!)).toBe(false);
		expect(existsSync(absoluteUploadPath(second)!)).toBe(true);
		expect(await versionsOf(id)).toEqual([]);
	});

	it('deletes the recipe with its versions and its uploads directory', async () => {
		const id = await createRecipe(body(), cook);
		await updateRecipe(id, body({ title: 'Edited' }), family);
		await setRecipePhoto(id, await saveRecipePhoto(id, new Uint8Array([1])), family);
		const dir = path.join(uploadsDir.path, 'recipes', String(id));
		expect(existsSync(dir)).toBe(true);

		expect(await deleteRecipe(id, family)).toBe(true);

		expect(await testDb().select().from(recipes).where(eq(recipes.id, id))).toEqual([]);
		expect(await versionsOf(id)).toEqual([]);
		expect(existsSync(dir)).toBe(false);
	});
});
