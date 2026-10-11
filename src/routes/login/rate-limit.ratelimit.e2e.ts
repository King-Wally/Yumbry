// Runs only in the 'ratelimit' project: an app with its rate limits switched on (every other
// server has them off, since all browsers in a run share one address). The limiters count per
// client address, so every test here spends a different one.
import { expect, test } from '../../e2e/support/fixtures.ts';
import { uniqueEmail } from '../../e2e/support/users.ts';

test.describe.configure({ mode: 'serial' });

const REFUSAL = 'Too many attempts. Try again later.';

test('signing in is refused after too many attempts', async ({ page }) => {
	const email = uniqueEmail('ratelimit-login');
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();

	// The sign-in limit is 10 per 15 minutes. Failed attempts count too.
	for (let attempt = 0; attempt < 11; attempt += 1) {
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password', { exact: true }).fill('not-the-password');
		await page.getByRole('button', { name: 'Log in' }).click();
		if (await page.getByText(REFUSAL).isVisible()) break;
		await expect(page.getByText(/invalid|login failed|too many/i)).toBeVisible();
	}
	await expect(page.getByText(REFUSAL)).toBeVisible();
});

test('asking for a password reset is refused after too many requests', async ({ page }) => {
	await page.goto('/forgot-password');
	await expect(page.getByRole('heading', { name: 'Forgot password' })).toBeVisible();

	// The request limit is 5 per 15 minutes.
	for (let attempt = 0; attempt < 6; attempt += 1) {
		await page.goto('/forgot-password');
		await page.getByLabel('Email').fill(uniqueEmail('ratelimit-reset'));
		await page.getByRole('button', { name: 'Send reset link' }).click();
		await expect(
			page.getByRole('heading', { name: 'Check your email' }).or(page.getByText(REFUSAL))
		).toBeVisible();
	}
	await expect(page.getByText(REFUSAL)).toBeVisible();
});
