import request from 'supertest';
import type { Express } from 'express';

let counter = 0;
let ipCounter = 0;

type TestAgent = ReturnType<typeof request.agent>;

/** better-auth rejects state-changing auth calls whose Origin is missing or
 * untrusted. Browsers always send one on same-origin requests; supertest never
 * does, so every auth POST in the tests has to set it explicitly. Must match
 * BETTER_AUTH_URL from vitest.config.ts. */
export const TEST_ORIGIN = 'http://localhost:3000';

/** Each request presents its own fake client IP so the process-wide
 * apiRateLimiter can't start handing back 429s partway through a file. */
function nextIp(): string {
  return `10.97.${Math.floor(ipCounter / 256) % 256}.${ipCounter++ % 256}`;
}

/** Registers a fresh user and returns an agent that carries their session cookie
 * across requests, for tests that exercise the protected /api/* routes. */
export async function registerTestUser(
  app: Express,
  email = `user${counter++}@example.com`
): Promise<{ agent: TestAgent; userId: string; email: string }> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', TEST_ORIGIN)
    .set('X-Forwarded-For', nextIp())
    // better-auth requires a name; the app has no name field, so the email
    // stands in for one — matching what RegisterPage sends.
    .send({ email, password: 'password123', name: email });
  return { agent, userId: res.body.user.id as string, email };
}

/** Signs an existing user in on a brand-new agent, for tests that need a second
 * concurrent session (checking that revocation reaches every device). */
export async function signInTestUser(
  app: Express,
  email: string,
  password = 'password123'
): Promise<TestAgent> {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/sign-in/email')
    .set('Origin', TEST_ORIGIN)
    .set('X-Forwarded-For', nextIp())
    .send({ email, password });
  return agent;
}
