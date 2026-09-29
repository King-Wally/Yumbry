import type { Page } from '@playwright/test';
import { logIn, logOut, openAddRecipeMenu } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';

async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page.getByLabel('Current password')).toBeVisible();
}

test.describe('language', () => {
  test('choosing Nederlands switches the UI at once and sticks across reloads and logins', async ({
    page,
    user,
    db,
    newSession,
  }) => {
    await openSettings(page);
    await page.getByLabel('Language').selectOption({ label: 'Nederlands' });

    // The page itself switches without a reload.
    await expect(page.getByLabel('Huidig wachtwoord')).toBeVisible();
    await expect(page.getByText('Taal opgeslagen.')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    expect(await db.userLocale(user.id)).toBe('nl');

    await page.reload();
    await expect(page.getByLabel('Huidig wachtwoord')).toBeVisible();
    await expect(page.getByLabel('Taal')).toHaveValue('nl');

    // A fresh browser (English by default) picks the preference up on login.
    const other = await newSession({ email: user.email, password: user.password });
    await other.page.goto('/settings');
    await expect(other.page.getByLabel('Huidig wachtwoord')).toBeVisible();
    await expect(other.page.getByRole('button', { name: 'Recept toevoegen' })).toBeVisible();

    await page.getByLabel('Taal').selectOption({ label: 'English' });
    await expect(page.getByLabel('Current password')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await db.userLocale(user.id)).toBe('en');
  });
});

test.describe('change password', () => {
  test('mismatched new passwords are flagged and cannot be submitted', async ({ page, user }) => {
    await openSettings(page);
    await page.getByLabel('Current password').fill(user.password);
    await page.getByLabel('New password', { exact: true }).fill('first-new-password');
    await page.getByLabel('Confirm new password').fill('second-new-password');

    await expect(page.getByText("The passwords don't match.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save password' })).toBeDisabled();
  });

  test('a wrong current password is rejected', async ({ page, user, newSession }) => {
    await openSettings(page);
    await page.getByLabel('Current password').fill('not-the-password');
    await page.getByLabel('New password', { exact: true }).fill('a-brand-new-password');
    await page.getByLabel('Confirm new password').fill('a-brand-new-password');
    await page.getByRole('button', { name: 'Save password' }).click();

    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
    await expect(page.getByText('Password changed.')).toBeHidden();

    // The old password still works.
    const other = await newSession({ email: user.email, password: user.password });
    await expect(other.page).toHaveURL('/');
  });

  test('a new password signs out other sessions, keeps this one, and works for login', async ({
    page,
    user,
    newSession,
  }) => {
    const other = await newSession({ email: user.email, password: user.password });
    const newPassword = 'a-brand-new-password';

    await openSettings(page);
    await page.getByLabel('Current password').fill(user.password);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Password changed.')).toBeVisible();

    await other.page.goto('/settings');
    await expect(other.page).toHaveURL('/login');

    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');
    await expect(page.getByLabel('Current password')).toBeVisible();

    await logOut(page);
    await logIn(page, user.email, user.password);
    await expect(page.getByText(/invalid|login failed/i)).toBeVisible();
    await logIn(page, user.email, newPassword);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible();
  });
});

test.describe('JSON import/export', () => {
  /** Opens the header's Add recipe menu (unless it is already open) and reports whether it offers
   * the JSON-LD import. */
  async function addMenuOffersJsonImport(page: Page): Promise<boolean> {
    const manually = page.getByRole('link', { name: 'Manually', exact: true });
    if (!(await manually.isVisible())) await openAddRecipeMenu(page);
    await expect(manually).toBeVisible();
    return page.getByRole('link', { name: 'Import JSON-LD', exact: true }).isVisible();
  }

  test('the switch shows and hides "Import JSON-LD" in the Add recipe menu', async ({
    page,
    user,
  }) => {
    void user;
    const toggle = page.getByRole('switch', { name: 'Enable JSON import/export' });

    await openSettings(page);
    await expect(toggle).not.toBeChecked();
    expect(await addMenuOffersJsonImport(page)).toBe(false);

    await page.reload();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect.poll(() => addMenuOffersJsonImport(page)).toBe(true);

    await page.reload();
    await expect(toggle).toBeChecked();
    expect(await addMenuOffersJsonImport(page)).toBe(true);

    await page.reload();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.reload();
    await expect(toggle).not.toBeChecked();
    expect(await addMenuOffersJsonImport(page)).toBe(false);
  });
});

test.describe('delete account', () => {
  test('a wrong password deletes nothing', async ({ page, user, db }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Survivor Soup' });
    await openSettings(page);
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete account?' });
    await dialog.getByLabel('Confirm your password').fill('not-the-password');
    await dialog.getByRole('button', { name: 'Permanently delete account' }).click();

    await expect(dialog.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
    expect(await db.userExists(user.email)).toBe(true);
    expect(await db.recipeExists(recipeId)).toBe(true);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Survivor Soup' })).toBeVisible();
  });

  test('the correct password signs out and removes the account and its recipes', async ({
    page,
    user,
    db,
  }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Doomed Dumplings' });
    await openSettings(page);
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete account?' });
    await dialog.getByLabel('Confirm your password').fill(user.password);
    await dialog.getByRole('button', { name: 'Permanently delete account' }).click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(await db.userExists(user.email)).toBe(false);
    expect(await db.recipeExists(recipeId)).toBe(false);

    await page.goto('/settings');
    await expect(page).toHaveURL('/login');
    await logIn(page, user.email, user.password);
    await expect(page.getByText(/invalid|login failed/i)).toBeVisible();
  });
});
