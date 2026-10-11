import { expect, test } from '../../e2e/support/fixtures.ts';
import { DEFAULT_PASSWORD, uniqueEmail } from '../../e2e/support/users.ts';

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

	test('a password that is too short is refused and no account is made', async ({ page, db }) => {
		const email = uniqueEmail('shortpw');
		await page.goto('/register');
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password (min. 8 characters)').fill('short');
		await page.getByRole('button', { name: 'Register' }).click();

		await expect(page).toHaveURL('/register');
		// The browser's own validation blocks the submit before any request is made.
		await expect(page.getByLabel('Password (min. 8 characters)')).toHaveJSProperty(
			'validity.tooShort',
			true
		);
		expect(await db.userExists(email)).toBe(false);
	});

	test('an invalid email is refused and no account is made', async ({ page }) => {
		await page.goto('/register');
		await page.getByLabel('Email').fill('not-an-email');
		await page.getByLabel('Password (min. 8 characters)').fill(DEFAULT_PASSWORD);
		await page.getByRole('button', { name: 'Register' }).click();

		await expect(page).toHaveURL('/register');
		await expect(page.getByRole('heading', { name: 'Welcome to Yumbry' })).toBeHidden();
	});
});
