import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/services/email.service.js', () => ({ sendPasswordResetEmail }));

// loginRateLimiter/forgotPasswordRateLimiter key by IP (app.ts sets `trust
// proxy: 1`, so X-Forwarded-For is honored). Each test below is given its own
// fake IP so it can't be starved by rate-limit quota another test already
// spent — only the dedicated rate-limit test intentionally reuses one IP.
let ipCounter = 1;
function nextIp(): string {
  return `10.99.0.${ipCounter++}`;
}

// These integration tests need a real, disposable Postgres database. Set
// TEST_DATABASE_URL (see README) to run them; otherwise they're skipped.
describe.skipIf(!TEST_DATABASE_URL)('password reset API', () => {
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

  beforeEach(() => {
    sendPasswordResetEmail.mockClear();
  });

  async function getResetToken(email: string, ip: string): Promise<string> {
    await request(app).post('/api/auth/forgot-password').set('X-Forwarded-For', ip).send({ email });
    const call = sendPasswordResetEmail.mock.calls.at(-1);
    return call?.[1] as string;
  }

  it('sends a reset email for a registered address and returns the generic message', async () => {
    const ip = nextIp();
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'gina@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', ip)
      .send({ email: 'gina@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'If that email is registered, a reset link has been sent.',
    });
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('gina@example.com', expect.any(String));
  });

  it('returns the identical generic message for an unregistered address without sending email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'nobody-here@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'If that email is registered, a reset link has been sent.',
    });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed forgot-password body', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('resets the password, auto-logs in, and invalidates the old password', async () => {
    const ip = nextIp();
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'harry@example.com', password: 'password123' });

    const token = await getResetToken('harry@example.com', ip);

    const agent = request.agent(app);
    const reset = await agent
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token, password: 'newpassword456' });

    expect(reset.status).toBe(200);
    expect(reset.headers['set-cookie']).toBeDefined();

    const me = await agent.get('/api/auth/me').set('X-Forwarded-For', ip);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'harry@example.com' });

    const oldPasswordLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'harry@example.com', password: 'password123' });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'harry@example.com', password: 'newpassword456' });
    expect(newPasswordLogin.status).toBe(200);
  });

  it('invalidates the pre-reset JWT after a password reset', async () => {
    const ip = nextIp();
    const register = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'mia@example.com', password: 'password123' });

    const rawCookie = (register.headers['set-cookie'] as unknown as string[])?.find((c) =>
      c.startsWith('token=')
    );
    expect(rawCookie).toBeDefined();

    const token = await getResetToken('mia@example.com', ip);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token, password: 'newpassword456' });
    expect(reset.status).toBe(200);

    const replayOld = await request(app)
      .get('/api/auth/me')
      .set('Cookie', rawCookie as string)
      .set('X-Forwarded-For', ip);
    expect(replayOld.status).toBe(401);

    const newCookie = (reset.headers['set-cookie'] as unknown as string[])?.find((c) =>
      c.startsWith('token=')
    );
    expect(newCookie).toBeDefined();
    const replayNew = await request(app)
      .get('/api/auth/me')
      .set('Cookie', newCookie as string)
      .set('X-Forwarded-For', ip);
    expect(replayNew.status).toBe(200);
  });

  it('rejects an unknown reset token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', nextIp())
      .send({ token: 'not-a-real-token', password: 'newpassword456' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired reset token', async () => {
    const ip = nextIp();
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'irene@example.com', password: 'password123' });

    const token = await getResetToken('irene@example.com', ip);
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await pool.query(
      `UPDATE password_reset_tokens SET expires_at = now() - interval '1 hour' WHERE token_hash = $1`,
      [tokenHash]
    );

    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token, password: 'newpassword456' });
    expect(res.status).toBe(400);
  });

  it('rejects reusing an already-used reset token', async () => {
    const ip = nextIp();
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'jack@example.com', password: 'password123' });

    const token = await getResetToken('jack@example.com', ip);

    const first = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token, password: 'newpassword456' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token, password: 'anotherpassword789' });
    expect(second.status).toBe(400);
  });

  it('rejects a too-short new password', async () => {
    const ip = nextIp();
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'kate@example.com', password: 'password123' });

    const token = await getResetToken('kate@example.com', ip);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', ip)
      .send({ token, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rate-limits repeated forgot-password requests', async () => {
    const ip = nextIp();
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email: 'liam@example.com', password: 'password123' });

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', ip)
        .send({ email: 'liam@example.com' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
