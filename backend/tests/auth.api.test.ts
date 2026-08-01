import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import type { Express } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
describe.skipIf(!TEST_DATABASE_URL)('auth API', () => {
  let app: Express;
  let pool: pg.Pool;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    await runner({
      databaseUrl: TEST_DATABASE_URL,
      dir: path.join(__dirname, '../migrations'),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: () => {},
    });

    ({ app } = await import('../src/app.js'));
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registers a new user and sets an auth cookie', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'alice@example.com' });
    expect(res.headers['set-cookie']).toBeDefined();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'alice@example.com' });
  });

  it('rejects registering the same email twice', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'bob@example.com', password: 'password123' });

    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects registration with a short password', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'shortpw@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const registerAgent = request.agent(app);
    await registerAgent
      .post('/api/auth/register')
      .send({ email: 'carol@example.com', password: 'password123' });

    const wrongPasswordAgent = request.agent(app);
    const wrongPassword = await wrongPasswordAgent
      .post('/api/auth/login')
      .send({ email: 'carol@example.com', password: 'wrong-password' });
    expect(wrongPassword.status).toBe(401);

    const unknownEmailAgent = request.agent(app);
    const unknownEmail = await unknownEmailAgent
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(unknownEmail.status).toBe(401);

    const agent = request.agent(app);
    const correct = await agent
      .post('/api/auth/login')
      .send({ email: 'carol@example.com', password: 'password123' });
    expect(correct.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'carol@example.com' });
  });

  it('logs out and clears the auth cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'dave@example.com', password: 'password123' });

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(204);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('returns 401 from /api/auth/me without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rate-limits repeated login attempts', async () => {
    const setupAgent = request.agent(app);
    await setupAgent
      .post('/api/auth/register')
      .send({ email: 'ratelimited@example.com', password: 'password123' });

    let lastStatus = 0;
    for (let i = 0; i < 15; i++) {
      const agent = request.agent(app);
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'ratelimited@example.com', password: 'wrong-password' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
