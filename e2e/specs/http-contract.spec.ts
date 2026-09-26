// The HTTP surface that is part of the contract: better-auth's own endpoints, the health check,
// and the auth-gated /uploads file server. The app's JSON API is an implementation detail, so it
// is deliberately not tested here.
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import path from 'node:path';
import { E2E_ROOT } from '../support/env.ts';
import { expect, test } from '../support/fixtures.ts';
import { DEFAULT_PASSWORD, uniqueEmail } from '../support/users.ts';

const DISH_JPG = path.join(E2E_ROOT, 'fakes/fixtures/dish.jpg');

function origin(baseURL: string) {
  return { Origin: new URL(baseURL).origin };
}

async function sessionUser(request: APIRequestContext): Promise<{ email: string } | null> {
  const res = await request.get('/api/auth/get-session');
  expect(res.status()).toBe(200);
  const text = await res.text();
  if (!text || text === 'null') return null;
  const body = JSON.parse(text) as { user?: { email: string } } | null;
  return body?.user ?? null;
}

function expectNotOk(res: APIResponse) {
  expect(res.status(), `expected a refusal, got ${res.status()}`).toBeGreaterThanOrEqual(400);
}

/** Uploads a photo through the recipe edit page and returns the stored /uploads/... path. */
async function uploadPhotoViaUi(
  page: Page,
  recipeId: number,
  imagePath: (id: number) => Promise<string | null>
): Promise<string> {
  await page.goto(`/recipes/${recipeId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(/\S/);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload recipe photo' }).click();
  await (await chooser).setFiles(DISH_JPG);
  await expect.poll(() => imagePath(recipeId), { timeout: 20_000 }).not.toBeNull();
  const stored = (await imagePath(recipeId))!;
  expect(stored).toMatch(new RegExp(`^/uploads/recipes/${recipeId}/`));
  return stored;
}

test.describe('better-auth endpoints', () => {
  test('sign-up returns the user and sets a session cookie', async ({ request, baseURL }) => {
    const email = uniqueEmail('contract');
    const res = await request.post('/api/auth/sign-up/email', {
      headers: origin(baseURL!),
      data: { email, password: DEFAULT_PASSWORD, name: email },
    });

    expect(res.status()).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.email).toBe(email);
    expect(body.user.id).toBeTruthy();
    const cookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    expect(cookies.some((c) => /session/i.test(c) && /httponly/i.test(c))).toBe(true);

    expect(await sessionUser(request)).toMatchObject({ email });
  });

  test('get-session is empty without a session', async ({ request }) => {
    expect(await sessionUser(request)).toBeNull();
  });

  test('sign-in with a wrong password is 401 and starts no session', async ({
    request,
    baseURL,
    user,
  }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      headers: origin(baseURL!),
      data: { email: user.email, password: 'not-the-password' },
    });
    expect(res.status()).toBe(401);
    expect(await sessionUser(request)).toBeNull();
  });

  test('sign-in with the right password starts a session', async ({ request, baseURL, user }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      headers: origin(baseURL!),
      data: { email: user.email, password: user.password },
    });
    expect(res.status()).toBe(200);
    expect(await sessionUser(request)).toMatchObject({ email: user.email });
  });

  test('sign-out ends the session', async ({ page, baseURL, user }) => {
    expect(await sessionUser(page.request)).toMatchObject({ email: user.email });

    const res = await page.request.post('/api/auth/sign-out', { headers: origin(baseURL!) });
    expect(res.ok()).toBe(true);

    expect(await sessionUser(page.request)).toBeNull();
    await page.goto('/settings');
    await expect(page).toHaveURL('/login');
  });

  test('a state-changing call without an Origin header is rejected', async ({ page, user }) => {
    const res = await page.request.post('/api/auth/sign-out');
    expectNotOk(res);
    expect(await sessionUser(page.request)).toMatchObject({ email: user.email });
  });

  test('a state-changing call from a foreign Origin is rejected', async ({ request, user }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      headers: { Origin: 'http://evil.example' },
      data: { email: user.email, password: user.password },
    });
    expect(res.status()).toBe(403);
    expect(await sessionUser(request)).toBeNull();
  });
});

test('the health check answers 200', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
});

test.describe('recipe photo files', () => {
  test('are served to the owner, and to nobody without a session or in another family', async ({
    page,
    user,
    db,
    playwright,
    baseURL,
    newSession,
  }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Photo Contract Pie' });
    const photo = await uploadPhotoViaUi(page, recipeId, (id) => db.recipeImagePath(id));

    const owner = await page.request.get(photo);
    expect(owner.status()).toBe(200);
    expect(owner.headers()['content-type']).toMatch(/^image\//);

    const anonymous = await playwright.request.newContext({ baseURL });
    try {
      const res = await anonymous.get(photo);
      expect([401, 404]).toContain(res.status());
    } finally {
      await anonymous.dispose();
    }

    const stranger = await newSession();
    const res = await stranger.page.request.get(photo);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('path traversal out of the uploads directory is refused', async ({ page, user, db }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Traversal Tart' });
    const attempts = [
      '/uploads/recipes/..%2F..%2Fetc/passwd',
      '/uploads/recipes/..%2F..%2F..%2F..%2F..%2Fetc%2Fpasswd',
      `/uploads/recipes/${recipeId}/..%2F..%2F..%2F..%2Fetc%2Fpasswd`,
      `/uploads/recipes/${recipeId}/%2e%2e%2f%2e%2e%2f%2e%2e%2fpackage.json`,
      `/uploads/recipes/${recipeId}/....//....//etc/passwd`,
      '/uploads/..%2Fpublic/index.html',
    ];
    for (const attempt of attempts) {
      const res = await page.request.get(attempt);
      expect(res.ok(), `${attempt} → ${res.status()}`).toBe(false);
      expect(await res.text()).not.toContain('root:');
    }
  });
});
