import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import sharp from 'sharp';
import type { Express } from 'express';
import { absoluteUploadPath, UPLOADS_DIR } from '../src/middleware/upload.js';
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
// A real, decodable image: photo uploads are re-encoded by sharp, so arbitrary bytes are refused.
function realPng(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c8b4a0' } })
    .png()
    .toBuffer();
}

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

    // Nothing creates UPLOADS_DIR at startup — it's only ever made lazily by a
    // successful photo upload (upload.ts's saveRecipePhoto). The traversal
    // test's sanity check needs the root to already exist so it can tell "still
    // there" from "never existed".
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags, categories, recipe_import_attempts RESTART IDENTITY CASCADE'
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

  // A malformed id used to reach Prisma as NaN (or overflow int4) and surface as an
  // opaque 500 from the catch-all in app.ts. It must now be rejected at the route
  // boundary, while a well-formed id that simply doesn't exist stays a 404.
  describe('recipe id validation', () => {
    const MALFORMED = ['abc', '-1', '0', '1.5', '%20', '007', '1e3', '99999999999999'];

    it.each(MALFORMED)('rejects GET /api/recipes/%s with 400', async (id) => {
      const res = await agent.get(`/api/recipes/${id}`);
      expect(res.status).toBe(400);
      // The frontend puts body.error straight into an ApiError message, so an array
      // here would render as "[object Object]".
      expect(typeof res.body.error).toBe('string');
    });

    it.each(MALFORMED)('rejects GET /api/recipes/%s/export with 400', async (id) => {
      expect((await agent.get(`/api/recipes/${id}/export`)).status).toBe(400);
    });

    it.each(MALFORMED)('rejects DELETE /api/recipes/%s with 400', async (id) => {
      expect((await agent.delete(`/api/recipes/${id}`)).status).toBe(400);
    });

    it('rejects a malformed id on PUT before the body is even parsed', async () => {
      const res = await agent.put('/api/recipes/abc').send({ title: 'Valid', servings: 4 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid recipe id.');
    });

    it('keeps 404 (not 400) for a well-formed id that does not exist', async () => {
      expect((await agent.get('/api/recipes/999999')).status).toBe(404);
      expect((await agent.delete('/api/recipes/999999')).status).toBe(404);
      expect(
        (await agent.put('/api/recipes/999999').send({ title: 'Valid', servings: 4 })).status
      ).toBe(404);
    });

    it('rejects a traversal id on photo upload without creating a directory', async () => {
      const res = await agent
        .post('/api/recipes/..%2F..%2Fetc/photo')
        .attach('photo', Buffer.from('fake-image-bytes'), {
          filename: 'photo.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(400);
      expect(fs.existsSync(path.join(UPLOADS_DIR, '..', '..', 'etc'))).toBe(false);
      expect(fs.existsSync(path.join(UPLOADS_DIR, 'recipes', '..'))).toBe(true); // sanity: uploads root intact
    });

    it('still returns 404 when photo upload targets a well-formed missing recipe', async () => {
      const res = await agent
        .post('/api/recipes/999999/photo')
        .attach('photo', Buffer.from('fake-image-bytes'), {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(404);
    });

    it('returns 404, not 500, for an over-long id on the static photo mount', async () => {
      const res = await agent.get('/uploads/recipes/99999999999999/x.jpg');
      expect(res.status).toBe(404);
    });
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

  describe('nutrition', () => {
    const nutrition = {
      calories: 420,
      fat_content: 14.5,
      carbohydrate_content: 58,
      protein_content: 16,
    };

    function readNutrition(body: Record<string, string | null>) {
      return {
        calories: body.calories === null ? null : Number(body.calories),
        fat_content: body.fat_content === null ? null : Number(body.fat_content),
        carbohydrate_content:
          body.carbohydrate_content === null ? null : Number(body.carbohydrate_content),
        protein_content: body.protein_content === null ? null : Number(body.protein_content),
      };
    }

    it('round-trips per-serving values through create and read', async () => {
      const created = await agent
        .post('/api/recipes')
        .send({ title: 'Pasta', servings: 4, ...nutrition });

      expect(created.status).toBe(201);
      expect(readNutrition(created.body)).toEqual(nutrition);

      const fetched = await agent.get(`/api/recipes/${created.body.id}`);
      expect(readNutrition(fetched.body)).toEqual(nutrition);
    });

    it('defaults to null when a recipe is created without nutrition', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Plain', servings: 2 });

      expect(readNutrition(created.body)).toEqual({
        calories: null,
        fat_content: null,
        carbohydrate_content: null,
        protein_content: null,
      });
    });

    // PUT is a full overwrite, so a value the form cleared has to come back as null rather than
    // silently keeping the old number.
    it('clears a value the update omits', async () => {
      const created = await agent
        .post('/api/recipes')
        .send({ title: 'Pasta', servings: 4, ...nutrition });

      const updated = await agent
        .put(`/api/recipes/${created.body.id}`)
        .send({ title: 'Pasta', servings: 4, calories: 500 });

      expect(updated.status).toBe(200);
      expect(readNutrition(updated.body)).toEqual({
        calories: 500,
        fat_content: null,
        carbohydrate_content: null,
        protein_content: null,
      });
    });

    it('rejects a negative value', async () => {
      const res = await agent
        .post('/api/recipes')
        .send({ title: 'Pasta', servings: 4, calories: -1 });
      expect(res.status).toBe(400);
    });

    it('imports nutrition from JSON-LD', async () => {
      const jsonLd = JSON.stringify({
        '@type': 'Recipe',
        name: 'Nutritious Recipe',
        recipeYield: '2',
        recipeIngredient: ['1 cup rice'],
        recipeInstructions: 'Boil rice.',
        nutrition: {
          '@type': 'NutritionInformation',
          calories: '512 kcal',
          proteinContent: '31 g',
        },
      });

      const res = await agent.post('/api/recipes/import').send({ jsonLd });

      expect(res.status).toBe(201);
      expect(readNutrition(res.body)).toEqual({
        calories: 512,
        fat_content: null,
        carbohydrate_content: null,
        protein_content: 31,
      });
    });
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

  // A remote URL is the one image_path a client may put in the DB — it is how both
  // import routes carry a picture, and it can never reach the filesystem helpers.
  it('keeps the remote image URL when importing from JSON-LD', async () => {
    const jsonLd = JSON.stringify({
      '@type': 'Recipe',
      name: 'Pictured Recipe',
      image: 'https://example.com/pancakes.jpg',
      recipeYield: '2',
      recipeIngredient: ['1 cup rice'],
      recipeInstructions: 'Boil rice.',
    });

    const res = await agent.post('/api/recipes/import').send({ jsonLd });
    expect(res.status).toBe(201);
    expect(res.body.image_path).toBe('https://example.com/pancakes.jpg');
  });

  it('drops a non-remote image_path on create', async () => {
    const res = await agent
      .post('/api/recipes')
      .send({ title: 'Local Path', servings: 1, image_path: '/uploads/recipes/1/x.png' });

    expect(res.status).toBe(201);
    expect(res.body.image_path).toBeNull();
  });

  it('rejects import with no JSON-LD provided', async () => {
    const res = await agent.post('/api/recipes/import').send({});
    expect(res.status).toBe(400);
  });

  // A truthy non-string jsonLd used to throw a TypeError inside the parser (which
  // iterates the string) past all three catch branches, surfacing as a 500.
  it.each([[{ a: 1 }], [123], [true], [['a']]])(
    'rejects a non-string jsonLd (%j) with 400, not 500',
    async (jsonLd) => {
      const res = await agent.post('/api/recipes/import').send({ jsonLd });
      expect(res.status).toBe(400);
    }
  );

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
      expect(scrapeRecipeFromUrl).toHaveBeenCalledWith('https://example.com/recipe', 'en');

      const after = await pool.query('SELECT count(*) FROM recipes');
      expect(after.rows[0].count).toBe(before.rows[0].count);

      const attempts = await pool.query(
        'SELECT url, hostname, success, error_kind FROM recipe_import_attempts'
      );
      expect(attempts.rows).toEqual([
        {
          url: 'https://example.com/recipe',
          hostname: 'example.com',
          success: true,
          error_kind: null,
        },
      ]);
    });

    it('rejects an invalid URL without calling the scraper', async () => {
      const res = await agent.post('/api/recipes/import-url').send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
      expect(scrapeRecipeFromUrl).not.toHaveBeenCalled();

      const attempts = await pool.query('SELECT success, error_kind FROM recipe_import_attempts');
      expect(attempts.rows).toEqual([{ success: false, error_kind: 'validation_error' }]);
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

      const attempts = await pool.query(
        'SELECT success, error_kind, error_message FROM recipe_import_attempts'
      );
      expect(attempts.rows).toEqual([
        {
          success: false,
          error_kind: 'no_recipe_found',
          error_message: 'No schema.org Recipe was found on that page.',
        },
      ]);
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

    it('maps a timeout scrape error to 422', async () => {
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

      expect(res.status).toBe(422);
      expect(res.body.kind).toBe('timeout');
    });

    it('maps a bot_challenge scrape error to 422 with its message', async () => {
      const { UrlImportError } = await import('../src/utils/url-import-error.js');
      scrapeRecipeFromUrl.mockRejectedValue(
        new UrlImportError("That site's bot protection blocked automatic import.", 'bot_challenge')
      );

      const res = await agent
        .post('/api/recipes/import-url')
        .send({ url: 'https://example.com/recipe' });

      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        error: "That site's bot protection blocked automatic import.",
        kind: 'bot_challenge',
      });
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

  // Two separately registered users are each in their own personal family, so
  // these still assert isolation — now between families rather than users.
  describe('per-family isolation', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/recipes');
      expect(res.status).toBe(401);
    });

    it('does not let a user outside the family see, edit, or delete a recipe', async () => {
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

    it('does not let a user outside the family see its categories', async () => {
      await agent
        .post('/api/recipes')
        .send({ title: "Owner's Recipe", servings: 1, category: 'Private Category' });

      const { agent: otherAgent } = await registerTestUser(app);

      const otherCategories = await otherAgent.get('/api/categories');
      expect(otherCategories.body).toEqual([]);
    });

    it('does not let a user outside the family upload to or view a recipe photo', async () => {
      const created = await agent
        .post('/api/recipes')
        .send({ title: "Owner's Recipe", servings: 1 });

      const ownPhoto = await agent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', await realPng(), {
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

    it("does not delete another family's still-referenced tag when this family's last reference to the same name is removed", async () => {
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

  describe('photo files on disk', () => {
    const attachPhoto = async (recipeId: number) =>
      agent.post(`/api/recipes/${recipeId}/photo`).attach('photo', await realPng(), {
        filename: 'photo.png',
        contentType: 'image/png',
      });

    it('deletes the uploaded file and its directory when the recipe is deleted', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'With Photo', servings: 1 });
      const uploaded = await attachPhoto(created.body.id);
      expect(uploaded.status).toBe(200);

      const absolute = absoluteUploadPath(uploaded.body.image_path) as string;
      expect(fs.existsSync(absolute)).toBe(true);

      const deleted = await agent.delete(`/api/recipes/${created.body.id}`);
      expect(deleted.status).toBe(204);

      expect(fs.existsSync(absolute)).toBe(false);
      expect(fs.existsSync(path.join(UPLOADS_DIR, 'recipes', String(created.body.id)))).toBe(false);
    });

    it('deletes the superseded file when a photo is replaced', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Replaced', servings: 1 });

      const first = await attachPhoto(created.body.id);
      const second = await attachPhoto(created.body.id);
      expect(second.status).toBe(200);
      expect(second.body.image_path).not.toBe(first.body.image_path);

      expect(fs.existsSync(absoluteUploadPath(first.body.image_path) as string)).toBe(false);
      expect(fs.existsSync(absoluteUploadPath(second.body.image_path) as string)).toBe(true);

      await agent.delete(`/api/recipes/${created.body.id}`);
    });

    // The inverse of the behaviour this endpoint used to have. A PUT that omits
    // image_path leaves the photo alone instead of clearing it: the column is owned
    // by setRecipePhoto, because a body-supplied path is a filesystem handle the
    // request has no claim to. The edit form has no "remove photo" control, so
    // nothing in the app relied on the old clearing behaviour.
    it('leaves the photo untouched when a recipe update omits image_path', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Kept', servings: 1 });
      const uploaded = await attachPhoto(created.body.id);
      const absolute = absoluteUploadPath(uploaded.body.image_path) as string;

      const updated = await agent
        .put(`/api/recipes/${created.body.id}`)
        .send({ title: 'Kept', servings: 1 });
      expect(updated.status).toBe(200);
      expect(updated.body.image_path).toBe(uploaded.body.image_path);

      expect(fs.existsSync(absolute)).toBe(true);

      await agent.delete(`/api/recipes/${created.body.id}`);
    });

    it('ignores a client-supplied image_path pointing at another recipe’s upload', async () => {
      const victim = await agent.post('/api/recipes').send({ title: 'Victim', servings: 1 });
      const victimPhoto = await attachPhoto(victim.body.id);
      const victimFile = absoluteUploadPath(victimPhoto.body.image_path) as string;

      // Create: the foreign path must not be stored at all.
      const attacker = await agent
        .post('/api/recipes')
        .send({ title: 'Attacker', servings: 1, image_path: victimPhoto.body.image_path });
      expect(attacker.status).toBe(201);
      expect(attacker.body.image_path).toBeNull();

      // Update: the same path must not reach deleteUploadedFile. Point the recipe at
      // the victim's photo and then "replace" it — the old code would have unlinked
      // the previous value, which is the victim's file.
      await agent
        .put(`/api/recipes/${attacker.body.id}`)
        .send({ title: 'Attacker', servings: 1, image_path: victimPhoto.body.image_path });
      const reread = await agent
        .put(`/api/recipes/${attacker.body.id}`)
        .send({ title: 'Attacker', servings: 1, image_path: null });
      expect(reread.body.image_path).toBeNull();

      expect(fs.existsSync(victimFile)).toBe(true);

      await agent.delete(`/api/recipes/${attacker.body.id}`);
      await agent.delete(`/api/recipes/${victim.body.id}`);
    });

    it('stores a server-chosen extension, not the one the upload asked for', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Renamed', servings: 1 });

      const uploaded = await agent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', await realPng(), {
          filename: 'evil.html',
          contentType: 'image/png',
        });
      expect(uploaded.status).toBe(200);
      expect(uploaded.body.image_path).toMatch(/\.webp$/);

      await agent.delete(`/api/recipes/${created.body.id}`);
    });

    it('stores the photo re-encoded as WebP and bounded in size', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Big Photo', servings: 1 });

      const uploaded = await agent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', await realPng(3200, 2400), {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(uploaded.status).toBe(200);

      const meta = await sharp(absoluteUploadPath(uploaded.body.image_path) as string).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(1200);

      await agent.delete(`/api/recipes/${created.body.id}`);
    });

    it('refuses bytes that are not actually an image, writing nothing', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Fake', servings: 1 });

      const uploaded = await agent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', Buffer.from('fake-image-bytes'), {
          filename: 'photo.png',
          contentType: 'image/png',
        });
      expect(uploaded.status).toBe(400);
      expect(uploaded.body.kind).toBe('unreadable_image');

      const recipe = await agent.get(`/api/recipes/${created.body.id}`);
      expect(recipe.body.image_path).toBeNull();
      expect(fs.existsSync(path.join(UPLOADS_DIR, 'recipes', String(created.body.id)))).toBe(false);

      await agent.delete(`/api/recipes/${created.body.id}`);
    });

    it('refuses an SVG upload outright', async () => {
      const created = await agent.post('/api/recipes').send({ title: 'Svg', servings: 1 });

      const uploaded = await agent
        .post(`/api/recipes/${created.body.id}/photo`)
        .attach('photo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
          filename: 'x.svg',
          contentType: 'image/svg+xml',
        });
      expect(uploaded.status).toBe(400);

      const recipe = await agent.get(`/api/recipes/${created.body.id}`);
      expect(recipe.body.image_path).toBeNull();

      await agent.delete(`/api/recipes/${created.body.id}`);
    });
  });
});
