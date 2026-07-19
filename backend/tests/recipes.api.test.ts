import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
describe.skipIf(!TEST_DATABASE_URL)('recipes API', () => {
  let app: Express;
  let pool: pg.Pool;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const schemaSql = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf-8');
    await pool.query(schemaSql);

    ({ app } = await import('../src/app.js'));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags RESTART IDENTITY CASCADE'
    );
  });

  it('creates and fetches a recipe', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .send({
        title: 'Test Soup',
        servings: 4,
        ingredients: [{ raw_text: '2 cups broth', amount: 2, unit: 'cups', name: 'broth' }],
        instructions: [{ step_number: 1, text: 'Simmer.' }],
        tags: ['soup', 'dinner'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.title).toBe('Test Soup');
    expect(createRes.body.ingredients).toHaveLength(1);
    expect(createRes.body.tags.map((t) => t.name).sort()).toEqual(['dinner', 'soup']);

    const getRes = await request(app).get(`/api/recipes/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('Test Soup');
  });

  it('returns 404 for a missing recipe', async () => {
    const res = await request(app).get('/api/recipes/999999');
    expect(res.status).toBe(404);
  });

  it('filters the recipe list by search text', async () => {
    await request(app).post('/api/recipes').send({ title: 'Chocolate Cake', servings: 8 });
    await request(app).post('/api/recipes').send({ title: 'Vegetable Soup', servings: 4 });

    const res = await request(app).get('/api/recipes').query({ search: 'cake' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Chocolate Cake');
  });

  it('filters the recipe list by tag', async () => {
    await request(app)
      .post('/api/recipes')
      .send({ title: 'Tacos', servings: 2, tags: ['mexican'] });
    await request(app)
      .post('/api/recipes')
      .send({ title: 'Pasta', servings: 2, tags: ['italian'] });

    const res = await request(app).get('/api/recipes').query({ tag: 'mexican' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Tacos');
  });

  it('updates a recipe', async () => {
    const created = await request(app)
      .post('/api/recipes')
      .send({ title: 'Original', servings: 2 });

    const updated = await request(app)
      .put(`/api/recipes/${created.body.id}`)
      .send({ title: 'Updated', servings: 3 });

    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Updated');
    expect(Number(updated.body.servings)).toBe(3);
  });

  it('deletes a recipe', async () => {
    const created = await request(app)
      .post('/api/recipes')
      .send({ title: 'To Delete', servings: 1 });

    const del = await request(app).delete(`/api/recipes/${created.body.id}`);
    expect(del.status).toBe(204);

    const getRes = await request(app).get(`/api/recipes/${created.body.id}`);
    expect(getRes.status).toBe(404);
  });

  it('imports a recipe from JSON-LD text', async () => {
    const jsonLd = JSON.stringify({
      '@type': 'Recipe',
      name: 'Imported Recipe',
      recipeYield: '2',
      recipeIngredient: ['1 cup rice'],
      recipeInstructions: 'Boil rice.',
    });

    const res = await request(app).post('/api/recipes/import').send({ jsonLd });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Imported Recipe');
    expect(res.body.ingredients[0].name).toBe('rice');
  });

  it('rejects import with no JSON-LD provided', async () => {
    const res = await request(app).post('/api/recipes/import').send({});
    expect(res.status).toBe(400);
  });

  it('lists tags', async () => {
    await request(app)
      .post('/api/recipes')
      .send({ title: 'A', servings: 1, tags: ['x', 'y'] });
    const res = await request(app).get('/api/tags');
    expect(res.body.map((t) => t.name).sort()).toEqual(['x', 'y']);
  });
});
