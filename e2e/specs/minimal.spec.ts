// Runs only in the 'minimal' project: the same app with no AI key and no email configured. Every
// AI and email entry point must disappear rather than offer something that can only fail.
import { type Page } from '@playwright/test';
import { openAddRecipeMenu } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';

/** Absence checks pass trivially before the page has learned what the server offers; let every
 * request (feature/config lookups included) settle first. */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

test.describe('an install without AI or email', () => {
  test('the Add recipe menu offers no AI entries', async ({ page, user }) => {
    void user;
    await page.goto('/');
    await openAddRecipeMenu(page);

    await expect(page.getByRole('link', { name: 'Manually', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Paste URL', exact: true })).toBeVisible();
    await settled(page);
    await expect(page.getByRole('link', { name: 'From a photo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Create with AI', exact: true })).toHaveCount(0);
  });

  test('a recipe offers no Improve with AI action', async ({ page, user, db }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Minimal Omelette' });
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Minimal Omelette', level: 1 })).toBeVisible();

    // The actions sit inline on wide screens and behind "Menu" on narrow ones.
    await expect(page.getByRole('link', { name: 'Edit', exact: true }).first()).toBeAttached();
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible()) await menu.click();
    await expect(
      page.getByRole('link', { name: 'Edit', exact: true }).filter({ visible: true })
    ).toBeVisible();
    await settled(page);
    await expect(page.getByRole('link', { name: 'Improve with AI' })).toHaveCount(0);
  });

  test('the recipe form has no Estimate with AI button', async ({ page, user }) => {
    void user;
    await page.goto('/recipes/new');
    await expect(page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible();
    await settled(page);
    await expect(page.getByRole('button', { name: 'Estimate with AI' })).toHaveCount(0);
  });

  test('Settings has no AI usage card', async ({ page, user }) => {
    void user;
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'JSON import/export' })).toBeVisible();
    await settled(page);
    await expect(page.getByRole('heading', { name: 'AI usage' })).toHaveCount(0);
  });

  test('the login page has no Forgot your password? link', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await settled(page);
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveCount(0);
  });
});
