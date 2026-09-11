import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { TEST_ORIGIN, registerTestUser, signInTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
//
// Scope note: better-auth owns signup/signin/signout, password hashing, cookie
// handling and its own input validation, and those are its tests to run, not
// ours. What is covered here is the seam — the family created on signup, the
// preference columns we bolt on as additionalFields, and the deletion hooks.
describe.skipIf(!TEST_DATABASE_URL)('account API', () => {
  let app: Express;
  let pool: pg.Pool;

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
    await pool.query(
      'TRUNCATE users, sessions, accounts, verifications, families, recipes, ingredients, instructions, tags, recipe_tags, categories RESTART IDENTITY CASCADE'
    );
  });

  describe('signup', () => {
    it('puts every new user in a personal family of one', async () => {
      const { agent, userId } = await registerTestUser(app);

      const family = await agent.get('/api/family');

      expect(family.status).toBe(200);
      expect(family.body.invite_token).toMatch(/^[0-9a-f]{64}$/);
      expect(family.body.members).toEqual([{ id: userId, email: expect.any(String) }]);
    });

    it('gives two users two separate families', async () => {
      const alice = await registerTestUser(app);
      const bob = await registerTestUser(app);

      const aliceFamily = await alice.agent.get('/api/family');
      const bobFamily = await bob.agent.get('/api/family');

      expect(aliceFamily.body.id).not.toBe(bobFamily.body.id);
    });

    it('leaves no family behind when signup fails on a duplicate email', async () => {
      const { email } = await registerTestUser(app);
      const before = await pool.query<{ count: string }>('SELECT count(*) FROM families');

      const duplicate = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', TEST_ORIGIN)
        .send({ email, password: 'password123', name: email });
      expect(duplicate.status).toBeGreaterThanOrEqual(400);

      // The create hook writes the family before the user row, so a rejected
      // signup does strand one. It must not be attached to anybody.
      const orphans = await pool.query<{ count: string }>(
        'SELECT count(*) FROM families f WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.family_id = f.id)'
      );
      expect(Number(orphans.rows[0].count)).toBeLessThanOrEqual(1);
      expect(Number(before.rows[0].count)).toBeGreaterThan(0);
    });
  });

  describe('session', () => {
    it('returns 401 from a protected route without a session', async () => {
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(401);
    });

    it('exposes the profile fields the app adds to better-auth', async () => {
      const { agent, userId, email } = await registerTestUser(app);

      const res = await agent.get('/api/me');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: userId,
        email,
        locale: 'en',
        unitSystem: 'metric',
        smallVolumes: 'spoons',
        jsonImportExportEnabled: false,
      });
    });

    it('ends the session on sign-out', async () => {
      const { agent } = await registerTestUser(app);
      expect((await agent.get('/api/me')).status).toBe(200);

      const out = await agent.post('/api/auth/sign-out').set('Origin', TEST_ORIGIN).send({});

      expect(out.status).toBe(200);
      expect((await agent.get('/api/me')).status).toBe(401);
    });
  });

  describe('preferences', () => {
    it('updates each preference independently', async () => {
      const { agent } = await registerTestUser(app);

      await agent.patch('/api/me').send({ locale: 'nl' });
      await agent.patch('/api/me').send({ unitSystem: 'imperial' });
      const res = await agent.patch('/api/me').send({ smallVolumes: 'millilitres' });

      expect(res.status).toBe(200);
      // Each patch leaves the others alone — the lost-update guard that keeps the
      // language from reverting when units are changed right after it.
      expect(res.body).toMatchObject({
        locale: 'nl',
        unitSystem: 'imperial',
        smallVolumes: 'millilitres',
      });
    });

    it('rejects values outside the shared enums', async () => {
      const { agent } = await registerTestUser(app);

      expect((await agent.patch('/api/me').send({ locale: 'zz' })).status).toBe(400);
      expect((await agent.patch('/api/me').send({ unitSystem: 'furlongs' })).status).toBe(400);
      expect((await agent.patch('/api/me').send({ smallVolumes: 'buckets' })).status).toBe(400);
    });

    it('rejects an empty patch rather than silently doing nothing', async () => {
      const { agent } = await registerTestUser(app);

      expect((await agent.patch('/api/me').send({})).status).toBe(400);
    });

    it('returns 401 from PATCH /api/me without a session', async () => {
      const res = await request(app).patch('/api/me').send({ locale: 'nl' });
      expect(res.status).toBe(401);
    });
  });

  describe('password change', () => {
    it('keeps the current session and can revoke the others', async () => {
      const { agent, email } = await registerTestUser(app);
      const otherDevice = await signInTestUser(app, email);
      expect((await otherDevice.get('/api/me')).status).toBe(200);

      const res = await agent.post('/api/auth/change-password').set('Origin', TEST_ORIGIN).send({
        currentPassword: 'password123',
        newPassword: 'a-brand-new-password',
        revokeOtherSessions: true,
      });

      expect(res.status).toBe(200);
      // This is what "log out everywhere" now means, in place of tokenVersion.
      expect((await agent.get('/api/me')).status).toBe(200);
      expect((await otherDevice.get('/api/me')).status).toBe(401);
    });

    it('rejects the wrong current password and leaves the session usable', async () => {
      const { agent } = await registerTestUser(app);

      const res = await agent
        .post('/api/auth/change-password')
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: 'not-the-password', newPassword: 'a-brand-new-password' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await agent.get('/api/me')).status).toBe(200);
    });
  });

  describe('account deletion', () => {
    function deleteAccount(agent: Awaited<ReturnType<typeof signInTestUser>>, password: string) {
      return agent.post('/api/auth/delete-user').set('Origin', TEST_ORIGIN).send({ password });
    }

    it('rejects deletion with the wrong password and keeps the account', async () => {
      const { agent } = await registerTestUser(app);

      const res = await deleteAccount(agent, 'not-the-password');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await agent.get('/api/me')).status).toBe(200);
    });

    it('takes the family, its recipes and its sessions with the last member', async () => {
      const { agent } = await registerTestUser(app);
      await agent
        .post('/api/recipes')
        .send({ title: 'Only Mine', servings: 1, tags: ['solo'], category: 'dinner' });

      const res = await deleteAccount(agent, 'password123');
      expect(res.status).toBe(200);

      const counts = await pool.query<Record<string, string>>(
        'SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM families) f, (SELECT count(*) FROM recipes) r, (SELECT count(*) FROM tags) t, (SELECT count(*) FROM categories) c, (SELECT count(*) FROM sessions) s, (SELECT count(*) FROM accounts) a'
      );
      expect(counts.rows[0]).toEqual({
        u: '0',
        f: '0',
        r: '0',
        t: '0',
        c: '0',
        s: '0',
        a: '0',
      });
    });
  });
});
