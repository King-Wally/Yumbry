import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { DEFAULT_PASSWORD, uniqueEmail } from '../support/users.ts';

async function registerViaUi(page: Page): Promise<string> {
  const email = uniqueEmail('onboarding');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password (min. 8 characters)').fill(DEFAULT_PASSWORD);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByRole('heading', { name: 'Welcome to Yumbry' })).toBeVisible();
  return email;
}

test.describe('onboarding', () => {
  test('a new account walks through the steps and finishes on the recipe list', async ({
    page,
    db,
  }) => {
    const email = await registerViaUi(page);
    const next = page.getByRole('button', { name: 'Next' });

    // Step 1: a language must be chosen before moving on.
    await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();
    const total = Number(
      (await page.getByText(/^Step 1 of \d+$/).textContent())!.match(/\d+$/)![0]
    );
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(next).toBeEnabled();
    await next.click();

    // Step 2: the ways to add a recipe.
    await expect(page.getByRole('heading', { name: 'Ways to add a recipe' })).toBeVisible();
    await expect(page.getByText(`Step 2 of ${total}`)).toBeVisible();
    await expect(page.getByText('Write it manually')).toBeVisible();

    // Back returns to the previous step, keeping the chosen language.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Yumbry' })).toBeVisible();
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByRole('heading', { name: 'Ways to add a recipe' })).toBeVisible();
    await next.click();

    // Step 3: the family, with the new user's own invite link.
    await expect(page.getByRole('heading', { name: 'Cook together' })).toBeVisible();
    await expect(page.getByText(`Step 3 of ${total}`)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByLabel('Invite link')).toHaveValue(/\/join-family\/[^/]+$/);

    // Any remaining steps before the last (e.g. installing the app) just move on.
    for (let step = 4; step < total; step += 1) {
      await next.click();
      await expect(page.getByText(`Step ${step} of ${total}`)).toBeVisible();
    }
    await next.click();

    // Last step: no counter, one call to action.
    await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
    await expect(page.getByText(/^Step \d+ of \d+$/)).toBeHidden();
    await page.getByRole('button', { name: 'Start cooking' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('No recipes yet. Try importing or adding one.')).toBeVisible();
    const userId = await currentUserId(page);
    expect(await db.userLocale(userId)).toBe('en');
  });

  test('picking a language switches the flow to it at once and saves it', async ({ page, db }) => {
    await registerViaUi(page);
    await page.getByRole('button', { name: 'Nederlands' }).click();

    await expect(page.getByRole('heading', { name: 'Welkom bij Yumbry' })).toBeVisible();
    await expect(page.getByText(/^Stap 1 van \d+$/)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await page.getByRole('button', { name: 'Volgende' }).click();
    await expect(
      page.getByRole('heading', { name: 'Manieren om een recept toe te voegen' })
    ).toBeVisible();

    const userId = await currentUserId(page);
    await expect.poll(() => db.userLocale(userId)).toBe('nl');
  });
});

/** The signed-in user's id, from better-auth's session endpoint (which stays HTTP). */
async function currentUserId(page: Page): Promise<string> {
  const res = await page.request.get('/api/auth/get-session');
  const { user } = (await res.json()) as { user: { id: string } };
  return user.id;
}
