import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';

export const DEFAULT_PASSWORD = 'correct-horse-battery';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  familyId: number;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@e2e.test`;
}

/** better-auth rejects state-changing calls without an Origin matching its base URL; browsers send
 * one automatically, Playwright's request context does not. */
function originHeader(baseURL: string) {
  return { Origin: new URL(baseURL).origin };
}

/**
 * Signs up through better-auth's own endpoint, which survives the migration unchanged. Called
 * with `page.request`, the session cookie lands in that page's browser context.
 */
export async function signUpViaApi(
  request: APIRequestContext,
  baseURL: string,
  email = uniqueEmail(),
  password = DEFAULT_PASSWORD
): Promise<{ id: string; email: string; password: string }> {
  const res = await request.post('/api/auth/sign-up/email', {
    headers: originHeader(baseURL),
    data: { email, password, name: email },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, email, password };
}

export async function signInViaApi(
  request: APIRequestContext,
  baseURL: string,
  email: string,
  password = DEFAULT_PASSWORD
): Promise<void> {
  const res = await request.post('/api/auth/sign-in/email', {
    headers: originHeader(baseURL),
    data: { email, password },
  });
  expect(res.ok(), `sign-in failed: ${res.status()}`).toBe(true);
}
