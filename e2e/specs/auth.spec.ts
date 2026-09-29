import { logIn, logOut } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';
import { DEFAULT_PASSWORD, uniqueEmail } from '../support/users.ts';

test.describe('registration', () => {
  test('a new account lands on onboarding', async ({ page, db }) => {
    const email = uniqueEmail('register');
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password (min. 8 characters)').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page).toHaveURL('/onboarding');
    await expect(page.getByRole('heading', { name: 'Welcome to Yumbry' })).toBeVisible();
    expect(await db.userExists(email)).toBe(true);
  });

  test('registering an email that is taken shows an error', async ({ page, user }) => {
    await page.context().clearCookies();
    await page.goto('/register');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password (min. 8 characters)').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page).toHaveURL('/register');
    await expect(page.getByText(/already exists|registration failed/i)).toBeVisible();
  });
});

test.describe('signing in and out', () => {
  test('a protected deep link returns there after logging in', async ({ page, user, db }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Deep Link Stew' });
    await page.context().clearCookies();

    await page.goto(`/recipes/${recipeId}`);
    await expect(page).toHaveURL('/login');

    await logIn(page, user.email, user.password);
    await expect(page).toHaveURL(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Deep Link Stew' })).toBeVisible();
  });

  test('a wrong password is rejected', async ({ page, user }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await logIn(page, user.email, 'not-the-password');

    await expect(page).toHaveURL('/login');
    await expect(page.getByText(/invalid|login failed/i)).toBeVisible();
  });

  test('logging out ends the session', async ({ page, user }) => {
    void user;
    await page.goto('/');
    await logOut(page);

    await page.goto('/settings');
    await expect(page).toHaveURL('/login');
  });

  test('visiting /login while signed in goes home', async ({ page, user }) => {
    void user;
    await page.goto('/login');
    await expect(page).toHaveURL('/');
  });
});

test.describe('password reset', () => {
  test('the emailed link sets a new password and signs out other sessions', async ({
    page,
    user,
    fakes,
    newSession,
  }) => {
    // A second device that is signed in before the reset.
    const other = await newSession({ email: user.email, password: user.password });
    await page.context().clearCookies();

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL('/forgot-password');
    // Wait for the new page itself: the URL changes before the old page unmounts.
    await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const link = await fakes.resetLinkFor(user.email);
    const url = new URL(link);
    expect(url.pathname).toBe('/reset-password');

    await page.goto(`${url.pathname}${url.search}`);
    const newPassword = 'a-brand-new-password';
    await page.getByLabel('New password (min. 8 characters)').fill(newPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page).toHaveURL('/login');

    await logIn(page, user.email, user.password);
    await expect(page.getByText(/invalid|login failed/i)).toBeVisible();

    await logIn(page, user.email, newPassword);
    await expect(page).toHaveURL('/');

    await other.page.goto('/settings');
    await expect(other.page).toHaveURL('/login');
  });

  test('an unknown email still shows the same confirmation and sends nothing', async ({
    page,
    fakes,
  }) => {
    const email = uniqueEmail('nobody');
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(await fakes.emailsTo(email)).toHaveLength(0);
  });

  test('a reset link without a token is reported as invalid', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Invalid link' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  });

  test('a made-up token is refused', async ({ page }) => {
    await page.goto('/reset-password?token=not-a-real-token');
    await page.getByLabel('New password (min. 8 characters)').fill('whatever-password');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByText(/invalid|expired|reset failed/i)).toBeVisible();
  });
});
