import { logIn, logOut } from '../../e2e/support/app.ts';
import { expect, test } from '../../e2e/support/fixtures.ts';

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
