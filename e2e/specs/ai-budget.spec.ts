import { type Page } from '@playwright/test';
import { USER_DAILY_BUDGET_USD } from '../support/env.ts';
import { expect, test } from '../support/fixtures.ts';

// Only ever books spend against a test's own users: exhausting the shared pool (addAiSpend(null))
// would block every other test running in parallel.

const USER_EXCEEDED = /You've used up your AI allowance for today\./;

async function sendCreatePrompt(page: Page, text: string): Promise<void> {
  await page.goto('/create-with-ai');
  await expect(page.getByRole('heading', { name: 'Create with AI', level: 1 })).toBeVisible();
  await page.getByPlaceholder("Tell the AI what you'd like to cook").fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function openAiUsage(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'AI usage' })).toBeVisible();
}

test.describe('per-user daily AI allowance', () => {
  test('a user who spent their allowance is refused, without reaching the AI', async ({
    page,
    user,
    db,
    fakes,
    key,
  }) => {
    await db.addAiSpend(user.id, USER_DAILY_BUDGET_USD);

    await sendCreatePrompt(page, `a quick curry ${key}`);

    await expect(page.getByText(USER_EXCEEDED)).toBeVisible();
    await expect(
      page.getByText('Your recipe will appear here once you start chatting.')
    ).toBeVisible();
    expect(await fakes.requests(key)).toHaveLength(0);
  });

  test('another user keeps their own allowance', async ({ user, db, fakes, key, newSession }) => {
    await db.addAiSpend(user.id, USER_DAILY_BUDGET_USD);
    const other = await newSession();
    await fakes.queueRecipe(key, { title: 'Unaffected Curry' });

    await sendCreatePrompt(other.page, `a quick curry ${key}`);

    await expect(
      other.page.getByRole('heading', { name: 'Unaffected Curry', level: 2 })
    ).toBeVisible();
    await expect(other.page.getByText(USER_EXCEEDED)).toBeHidden();
  });

  test('the Settings page shows how much of today’s allowance is left', async ({
    page,
    user,
    db,
  }) => {
    await openAiUsage(page);
    const meter = page.getByRole('meter', { name: 'Your allowance today' });
    await expect(meter).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByText('100% left')).toBeVisible();

    await db.addAiSpend(user.id, USER_DAILY_BUDGET_USD / 4);
    await openAiUsage(page);
    await expect(meter).toHaveAttribute('aria-valuenow', '75');
    await expect(page.getByText('75% left')).toBeVisible();
    await expect(page.getByText(/Your allowance resets at/)).toBeVisible();

    await db.addAiSpend(user.id, USER_DAILY_BUDGET_USD);
    await openAiUsage(page);
    await expect(meter).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('0% left')).toBeVisible();
    await expect(page.getByText(USER_EXCEEDED)).toBeVisible();
  });
});
