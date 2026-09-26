import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { Express } from 'express';
import { registerTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('recipe versions API', () => {
  let app: Express;
  let pool: pg.Pool;
  let agent: Awaited<ReturnType<typeof registerTestUser>>['agent'];

  const original = {
    title: 'Tomato pasta',
    description: 'Simple tomato pasta.',
    servings: 2,
    cook_time_minutes: 25,
    calories: 460,
    ingredients: ['200 g spaghetti', '1 tbsp butter'],
    instructions: [{ step_number: 1, text: 'Cook the spaghetti.' }],
    tags: ['pasta'],
    category: 'Lunch',
  };

  const edited = {
    ...original,
    title: 'Weeknight tomato pasta',
    servings: 4,
    calories: 420,
    ingredients: ['400 g spaghetti', '2 tbsp olive oil'],
    instructions: [
      { step_number: 1, text: 'Cook the spaghetti until al dente.' },
      { step_number: 2, text: 'Toss with the sauce.' },
    ],
    tags: ['pasta', 'quick'],
    category: 'Dinner',
  };

  async function createRecipe() {
    const res = await agent.post('/api/recipes').send(original);
    expect(res.status).toBe(201);
    return res.body as { id: number; updated_at: string };
  }

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
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags, categories, recipe_versions RESTART IDENTITY CASCADE'
    );
  });

  it('records no version on create, and the pre-edit state on update', async () => {
    const recipe = await createRecipe();

    const empty = await agent.get(`/api/recipes/${recipe.id}/versions`);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    expect((await agent.put(`/api/recipes/${recipe.id}`).send(edited)).status).toBe(200);

    const list = await agent.get(`/api/recipes/${recipe.id}/versions`);
    expect(list.body).toHaveLength(1);
    expect(new Date(list.body[0].saved_at).toISOString()).toBe(
      new Date(recipe.updated_at).toISOString()
    );

    const version = await agent.get(`/api/recipes/${recipe.id}/versions/${list.body[0].id}`);
    expect(version.status).toBe(200);
    expect(version.body.snapshot).toMatchObject({
      title: 'Tomato pasta',
      description: 'Simple tomato pasta.',
      servings: '2',
      cook_time_minutes: 25,
      calories: '460',
      category: 'lunch',
      tags: ['pasta'],
      ingredients: ['200 g spaghetti', '1 tbsp butter'],
      instructions: [{ step_number: 1, text: 'Cook the spaghetti.' }],
    });
    expect(version.body.snapshot).not.toHaveProperty('image_path');
  });

  it('lists versions newest first', async () => {
    const recipe = await createRecipe();
    await agent.put(`/api/recipes/${recipe.id}`).send(edited);
    await agent.put(`/api/recipes/${recipe.id}`).send({ ...edited, title: 'Third' });

    const list = await agent.get(`/api/recipes/${recipe.id}/versions`);
    expect(list.body).toHaveLength(2);
    const [newest, oldest] = list.body;
    expect(new Date(newest.saved_at) >= new Date(oldest.saved_at)).toBe(true);

    const newestVersion = await agent.get(`/api/recipes/${recipe.id}/versions/${newest.id}`);
    expect(newestVersion.body.snapshot.title).toBe('Weeknight tomato pasta');
  });

  it('reverts to a version and snapshots the state it replaces', async () => {
    const recipe = await createRecipe();
    await agent.put(`/api/recipes/${recipe.id}`).send(edited);
    const [version] = (await agent.get(`/api/recipes/${recipe.id}/versions`)).body;

    const revert = await agent.post(`/api/recipes/${recipe.id}/versions/${version.id}/revert`);
    expect(revert.status).toBe(200);
    expect(revert.body.title).toBe('Tomato pasta');
    expect(revert.body.servings).toBe('2');
    expect(revert.body.calories).toBe('460');
    expect(revert.body.category).toMatchObject({ name: 'lunch' });
    expect(revert.body.tags.map((t: { name: string }) => t.name)).toEqual(['pasta']);
    expect(revert.body.ingredients.map((i: { raw_text: string }) => i.raw_text)).toEqual([
      '200 g spaghetti',
      '1 tbsp butter',
    ]);
    expect(revert.body.instructions.map((i: { text: string }) => i.text)).toEqual([
      'Cook the spaghetti.',
    ]);

    const list = await agent.get(`/api/recipes/${recipe.id}/versions`);
    expect(list.body).toHaveLength(2);
    const latest = await agent.get(`/api/recipes/${recipe.id}/versions/${list.body[0].id}`);
    expect(latest.body.snapshot.title).toBe('Weeknight tomato pasta');
  });

  it('keeps versions per recipe', async () => {
    const a = await createRecipe();
    const b = await createRecipe();
    await agent.put(`/api/recipes/${a.id}`).send(edited);
    const [version] = (await agent.get(`/api/recipes/${a.id}/versions`)).body;

    expect((await agent.get(`/api/recipes/${b.id}/versions`)).body).toEqual([]);
    expect((await agent.get(`/api/recipes/${b.id}/versions/${version.id}`)).status).toBe(404);
    expect((await agent.post(`/api/recipes/${b.id}/versions/${version.id}/revert`)).status).toBe(
      404
    );
  });

  it("hides another family's versions", async () => {
    const recipe = await createRecipe();
    await agent.put(`/api/recipes/${recipe.id}`).send(edited);
    const [version] = (await agent.get(`/api/recipes/${recipe.id}/versions`)).body;

    const { agent: outsider } = await registerTestUser(app, 'outsider@example.com');
    expect((await outsider.get(`/api/recipes/${recipe.id}/versions`)).status).toBe(404);
    expect((await outsider.get(`/api/recipes/${recipe.id}/versions/${version.id}`)).status).toBe(
      404
    );
    expect(
      (await outsider.post(`/api/recipes/${recipe.id}/versions/${version.id}/revert`)).status
    ).toBe(404);

    const untouched = await agent.get(`/api/recipes/${recipe.id}`);
    expect(untouched.body.title).toBe('Weeknight tomato pasta');
  });

  it('rejects a malformed version id', async () => {
    const recipe = await createRecipe();
    expect((await agent.get(`/api/recipes/${recipe.id}/versions/abc`)).status).toBe(400);
    expect((await agent.post(`/api/recipes/${recipe.id}/versions/0/revert`)).status).toBe(400);
  });

  it('deletes versions along with the recipe', async () => {
    const recipe = await createRecipe();
    await agent.put(`/api/recipes/${recipe.id}`).send(edited);
    expect((await agent.delete(`/api/recipes/${recipe.id}`)).status).toBe(204);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM recipe_versions');
    expect(rows[0].n).toBe(0);
  });
});
