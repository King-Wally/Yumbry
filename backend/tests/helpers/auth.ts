import request from 'supertest';
import type { Express } from 'express';

let counter = 0;
let ipCounter = 0;

type TestAgent = ReturnType<typeof request.agent>;

/** Registers a fresh user and returns an agent that carries their auth cookie
 * across requests, for tests that exercise the now-protected /api/* routes.
 *
 * Registration goes through loginRateLimiter, so each call presents its own
 * fake client IP — a file that registers more than ten users would otherwise
 * start getting 429s and silently hand back agents with no session cookie. */
export async function registerTestUser(
  app: Express,
  email = `user${counter++}@example.com`
): Promise<{ agent: TestAgent; userId: number; email: string }> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .set('X-Forwarded-For', `10.97.${Math.floor(ipCounter / 256) % 256}.${ipCounter++ % 256}`)
    .send({ email, password: 'password123' });
  return { agent, userId: res.body.id as number, email };
}
