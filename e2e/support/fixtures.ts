import { randomUUID } from 'node:crypto';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { Db } from './db.ts';
import { env } from './env.ts';
import { FakesClient } from './fakes-client.ts';
import { signUpViaApi, uniqueEmail, type TestUser } from './users.ts';

export interface UserSession {
  page: Page;
  context: BrowserContext;
  user: TestUser;
}

interface Fixtures {
  db: Db;
  fakes: FakesClient;
  /** A token unique to this test, for keying scripted fake responses. */
  key: string;
  /** Signs a fresh user in on the default `page`. */
  user: TestUser;
  /** Opens another browser context (another person, or another device) signed in as a new user —
   * or, with `existing`, as a user who already exists. */
  newSession: (existing?: { email: string; password: string }) => Promise<UserSession>;
}

interface WorkerFixtures {
  dbPool: pg.Pool;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  dbPool: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 3 });
      await use(pool);
      await pool.end();
    },
    { scope: 'worker' },
  ],

  db: async ({ dbPool }, use) => {
    await use(new Db(dbPool));
  },

  // eslint-disable-next-line no-empty-pattern
  fakes: async ({}, use) => {
    await use(new FakesClient());
  },

  // eslint-disable-next-line no-empty-pattern
  key: async ({}, use) => {
    await use(`e2ek${randomUUID().slice(0, 8)}`);
  },

  user: async ({ page, baseURL, db }, use) => {
    const created = await signUpViaApi(page.request, baseURL!);
    await use({ ...created, familyId: await db.familyIdOf(created.id) });
  },

  newSession: async ({ browser, baseURL, db }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (existing) => {
      const context = await browser.newContext({
        baseURL,
        locale: 'en-US',
        serviceWorkers: 'block',
      });
      contexts.push(context);
      const page = await context.newPage();
      let created: { id: string; email: string; password: string };
      if (existing) {
        await page.goto('/login');
        await page.getByLabel('Email').fill(existing.email);
        await page.getByLabel('Password').fill(existing.password);
        await page.getByRole('button', { name: 'Log in' }).click();
        await expect(page).not.toHaveURL(/\/login/);
        const session = await page.request.get('/api/auth/get-session');
        const { user } = (await session.json()) as { user: { id: string } };
        created = { id: user.id, ...existing };
      } else {
        created = await signUpViaApi(page.request, baseURL!, uniqueEmail());
      }
      return {
        page,
        context,
        user: { ...created, familyId: await db.familyIdOf(created.id) },
      };
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };
