import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { families, recipes, tags, users } from '#lib/server/db/schema.ts';
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

const uploadsDir = vi.hoisted(() => ({ path: '' }));
vi.mock('$app/env/private', () => ({
	get UPLOADS_DIR() {
		return uploadsDir.path;
	}
}));

const { cleanUpFamilyAfterDelete } = await import('#lib/server/services/account-deletion.ts');

/** What better-auth does between the two hooks: the user row goes, the hook gets the old user. */
async function deleteUser(id: string, familyId: number): Promise<void> {
	await testDb().delete(users).where(eq(users.id, id));
	await cleanUpFamilyAfterDelete({ id, familyId } as { id: string });
}

function photoDir(recipeId: number): string {
	const dir = path.join(uploadsDir.path, 'recipes', String(recipeId));
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, 'photo.webp'), 'x');
	return dir;
}

async function familyExists(id: number): Promise<boolean> {
	const rows = await testDb().select().from(families).where(eq(families.id, id));
	return rows.length > 0;
}

describeDb('account deletion clean-up', () => {
	beforeAll(async () => {
		uploadsDir.path = mkdtempSync(path.join(tmpdir(), 'yumbry-uploads-'));
		await resetTestDatabase();
	});

	afterAll(async () => {
		await closeTestDatabase();
		rmSync(uploadsDir.path, { recursive: true, force: true });
	});

	it("deletes a sole member's family, its recipes, tags and photos", async () => {
		const family = await insertFamily();
		const user = await insertUser(family);
		const recipeId = await insertRecipe(family, { title: 'Doomed Dumplings', tags: ['dim sum'] });
		const dir = photoDir(recipeId);

		await deleteUser(user, family);

		expect(await familyExists(family)).toBe(false);
		expect(await testDb().select().from(recipes).where(eq(recipes.id, recipeId))).toEqual([]);
		expect(await testDb().select().from(tags).where(eq(tags.familyId, family))).toEqual([]);
		expect(existsSync(dir)).toBe(false);
	});

	it('leaves the family and its recipes to the members who remain', async () => {
		const family = await insertFamily();
		const leaving = await insertUser(family);
		await insertUser(family);
		const recipeId = await insertRecipe(family, { title: 'Survivor Soup' });
		await testDb().update(recipes).set({ authorId: leaving }).where(eq(recipes.id, recipeId));
		const dir = photoDir(recipeId);

		await deleteUser(leaving, family);

		expect(await familyExists(family)).toBe(true);
		const [recipe] = await testDb().select().from(recipes).where(eq(recipes.id, recipeId));
		expect(recipe.authorId).toBeNull();
		expect(existsSync(dir)).toBe(true);
	});

	it('does nothing without a familyId', async () => {
		await expect(cleanUpFamilyAfterDelete({ id: 'ghost' })).resolves.toBeUndefined();
	});
});
