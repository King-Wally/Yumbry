import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { registerTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// POST /import-url's controller wiring/validation/error-mapping is what's
// worth covering here (it never touches the DB) — mocked the same way
// ai.api.test.ts mocks chatWithAi, so these tests stay fast and hermetic.
const { scrapeRecipeFromUrl } = vi.hoisted(() => ({ scrapeRecipeFromUrl: vi.fn() }));

vi.mock('../src/services/url-recipe-import.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/services/url-recipe-import.service.js')>();
  return { ...actual, scrapeRecipeFromUrl };
});

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
describe.skipIf(!TEST_DATABASE_URL)('recipes API', () => {
  let app: Express;
  let pool: pg.Pool;
  let agent: Awaited<ReturnType<typeof registerTestUser>>['agent'];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    await resetTestDatabase(TEST_DATABASE_URL as string);
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    ({ app } = await import('../src/app.js'));
    ({ agent } = await registerTestUser(app));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags, categories RESTART IDENTITY CASCADE'
    );
  });

  it('creates and fetches a recipe', async () => {
    const createRes = await agent.post('/api/recipes').send({
      title: 'Test Soup',
      servings: 4,
      ingredients: [{ raw_text: '2 cups broth', amount: 2, unit: 'cups', name: 'broth' }],
      instructions: [{ step_number: 1, text: 'Simmer.' }],
      tags: ['soup', 'dinner'],
      category: 'Main course',
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.title).toBe('Test Soup');
    expect(createRes.body.ingredients).toHaveLength(1);
    expect(createRes.body.tags.map((t: { name: string }) => t.name).sort()).toEqual([
      'dinner',
      'soup',
    ]);
    expect(createRes.body.category).toMatchObject({ name: 'main course' });

    const getRes = await agent.get(`/api/recipes/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('Test Soup');
  });

  it('returns 404 for a missing recipe', async () => {
    const res = await agent.get('/api/recipes/999999');
    expect(res.status).toBe(404);
  });

  it('filters the recipe list by search text', async () => {
    await agent.post('/api/recipes').send({ title: 'Chocolate Cake', servings: 8 });
    await agent.post('/api/recipes').send({ title: 'Vegetable Soup', servings: 4 });

    const res = await agent.get('/api/recipes').query({ search: 'cake' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Chocolate Cake');
  });

  it('filters the recipe list by tag', async () => {
    await agent.post('/api/recipes').send({ title: 'Tacos', servings: 2, tags: ['mexican'] });
    await agent.post('/api/recipes').send({ title: 'Pasta', servings: 2, tags: ['italian'] });

    const res = await agent.get('/api/recipes').query({ tag: 'mexican' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Tacos');
  });

  it('filters the recipe list by category', async () => {
    await agent.post('/api/recipes').send({ title: 'Tacos', servings: 2, category: 'Main course' });
    await agent.post('/api/recipes').send({ title: 'Cookies', servings: 12, category: 'Dessert' });

    const res = await agent.get('/api/recipes').query({ category: 'main course' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Tacos');
  });

  it('updates a recipe', async () => {
    const created = await agent.post('/api/recipes').send({ title: 'Original', servings: 2 });

    const updated = await agent
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: 'Updated', servings: 3 });

    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Updated');
    expect(Number(updated.body.servings)).toBe(3);
  });

  it('deletes a recipe', async () => {
    const created = await agent.post('/api/recipes').send({ title: 'To Delete', servings: 1 });

    const del = await agent.delete(`/api/recipes/${created.body.id}`);
    expect(del.status).toBe(204);

    const getRes = await agent.get(`/api/recipes/${created.body.id}`);
    expect(getRes.status).toBe(404);
  });

  it('imports a recipe from JSON-LD text', async () => {
    const jsonLd = JSON.stringify({
      '@type': 'Recipe',
      name: 'Imported Recipe',
      recipeYield: '2',
      recipeCategory: 'Hoofdgerecht',
      keywords: 'hoofdgerecht, vlees, comfortfood, Zweeds',
      recipeIngredient: ['1 cup rice'],
      recipeInstructions: 'Boil rice.',
    });

    const res = await agent.post('/api/recipes/import').send({ jsonLd });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Imported Recipe');
    expect(res.body.ingredients[0].name).toBe('rice');
    expect(res.body.category).toMatchObject({ name: 'hoofdgerecht' });
    expect(res.body.tags.map((t: { name: string }) => t.name).sort()).toEqual(
      ['hoofdgerecht', 'vlees', 'comfortfood', 'zweeds'].sort()
    );
  });

  it('rejects import with no JSON-LD provided', async () => {
    const res = await agent.post('/api/recipes/import').send({});
    expect(res.status).toBe(400);
  });

  describe('POST /api/recipes/import-url', () => {
    afterEach(() => {
      scrapeRecipeFromUrl.mockReset();
    });

    it('returns a scraped draft without persisting a recipe', async () => {
      scrapeRecipeFromUrl.mockResolvedValue({
        title: 'Scraped Recipe',
        description: null,
        image_path: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        total_time_minutes: null,
        servings: 4,
        ingredients: ['1 cup rice'],
        instructions: [{ step_number: 1, text: 'Boil rice.' }],
        tags: [],
        category: null,
      });

      const before = await pool.query('SELECT count(*) FROM recipes');

      const res = await agent
        .post('/api/recipes/import-url')
        .send({ url: 'https://example.com/recipe' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Scraped Recipe');
      expect(scrapeRecipeFromUrl).toHaveBeenCalledWith('https://example.com/recipe');

      const after = await pool.query('SELECT count(*) FROM recipes');
      expect(after.rows[0].count).toBe(before.rows[0].count);
    });

    it('rejects an invalid URL without calling the scraper', async () => {
      const res = await agent.post('/api/recipes/import-url').send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
      expect(scrapeRecipeFromUrl).not.toHaveBeenCalled();
    });

    it('maps a no_recipe_found scrape error to 400', async () => {
      const { UrlImportError } = await import('../src/utils/url-import-error.js');
      scrapeRecipeFromUrl.mockRejectedValue(
        new UrlImportError('No schema.org Recipe was found on that page.', 'no_recipe_found')
      );

      const res = await agent
        .post('/api/recipes/import-url')
        .send({ url: 'https://example.com/recipe' });

      expect(res.status).toBe(400);
      expect(res.body.kind).toBe('no_recipe_found');
    });

    it('maps a blocked_url scrape error to 400', async () => {
      const { UrlImportError } = await import('../src/utils/url-import-error.js');
      scrapeRecipeFromUrl.mockRejectedValue(
        new UrlImportError(
          "That URL points to a private or internal network address, which isn't allowed.",
          'blocked_url'
        )
      );

      const res = await agent.post('/api/recipes/import-url').send({ url: 'http://localhost' });
      expect(res.status).toBe(400);
      expect(res.body.kind).toBe('blocked_url');
    });

    it('maps a timeout scrape error to 502', async () => {
      const { UrlImportError } = await import('../src/utils/url-import-error.js');
      scrapeRecipeFromUrl.mockRejectedValue(
        new UrlImportError(
          'The page took too long to respond. Try again or check the URL.',
          'timeout'
        )
      );

      const res = await agent
        .post('/api/recipes/import-url')
        .send({ url: 'https://example.com/recipe' });

      expect(res.status).toBe(502);
      expect(res.body.kind).toBe('timeout');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/recipes/import-url')
        .send({ url: 'https://example.com/recipe' });

      expect(res.status).toBe(401);
      expect(scrapeRecipeFromUrl).not.toHaveBeenCalled();
    });
  });

  it('exports a recipe as schema.org Recipe JSON-LD', async () => {
    const created = await agent.post('/api/recipes').send({
      title: 'Export Me',
      servings: 4,
      prep_time_minutes: 10,
      ingredients: [{ raw_text: '1 cup rice' }],
      instructions: [{ step_number: 1, text: 'Boil rice.' }],
      tags: ['grain'],
      category: 'Side dish',
    });

    const res = await agent.get(`/api/recipes/${created.body.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Export Me',
      recipeYield: '4',
      prepTime: 'PT10M',
      recipeIngredient: ['1 cup rice'],
      recipeCategory: 'side dish',
      keywords: 'grain',
    });
    expect(res.body.recipeInstructions).toEqual([{ '@type': 'HowToStep', text: 'Boil rice.' }]);
  });

  it('returns 404 exporting a missing recipe', async () => {
    const res = await agent.get('/api/recipes/999999/export');
    expect(res.status).toBe(404);
  });

  it('lists tags', async () => {
    await agent.post('/api/recipes').send({ title: 'A', servings: 1, tags: ['x', 'y'] });
    const res = await agent.get('/api/tags');
    expect(res.body.map((t: { name: string }) => t.name).sort()).toEqual(['x', 'y']);
  });

  it('deletes a tag once no recipe references it anymore', async () => {
    const created = await agent
      .post('/api/recipes')
      .send({ title: 'Tagged', servings: 1, tags: ['keep-me', 'drop-me'] });

    await agent
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: 'Tagged', servings: 1, tags: ['keep-me'] });

    const afterUpdate = await agent.get('/api/tags');
    expect(afterUpdate.body.map((t: { name: string }) => t.name).sort()).toEqual(['keep-me']);

    await agent.delete(`/api/recipes/${created.body.id}`);

    const afterDelete = await agent.get('/api/tags');
    expect(afterDelete.body).toEqual([]);
  });

  it('lists categories', async () => {
    await agent.post('/api/recipes').send({ title: 'A', servings: 1, category: 'Snack' });
    await agent.post('/api/recipes').send({ title: 'B', servings: 1, category: 'Dessert' });
    const res = await agent.get('/api/categories');
    expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual(['dessert', 'snack']);
  });

  it('reuses the same category across recipes with the same name', async () => {
    const first = await agent
      .post('/api/recipes')
      .send({ title: 'A', servings: 1, category: 'Snack' });
    const second = await agent
      .post('/api/recipes')
      .send({ title: 'B', servings: 1, category: 'Snack' });

    expect(first.body.category.id).toBe(second.body.category.id);

    const res = await agent.get('/api/categories');
    expect(res.body).toHaveLength(1);
  });

  it('deletes a category once no recipe references it anymore', async () => {
    const created = await agent
      .post('/api/recipes')
      .send({ title: 'Tagged', servings: 1, category: 'Snack' });

    await agent
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: 'Tagged', servings: 1, category: 'Dessert' });

    const afterUpdate = await agent.get('/api/categories');
    expect(afterUpdate.body.map((c: { name: string }) => c.name)).toEqual(['dessert']);

    await agent.delete(`/api/recipes/${created.body.id}`);

    const afterDelete = await agent.get('/api/categories');
    expect(afterDelete.body).toEqual([]);
  });

  describe('per-user isolation', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/recipes');
      expect(res.status).toBe(401);
    });

    it("does not let one user see, edit, or delete another user's recipe", async () => {
      const created = await agent
        .post('/api/recipes')
        .send({ title: "Owner's Recipe", servings: 1, tags: ['private'] });

      const { agent: otherAgent } = await registerTestUser(app);

      const list = await otherAgent.get('/api/recipes');
      expect(list.body).toEqual([]);

      const get = await otherAgent.get(`/api/recipes/${created.body.id}`);
      expect(get.status).toBe(404);

      const put = await otherAgent
        .put(`/api/recipes/${created.body.id}`)
        .send({ title: 'Hijacked', servings: 1 });
      expect(put.status).toBe(404);

      const del = await otherAgent.delete(`/api/recipes/${created.body.id}`);
      expect(del.status).toBe(404);

      const stillThere = await agent.get(`/api/recipes/${created.body.id}`);
      expect(stillThere.status).toBe(200);

      const otherTags = await otherAgent.get('/api/tags');
      expect(otherTags.body).toEqual([]);
    });

    it("does not let one user see another user's categories", async () => {
      await agent
        .post('/api/recipes')
        .send({ title: "Owner's Recipe", servings: 1, category: 'Private Category' });

      const { agent: otherAgent } = await registerTestUser(app);

      const otherCategories = await otherAgent.get('/api/categories');
      expect(otherCategories.body).toEqual([]);
    });

    it("does not let one user upload to or view another user's recipe photo", async () => {
      const created = await agent
        .post('/api/recipes')
        .send({ title: "Owner's Recipe", servings: 1 });

      const ownPhoto = await agent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', Buffer.from('fake-image-bytes'), {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(ownPhoto.status).toBe(200);

      const { agent: otherAgent } = await registerTestUser(app);

      const otherUpload = await otherAgent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', Buffer.from('fake-image-bytes'), {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(otherUpload.status).toBe(404);

      const otherView = await otherAgent.get(ownPhoto.body.image_path);
      expect(otherView.status).toBe(404);

      const ownView = await agent.get(ownPhoto.body.image_path);
      expect(ownView.status).toBe(200);
    });

    it("does not delete another user's still-referenced tag when this user's last reference to the same name is removed", async () => {
      const mine = await agent
        .post('/api/recipes')
        .send({ title: 'Mine', servings: 1, tags: ['vegan'] });

      const { agent: otherAgent } = await registerTestUser(app);
      await otherAgent.post('/api/recipes').send({ title: 'Theirs', servings: 1, tags: ['vegan'] });

      await agent.delete(`/api/recipes/${mine.body.id}`);

      const otherTags = await otherAgent.get('/api/tags');
      expect(otherTags.body.map((t: { name: string }) => t.name)).toEqual(['vegan']);
    });
  });
});
