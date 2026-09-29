import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { absoluteUploadPath, UPLOADS_DIR } from '../src/middleware/upload.js';
import { registerTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

type TestAgent = Awaited<ReturnType<typeof registerTestUser>>['agent'];

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
describe.skipIf(!TEST_DATABASE_URL)('recipe share links API', () => {
  let app: Express;
  let pool: pg.Pool;
  let owner: TestAgent;
  let other: TestAgent;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    await resetTestDatabase(TEST_DATABASE_URL as string);
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    ({ app } = await import('../src/app.js'));
    ({ agent: owner } = await registerTestUser(app));
    ({ agent: other } = await registerTestUser(app));

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags, categories RESTART IDENTITY CASCADE'
    );
  });

  async function createRecipe(agent: TestAgent = owner) {
    const res = await agent.post('/api/recipes').send({
      title: 'Shared Soup',
      servings: 4,
      calories: 250,
      ingredients: ['2 cups broth', 'salt to taste'],
      instructions: [{ step_number: 1, text: 'Simmer.' }],
      tags: ['soup', 'dinner'],
      category: 'Main course',
    });
    expect(res.status).toBe(201);
    return res.body as { id: number };
  }

  async function attachPhoto(recipeId: number) {
    const res = await owner
      .post(`/api/recipes/${recipeId}/photo`)
      .attach('photo', Buffer.from('fake-image-bytes'), {
        filename: 'photo.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(200);
    return res.body.image_path as string;
  }

  async function share(recipeId: number): Promise<string> {
    const res = await owner.post(`/api/recipes/${recipeId}/share`);
    expect(res.status).toBe(200);
    return res.body.share_token as string;
  }

  describe('owner endpoints', () => {
    it('creates a token once and returns the same one on repeat calls', async () => {
      const recipe = await createRecipe();
      const first = await share(recipe.id);
      const second = await share(recipe.id);

      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(second).toBe(first);

      const detail = await owner.get(`/api/recipes/${recipe.id}`);
      expect(detail.body.share_token).toBe(first);
    });

    it('does not let another family share or unshare the recipe', async () => {
      const recipe = await createRecipe();

      expect((await other.post(`/api/recipes/${recipe.id}/share`)).status).toBe(404);
      expect((await other.delete(`/api/recipes/${recipe.id}/share`)).status).toBe(404);
    });

    it('requires authentication', async () => {
      const recipe = await createRecipe();
      expect((await request(app).post(`/api/recipes/${recipe.id}/share`)).status).toBe(401);
    });
  });

  describe('public view', () => {
    it('serves the recipe anonymously without its id or token', async () => {
      const recipe = await createRecipe();
      const token = await share(recipe.id);

      const res = await request(app).get(`/api/shared/${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'Shared Soup', servings: '4', own_recipe_id: null });
      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('share_token');
      expect(res.body.ingredients).toHaveLength(2);
      expect(res.body.instructions).toHaveLength(1);
    });

    it('tells the owning family the recipe is already theirs', async () => {
      const recipe = await createRecipe();
      const token = await share(recipe.id);

      expect((await owner.get(`/api/shared/${token}`)).body.own_recipe_id).toBe(recipe.id);
      expect((await other.get(`/api/shared/${token}`)).body.own_recipe_id).toBeNull();
    });

    it('serves a local photo through the share URL', async () => {
      const recipe = await createRecipe();
      await attachPhoto(recipe.id);
      const token = await share(recipe.id);

      const view = await request(app).get(`/api/shared/${token}`);
      expect(view.body.image_path).toBe(`/api/shared/${token}/photo`);

      const photo = await request(app).get(`/api/shared/${token}/photo`).responseType('blob');
      expect(photo.status).toBe(200);
      expect(photo.headers['content-type']).toBe('image/png');
      expect(photo.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(photo.body).toString()).toBe('fake-image-bytes');
    });

    it('404s the photo endpoint when the recipe has no local photo', async () => {
      const recipe = await createRecipe();
      const token = await share(recipe.id);
      expect((await request(app).get(`/api/shared/${token}/photo`)).status).toBe(404);
    });

    it('404s unknown and malformed tokens', async () => {
      expect((await request(app).get(`/api/shared/${'a'.repeat(64)}`)).status).toBe(404);
      expect((await request(app).get('/api/shared/not-a-token')).status).toBe(404);
    });

    it('stops working once sharing is stopped, and a new share mints a new token', async () => {
      const recipe = await createRecipe();
      await attachPhoto(recipe.id);
      const token = await share(recipe.id);

      expect((await owner.delete(`/api/recipes/${recipe.id}/share`)).status).toBe(204);
      expect((await request(app).get(`/api/shared/${token}`)).status).toBe(404);
      expect((await request(app).get(`/api/shared/${token}/photo`)).status).toBe(404);

      const detail = await owner.get(`/api/recipes/${recipe.id}`);
      expect(detail.body.share_token).toBeNull();

      const next = await share(recipe.id);
      expect(next).not.toBe(token);
    });
  });

  describe('import', () => {
    it('requires authentication', async () => {
      const recipe = await createRecipe();
      const token = await share(recipe.id);
      expect((await request(app).post(`/api/shared/${token}/import`)).status).toBe(401);
    });

    it('404s a revoked token', async () => {
      const recipe = await createRecipe();
      const token = await share(recipe.id);
      await owner.delete(`/api/recipes/${recipe.id}/share`);
      expect((await other.post(`/api/shared/${token}/import`)).status).toBe(404);
    });

    it("copies the recipe, tags, category and photo into the importer's family", async () => {
      const recipe = await createRecipe();
      const originalPhoto = await attachPhoto(recipe.id);
      const token = await share(recipe.id);

      const res = await other.post(`/api/shared/${token}/import`);

      expect(res.status).toBe(201);
      const copy = res.body;
      expect(copy.id).not.toBe(recipe.id);
      expect(copy).toMatchObject({
        title: 'Shared Soup',
        servings: '4',
        calories: '250',
        share_token: null,
      });
      expect(copy.ingredients.map((i: { raw_text: string }) => i.raw_text)).toEqual([
        '2 cups broth',
        'salt to taste',
      ]);
      expect(copy.instructions.map((i: { text: string }) => i.text)).toEqual(['Simmer.']);
      expect(copy.tags.map((t: { name: string }) => t.name)).toEqual(['dinner', 'soup']);
      expect(copy.category).toMatchObject({ name: 'main course' });

      // Its own file, under its own recipe directory.
      expect(copy.image_path).not.toBe(originalPhoto);
      expect(copy.image_path).toMatch(new RegExp(`^/uploads/recipes/${copy.id}/`));
      expect(fs.existsSync(absoluteUploadPath(copy.image_path) as string)).toBe(true);

      // It shows up in the importer's library and not in the owner's.
      const otherList = await other.get('/api/recipes');
      expect(otherList.body.map((r: { id: number }) => r.id)).toEqual([copy.id]);
      const ownerList = await owner.get('/api/recipes');
      expect(ownerList.body.map((r: { id: number }) => r.id)).toEqual([recipe.id]);

      // The copy is independent: deleting the original leaves it and its photo intact.
      expect((await owner.delete(`/api/recipes/${recipe.id}`)).status).toBe(204);
      const after = await other.get(`/api/recipes/${copy.id}`);
      expect(after.status).toBe(200);
      expect(fs.existsSync(absoluteUploadPath(copy.image_path) as string)).toBe(true);

      await other.delete(`/api/recipes/${copy.id}`);
    });

    it('still imports when the source photo file is missing', async () => {
      const recipe = await createRecipe();
      const photo = await attachPhoto(recipe.id);
      fs.rmSync(absoluteUploadPath(photo) as string);
      const token = await share(recipe.id);

      const res = await other.post(`/api/shared/${token}/import`);

      expect(res.status).toBe(201);
      expect(res.body.image_path).toBeNull();

      await owner.delete(`/api/recipes/${recipe.id}`);
      await other.delete(`/api/recipes/${res.body.id}`);
    });
  });
});
