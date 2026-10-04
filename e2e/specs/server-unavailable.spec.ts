import { expect, test } from '../support/fixtures.ts';

test.describe('server unavailable', () => {
  test('covers the app while the backend is unreachable and recovers on retry', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Yumbry' }).first()).toBeVisible();

    // Simulates a dead server: the page itself still loads (as the PWA shell would), every API call fails.
    await page.route('**/api/**', (route) => route.abort());
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Temporarily offline' })).toBeVisible();
    await expect(page.getByText('Please try again in a few minutes.')).toBeVisible();

    await page.unroute('**/api/**');
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { name: 'Temporarily offline' })).toBeHidden();
  });
});
