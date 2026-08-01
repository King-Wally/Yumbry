import request from 'supertest';
import type { Express } from 'express';

let counter = 0;

type TestAgent = ReturnType<typeof request.agent>;

/** Registers a fresh user and returns an agent that carries their auth cookie
 * across requests, for tests that exercise the now-protected /api/* routes. */
export async function registerTestUser(
  app: Express,
  email = `user${counter++}@example.com`
): Promise<{ agent: TestAgent; userId: number; email: string }> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password: 'password123' });
  return { agent, userId: res.body.id as number, email };
}
