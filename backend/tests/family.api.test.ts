import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { Express } from 'express';
import { registerTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// POST /api/family/join shares the loginRateLimiter, so each test gets its own
// fake client IP to avoid cross-talk — same trick as auth-reset.api.test.ts.
let ipCounter = 1;
function nextIp(): string {
  return `10.98.0.${ipCounter++}`;
}

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
describe.skipIf(!TEST_DATABASE_URL)('family API', () => {
  let app: Express;
  let pool: pg.Pool;

  type TestUser = Awaited<ReturnType<typeof registerTestUser>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    await resetTestDatabase(TEST_DATABASE_URL as string);
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    ({ app } = await import('../src/app.js'));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Users and families are recreated per test here (unlike recipes.api.test.ts,
    // which shares one long-lived agent), so both go in the truncate list.
    await pool.query(
      'TRUNCATE users, families, recipes, ingredients, instructions, tags, recipe_tags, categories RESTART IDENTITY CASCADE'
    );
  });

  async function inviteTokenOf(user: TestUser): Promise<string> {
    const res = await user.agent.get('/api/family');
    expect(res.status).toBe(200);
    return res.body.invite_token as string;
  }

  function join(user: TestUser, token: string) {
    return user.agent.post('/api/family/join').set('X-Forwarded-For', nextIp()).send({ token });
  }

  it('gives a fresh user a family of one with an invite token', async () => {
    const alice = await registerTestUser(app);

    const res = await alice.agent.get('/api/family');

    expect(res.status).toBe(200);
    expect(res.body.invite_token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.members).toEqual([{ id: alice.userId, email: alice.email }]);
  });

  it('lets a joined member read and write the whole shared collection', async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);

    const recipe = await alice.agent
      .post('/api/recipes')
      .send({ title: "Alice's Stew", servings: 2, tags: ['stew'], category: 'Dinner' });

    // Before joining, Bob is in his own family and sees nothing.
    expect((await bob.agent.get('/api/recipes')).body).toEqual([]);

    expect((await join(bob, await inviteTokenOf(alice))).status).toBe(204);

    const list = await bob.agent.get('/api/recipes');
    expect(list.body.map((r: { title: string }) => r.title)).toEqual(["Alice's Stew"]);
    expect((await bob.agent.get('/api/tags')).body.map((t: { name: string }) => t.name)).toEqual([
      'stew',
    ]);
    expect(
      (await bob.agent.get('/api/categories')).body.map((c: { name: string }) => c.name)
    ).toEqual(['dinner']);

    // Full shared ownership: any member may edit and delete any family recipe.
    const put = await bob.agent
      .put(`/api/recipes/${recipe.body.id}`)
      .send({ title: 'Renamed by Bob', servings: 2 });
    expect(put.status).toBe(200);
    expect(put.body.title).toBe('Renamed by Bob');

    expect((await bob.agent.delete(`/api/recipes/${recipe.body.id}`)).status).toBe(204);
    expect((await alice.agent.get('/api/recipes')).body).toEqual([]);

    const family = await alice.agent.get('/api/family');
    expect(family.body.members.map((m: { email: string }) => m.email)).toEqual([
      alice.email,
      bob.email,
    ]);
  });

  it('merges duplicate tags by name instead of creating a second one', async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);

    await alice.agent
      .post('/api/recipes')
      .send({ title: 'Alice Dinner', servings: 1, tags: ['dinner', 'quick'] });
    await bob.agent
      .post('/api/recipes')
      .send({ title: 'Bob Dinner', servings: 1, tags: ['dinner', 'slow'] });

    expect((await join(bob, await inviteTokenOf(alice))).status).toBe(204);

    const tags = await bob.agent.get('/api/tags');
    expect(tags.body.map((t: { name: string }) => t.name)).toEqual(['dinner', 'quick', 'slow']);

    // The shared 'dinner' tag must be one row referenced by both recipes.
    const dinner = tags.body.find((t: { name: string }) => t.name === 'dinner');
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM recipe_tags WHERE tag_id = $1',
      [dinner.id]
    );
    expect(rows[0].count).toBe('2');

    const dupes = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM tags WHERE name = 'dinner'"
    );
    expect(dupes.rows[0].count).toBe('1');
  });

  it('merges duplicate categories without orphaning any recipe', async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);

    await alice.agent
      .post('/api/recipes')
      .send({ title: 'Alice Cake', servings: 1, category: 'Dessert' });
    await bob.agent
      .post('/api/recipes')
      .send({ title: 'Bob Pie', servings: 1, category: 'Dessert' });

    expect((await join(bob, await inviteTokenOf(alice))).status).toBe(204);

    const categories = await bob.agent.get('/api/categories');
    expect(categories.body.map((c: { name: string }) => c.name)).toEqual(['dessert']);

    // A mis-ordered merge would silently NULL these via the SetNull FK rather
    // than erroring, so assert the references explicitly.
    const recipes = await bob.agent.get('/api/recipes');
    expect(recipes.body).toHaveLength(2);
    for (const recipe of recipes.body) {
      expect(recipe.category?.name).toBe('dessert');
    }

    const orphans = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM recipes WHERE category_id IS NULL'
    );
    expect(orphans.rows[0].count).toBe('0');
  });

  it('rejects an unknown invite token', async () => {
    const bob = await registerTestUser(app);

    const res = await join(bob, 'f'.repeat(64));

    expect(res.status).toBe(404);
    expect(res.body.kind).toBe('invalid_invite');
  });

  it('rejects joining the family you are already in', async () => {
    const alice = await registerTestUser(app);

    const res = await join(alice, await inviteTokenOf(alice));

    expect(res.status).toBe(409);
    expect(res.body.kind).toBe('already_member');
  });

  it('leaves the collection behind and starts the leaver empty', async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);

    await alice.agent.post('/api/recipes').send({ title: 'Shared Stew', servings: 1 });
    await join(bob, await inviteTokenOf(alice));
    expect((await bob.agent.get('/api/recipes')).body).toHaveLength(1);

    expect((await bob.agent.post('/api/family/leave')).status).toBe(204);

    expect((await bob.agent.get('/api/recipes')).body).toEqual([]);
    expect((await alice.agent.get('/api/recipes')).body).toHaveLength(1);

    const bobFamily = await bob.agent.get('/api/family');
    expect(bobFamily.body.members).toEqual([{ id: bob.userId, email: bob.email }]);
  });

  it('refuses to leave a family of one, which would delete your own recipes', async () => {
    const alice = await registerTestUser(app);
    await alice.agent.post('/api/recipes').send({ title: 'Only Mine', servings: 1 });

    const res = await alice.agent.post('/api/family/leave');

    expect(res.status).toBe(409);
    expect(res.body.kind).toBe('nothing_to_leave');
    expect((await alice.agent.get('/api/recipes')).body).toHaveLength(1);
  });

  it('does not drag a shared collection along when a member joins a third family', async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);
    const carol = await registerTestUser(app);

    await alice.agent.post('/api/recipes').send({ title: 'Shared Stew', servings: 1 });
    await join(bob, await inviteTokenOf(alice));

    await carol.agent.post('/api/recipes').send({ title: 'Carol Salad', servings: 1 });
    expect((await join(bob, await inviteTokenOf(carol))).status).toBe(204);

    // Bob moved on alone; the stew stays with Alice.
    expect(
      (await bob.agent.get('/api/recipes')).body.map((r: { title: string }) => r.title)
    ).toEqual(['Carol Salad']);
    expect(
      (await alice.agent.get('/api/recipes')).body.map((r: { title: string }) => r.title)
    ).toEqual(['Shared Stew']);
  });

  it("keeps a departed member's recipes in the family", async () => {
    const alice = await registerTestUser(app);
    const bob = await registerTestUser(app);

    await join(bob, await inviteTokenOf(alice));
    await bob.agent.post('/api/recipes').send({ title: "Bob's Bread", servings: 1 });

    const deleted = await bob.agent
      .delete('/api/auth/me')
      .set('X-Forwarded-For', nextIp())
      .send({ password: 'password123' });
    expect(deleted.status).toBe(204);

    const remaining = await alice.agent.get('/api/recipes');
    expect(remaining.body.map((r: { title: string }) => r.title)).toEqual(["Bob's Bread"]);

    // Provenance is cleared, but the recipe itself survives.
    const authors = await pool.query<{ author_id: number | null }>('SELECT author_id FROM recipes');
    expect(authors.rows).toEqual([{ author_id: null }]);
  });

  it('deletes the family with its last member', async () => {
    const alice = await registerTestUser(app);
    await alice.agent.post('/api/recipes').send({ title: 'Only Mine', servings: 1 });

    const deleted = await alice.agent
      .delete('/api/auth/me')
      .set('X-Forwarded-For', nextIp())
      .send({ password: 'password123' });
    expect(deleted.status).toBe(204);

    const families = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM families'
    );
    expect(families.rows[0].count).toBe('0');

    const recipes = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM recipes'
    );
    expect(recipes.rows[0].count).toBe('0');
  });
});
