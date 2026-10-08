import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { recipes } from '#lib/server/db/schema.ts';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
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

const uploadsDir = vi.hoisted(() => ({ path: '' }));
vi.mock('$app/env/private', () => ({
	get UPLOADS_DIR() {
		return uploadsDir.path;
	}
}));

const { createRecipe, getRecipe, setRecipePhoto, updateRecipe } =
	await import('#lib/server/services/recipes.ts');
const {
	disableShare,
	enableShare,
	getSharedRecipe,
	importSharedRecipe,
	isShareToken,
	sharedPhotoFile
} = await import('#lib/server/services/recipe-share.ts');
const { listCategories, listTags } = await import('#lib/server/services/tags-categories.ts');
const { absoluteUploadPath, saveRecipePhoto } = await import('#lib/server/uploads.ts');

const PANCAKES = {
	title: 'Pancakes',
	description: 'Fluffy.',
	servings: 4,
	calories: 350,
	ingredients: ['200 g flour', 'salt to taste'],
	instructions: [{ step_number: 1, text: 'Whisk.' }],
	tags: ['sweet', 'brunch'],
	category: 'breakfast'
};

async function updatedAtOf(id: number): Promise<Date> {
	const [row] = await testDb()
		.select({ updatedAt: recipes.updatedAt })
		.from(recipes)
		.where(eq(recipes.id, id));
	return row.updatedAt;
}

describeDb('recipe share services', () => {
	let owner: { familyId: number; authorId: string };
	let visitor: { familyId: number; authorId: string };

	beforeAll(async () => {
		uploadsDir.path = mkdtempSync(path.join(tmpdir(), 'yumbry-uploads-'));
		await resetTestDatabase();
		const ownerFamily = await insertFamily();
		const visitorFamily = await insertFamily();
		owner = { familyId: ownerFamily, authorId: await insertUser(ownerFamily) };
		visitor = { familyId: visitorFamily, authorId: await insertUser(visitorFamily) };
	});

	afterAll(async () => {
		await closeTestDatabase();
		rmSync(uploadsDir.path, { recursive: true, force: true });
	});

	it('mints one token per recipe, idempotently, without touching updated_at', async () => {
		const id = await createRecipe(PANCAKES, owner);
		const before = await updatedAtOf(id);

		const token = await enableShare(id, owner.familyId);
		expect(token).not.toBeNull();
		expect(isShareToken(token!)).toBe(true);
		expect(await enableShare(id, owner.familyId)).toBe(token);
		expect((await getRecipe(id, owner.familyId))?.share_token).toBe(token);
		expect(await updatedAtOf(id)).toEqual(before);
	});

	it('refuses another family', async () => {
		const id = await createRecipe(PANCAKES, owner);
		expect(await enableShare(id, visitor.familyId)).toBeNull();
		const token = await enableShare(id, owner.familyId);
		expect(await disableShare(id, visitor.familyId)).toBe(false);
		expect((await getRecipe(id, owner.familyId))?.share_token).toBe(token);
	});

	it('stopping kills the link, and sharing again makes a new one', async () => {
		const id = await createRecipe(PANCAKES, owner);
		const first = (await enableShare(id, owner.familyId))!;
		const before = await updatedAtOf(id);

		expect(await disableShare(id, owner.familyId)).toBe(true);
		expect(await updatedAtOf(id)).toEqual(before);
		expect(await getSharedRecipe(first, undefined)).toBeNull();

		const second = await enableShare(id, owner.familyId);
		expect(second).not.toBe(first);
		expect(await getSharedRecipe(first, undefined)).toBeNull();
	});

	it('shows the recipe without its ids or token, and points the owner to their own', async () => {
		const id = await createRecipe(PANCAKES, owner);
		const token = (await enableShare(id, owner.familyId))!;

		const shared = await getSharedRecipe(token, undefined);
		expect(shared).toMatchObject({
			title: 'Pancakes',
			servings: '4',
			calories: '350',
			own_recipe_id: null,
			category: { name: 'breakfast' }
		});
		expect(shared).not.toHaveProperty('id');
		expect(shared).not.toHaveProperty('share_token');
		expect(shared).not.toHaveProperty('category_id');
		expect(shared?.ingredients.map((i) => i.raw_text)).toEqual(['200 g flour', 'salt to taste']);

		expect((await getSharedRecipe(token, visitor.familyId))?.own_recipe_id).toBeNull();
		expect((await getSharedRecipe(token, owner.familyId))?.own_recipe_id).toBe(id);
		expect(await getSharedRecipe('a'.repeat(64), undefined)).toBeNull();
	});

	it('serves a local photo through the share link, and passes a remote one through', async () => {
		const local = await createRecipe(PANCAKES, owner);
		await setRecipePhoto(local, await saveRecipePhoto(local, new Uint8Array([1])), owner.familyId);
		const localToken = (await enableShare(local, owner.familyId))!;
		expect((await getSharedRecipe(localToken, undefined))?.image_path).toBe(
			`/share/${localToken}/photo`
		);
		expect((await sharedPhotoFile(localToken))?.contentType).toBe('image/webp');

		const remote = await createRecipe(
			{ ...PANCAKES, image_path: 'https://example.com/pancakes.jpg' },
			owner
		);
		const remoteToken = (await enableShare(remote, owner.familyId))!;
		expect((await getSharedRecipe(remoteToken, undefined))?.image_path).toBe(
			'https://example.com/pancakes.jpg'
		);
		expect(await sharedPhotoFile(remoteToken)).toBeNull();

		await disableShare(local, owner.familyId);
		expect(await sharedPhotoFile(localToken)).toBeNull();
	});

	it('copies the recipe, its tags, category and photo into the importer’s family', async () => {
		const source = await createRecipe(PANCAKES, owner);
		const sourcePhoto = await saveRecipePhoto(source, new Uint8Array([4, 5, 6]));
		await setRecipePhoto(source, sourcePhoto, owner.familyId);
		const token = (await enableShare(source, owner.familyId))!;

		const id = await importSharedRecipe(token, visitor);
		expect(id).not.toBeNull();
		const copy = await getRecipe(id!, visitor.familyId);
		expect(copy).toMatchObject({
			title: 'Pancakes',
			description: 'Fluffy.',
			servings: '4',
			calories: '350',
			share_token: null,
			category: { name: 'breakfast' }
		});
		expect(copy?.tags.map((t) => t.name)).toEqual(['brunch', 'sweet']);
		expect(copy?.ingredients.map((i) => [i.raw_text, i.amount, i.unit, i.name])).toEqual([
			['200 g flour', '200', 'g', 'flour'],
			['salt to taste', null, null, 'salt to taste']
		]);
		expect(copy?.instructions.map((s) => s.text)).toEqual(['Whisk.']);
		expect((await listCategories(visitor.familyId)).map((c) => c.name)).toEqual(['breakfast']);
		expect((await listTags(visitor.familyId)).map((t) => t.name)).toEqual(['brunch', 'sweet']);

		// The photo is a copy in the new recipe's own directory.
		expect(copy?.image_path).toMatch(new RegExp(`^/uploads/recipes/${id}/[0-9a-f-]{36}\\.webp$`));
		expect(existsSync(absoluteUploadPath(copy!.image_path!)!)).toBe(true);
		expect(existsSync(absoluteUploadPath(sourcePhoto)!)).toBe(true);

		// Independent of the original.
		await updateRecipe(id!, { ...PANCAKES, title: 'Their Pancakes' }, visitor.familyId);
		expect((await getRecipe(source, owner.familyId))?.title).toBe('Pancakes');
	});

	it('still copies the recipe when its photo file is gone', async () => {
		const source = await createRecipe(PANCAKES, owner);
		const photo = await saveRecipePhoto(source, new Uint8Array([1]));
		await setRecipePhoto(source, photo, owner.familyId);
		rmSync(absoluteUploadPath(photo)!);
		const token = (await enableShare(source, owner.familyId))!;

		vi.spyOn(console, 'error').mockImplementationOnce(() => {});
		const id = await importSharedRecipe(token, visitor);
		expect((await getRecipe(id!, visitor.familyId))?.image_path).toBeNull();
	});

	it('imports nothing from an unknown link', async () => {
		expect(await importSharedRecipe('b'.repeat(64), visitor)).toBeNull();
	});
});
