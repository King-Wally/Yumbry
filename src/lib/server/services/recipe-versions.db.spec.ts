import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecipeBody } from '#lib/server/recipe-schema.ts';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
	insertUser,
	resetTestDatabase
} from '#lib/server/testing/db.ts';
import type { RecipeSnapshot } from '#lib/shared/recipe-snapshot.ts';

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/testing/db.ts');
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
	await import('#lib/server/services/recipes.ts');
const { getVersion, listVersions, revertToVersion, snapshotToRecipeBody } =
	await import('#lib/server/services/recipe-versions.ts');

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

const SNAPSHOT: RecipeSnapshot = {
	title: 'Tomato Soup',
	description: null,
	prep_time_minutes: 10,
	cook_time_minutes: null,
	total_time_minutes: null,
	servings: '4',
	calories: '210.5',
	fat_content: null,
	carbohydrate_content: '0',
	protein_content: null,
	category: 'soup',
	tags: ['vegan'],
	ingredients: ['500 g tomatoes'],
	instructions: [{ step_number: 1, text: 'Simmer.' }]
};

describe('snapshotToRecipeBody', () => {
	it('turns decimal strings back into numbers and keeps missing nutrition missing', () => {
		expect(snapshotToRecipeBody(SNAPSHOT)).toEqual({
			title: 'Tomato Soup',
			description: null,
			prep_time_minutes: 10,
			cook_time_minutes: null,
			total_time_minutes: null,
			servings: 4,
			calories: 210.5,
			fat_content: null,
			carbohydrate_content: 0,
			protein_content: null,
			category: 'soup',
			tags: ['vegan'],
			ingredients: ['500 g tomatoes'],
			instructions: [{ step_number: 1, text: 'Simmer.' }]
		});
	});

	it('never carries a photo', () => {
		expect(snapshotToRecipeBody(SNAPSHOT)).not.toHaveProperty('image_path');
	});
});

describeDb('recipe version services', () => {
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

	it('lists nothing for a recipe that was never edited', async () => {
		const id = await createRecipe(body(), cook);
		expect(await listVersions(id, family)).toEqual([]);
	});

	it('lists versions newest first, each holding the state its edit replaced', async () => {
		const id = await createRecipe(body({ title: 'First' }), cook);
		await updateRecipe(id, body({ title: 'Second' }), family);
		await updateRecipe(id, body({ title: 'Third' }), family);

		const versions = await listVersions(id, family);
		expect(versions).toHaveLength(2);
		const titles = await Promise.all(
			versions.map(async (v) => (await getVersion(id, v.id, family))?.snapshot.title)
		);
		expect(titles).toEqual(['Second', 'First']);
		expect(versions[0].saved_at >= versions[1].saved_at).toBe(true);
	});

	it('keeps versions per recipe', async () => {
		const a = await createRecipe(body({ title: 'A' }), cook);
		const b = await createRecipe(body({ title: 'B' }), cook);
		await updateRecipe(a, body({ title: 'A2' }), family);

		const [version] = await listVersions(a, family);
		expect(await listVersions(b, family)).toEqual([]);
		expect(await getVersion(b, version.id, family)).toBeNull();
	});

	it('reverts to a version and snapshots the state it replaces', async () => {
		const id = await createRecipe(
			body({
				title: 'Tomato Soup',
				servings: 4,
				calories: 210.5,
				category: 'Soup',
				tags: ['Vegan'],
				ingredients: ['500 g tomatoes'],
				instructions: [{ step_number: 1, text: 'Simmer.' }]
			}),
			cook
		);
		await setRecipePhoto(id, `/uploads/recipes/${id}/photo.webp`, family);
		await updateRecipe(
			id,
			body({ title: 'Roasted Tomato Soup', ingredients: ['1 kg tomatoes'], tags: ['quick'] }),
			family
		);
		const [original] = await listVersions(id, family);

		expect(await revertToVersion(id, original.id, family)).toBe(true);

		const recipe = await getRecipe(id, family);
		expect(recipe).toMatchObject({
			title: 'Tomato Soup',
			servings: '4',
			calories: '210.5',
			category: { name: 'soup' },
			tags: [{ name: 'vegan' }],
			image_path: `/uploads/recipes/${id}/photo.webp`
		});
		expect(recipe?.ingredients.map((i) => i.raw_text)).toEqual(['500 g tomatoes']);
		expect(recipe?.ingredients[0]).toMatchObject({ unit: 'g', name: 'tomatoes' });
		expect(recipe?.instructions.map((i) => i.text)).toEqual(['Simmer.']);

		const versions = await listVersions(id, family);
		expect(versions).toHaveLength(2);
		expect((await getVersion(id, versions[0].id, family))?.snapshot.title).toBe(
			'Roasted Tomato Soup'
		);
	});

	it('refuses an unknown version', async () => {
		const id = await createRecipe(body(), cook);
		expect(await revertToVersion(id, 999_999, family)).toBe(false);
		expect(await listVersions(id, family)).toEqual([]);
	});

	it("hides another family's versions", async () => {
		const id = await createRecipe(body(), cook);
		await updateRecipe(id, body({ title: 'Edited' }), family);
		const [version] = await listVersions(id, family);

		expect(await listVersions(id, otherFamily)).toEqual([]);
		expect(await getVersion(id, version.id, otherFamily)).toBeNull();
		expect(await revertToVersion(id, version.id, otherFamily)).toBe(false);
		expect((await getRecipe(id, family))?.title).toBe('Edited');
	});

	it('deletes versions along with the recipe', async () => {
		const id = await createRecipe(body(), cook);
		await updateRecipe(id, body({ title: 'Edited' }), family);
		const [version] = await listVersions(id, family);

		await deleteRecipe(id, family);
		expect(await getVersion(id, version.id, family)).toBeNull();
	});
});
