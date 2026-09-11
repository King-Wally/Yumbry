import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { resetTestDatabase } from './helpers/db.js';
import { TEST_ORIGIN } from './helpers/auth.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
const isEmailConfigured = vi.fn().mockReturnValue(true);
vi.mock('../src/services/email.service.js', () => ({
  sendPasswordResetEmail,
  isEmailConfigured: () => isEmailConfigured(),
}));

// The express apiRateLimiter keys by IP (app.ts sets `trust proxy: 1`, so
// X-Forwarded-For is honored). Each test gets its own fake IP so it can't be
// starved by quota another test already spent.
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

  beforeEach(async () => {
    sendPasswordResetEmail.mockClear();
    isEmailConfigured.mockReturnValue(true);
    await pool.query('TRUNCATE users, sessions, accounts, verifications, families CASCADE');
  });

  function signUp(email: string, ip: string, password = 'password123') {
    return request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email, password, name: email });
  }

  function requestReset(email: string, ip: string) {
    return request(app)
      .post('/api/auth/request-password-reset')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email });
  }

  function submitReset(token: string, newPassword: string, ip: string) {
    return request(app)
      .post('/api/auth/reset-password')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ token, newPassword });
  }

  function signIn(email: string, password: string, ip: string) {
    return request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email, password });
  }

  /** The raw token only ever exists in the email we send, so the mock is the
   * only place a test can read it — same trick as before the better-auth move. */
  function lastEmailedToken(): string {
    return sendPasswordResetEmail.mock.calls.at(-1)?.[1] as string;
  }

  it('emails a reset token for a registered address', async () => {
    const ip = nextIp();
    await signUp('gina@example.com', ip);

    const res = await requestReset('gina@example.com', ip);

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('gina@example.com', expect.any(String));
  });

  it('does not reveal whether an unknown address is registered', async () => {
    const ip = nextIp();

    const res = await requestReset('nobody@example.com', ip);

    // Same success-shaped response as a registered address, and no email out.
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('quietly does nothing when email is not configured', async () => {
    const ip = nextIp();
    await signUp('nomail@example.com', ip);
    isEmailConfigured.mockReturnValue(false);

    const res = await requestReset('nomail@example.com', ip);

    // A self-hoster without Resend must still get a success response, not a 500.
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('lets the emailed token set a new password', async () => {
    const ip = nextIp();
    await signUp('hana@example.com', ip);
    await requestReset('hana@example.com', ip);

    const res = await submitReset(lastEmailedToken(), 'brand-new-password', ip);
    expect(res.status).toBe(200);

    const withNew = await signIn('hana@example.com', 'brand-new-password', ip);
    expect(withNew.status).toBe(200);

    const withOld = await signIn('hana@example.com', 'password123', ip);
    expect(withOld.status).toBe(401);
  });

  it('refuses a token that has already been used', async () => {
    const ip = nextIp();
    await signUp('ivan@example.com', ip);
    await requestReset('ivan@example.com', ip);
    const token = lastEmailedToken();

    await submitReset(token, 'first-new-password', ip);
    const second = await submitReset(token, 'second-new-password', ip);

    expect(second.status).toBeGreaterThanOrEqual(400);
    // The first reset still stands.
    const signedIn = await signIn('ivan@example.com', 'first-new-password', ip);
    expect(signedIn.status).toBe(200);
  });

  it('refuses an expired token', async () => {
    const ip = nextIp();
    await signUp('jo@example.com', ip);
    await requestReset('jo@example.com', ip);
    const token = lastEmailedToken();

    // better-auth keeps reset tokens in `verifications`; age the row past its TTL
    // rather than waiting an hour.
    await pool.query(`UPDATE verifications SET expires_at = now() - interval '1 hour'`);

    const res = await submitReset(token, 'too-late-password', ip);
    expect(res.status).toBeGreaterThanOrEqual(400);

    const signedIn = await signIn('jo@example.com', 'password123', ip);
    expect(signedIn.status).toBe(200);
  });

  it('refuses a token that was never issued', async () => {
    const ip = nextIp();
    await signUp('kim@example.com', ip);

    const res = await submitReset('not-a-real-token', 'whatever-password', ip);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('revokes existing sessions when the password is reset', async () => {
    const ip = nextIp();
    await signUp('lena@example.com', ip);

    // A session established before the reset, on its own agent.
    const agent = request.agent(app);
    await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email: 'lena@example.com', password: 'password123' });
    expect((await agent.get('/api/me')).status).toBe(200);

    await requestReset('lena@example.com', ip);
    await submitReset(lastEmailedToken(), 'rotated-password', ip);

    // revokeSessionsOnPasswordReset is what replaces the old tokenVersion bump.
    expect((await agent.get('/api/me')).status).toBe(401);
  });
});
