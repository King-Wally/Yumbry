import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import type { TestUser } from '../support/users.ts';
import type { Db } from '../support/db.ts';

const EMPTY = 'No recipes yet. Try importing or adding one.';

function card(page: Page, title: string) {
  return page.getByRole('heading', { name: title, exact: true });
}

/** Three recipes spread over two categories and two tags. */
async function seedCookbook(db: Db, user: TestUser): Promise<void> {
  await db.insertRecipe(user.familyId, user.id, {
    title: 'Banana Bread',
    description: 'Moist loaf',
    category: 'baking',
    tags: ['sweet'],
  });
  await db.insertRecipe(user.familyId, user.id, {
    title: 'Chili Con Carne',
    category: 'dinner',
    tags: ['spicy'],
  });
  await db.insertRecipe(user.familyId, user.id, {
    title: 'Chocolate Chili Cake',
    category: 'baking',
    tags: ['sweet', 'spicy'],
  });
}

async function expectCards(page: Page, visible: string[], hidden: string[]): Promise<void> {
  for (const title of visible) await expect(card(page, title)).toBeVisible();
  for (const title of hidden) await expect(card(page, title)).toBeHidden();
}

const ALL = ['Banana Bread', 'Chili Con Carne', 'Chocolate Chili Cake'];

test('a new account sees the empty-state hint', async ({ page, user }) => {
  void user;
  await page.goto('/');
  await expect(page.getByText(EMPTY)).toBeVisible();
});

test('the list shows every recipe of the family', async ({ page, user, db }) => {
  await seedCookbook(db, user);
  await page.goto('/');
  await expectCards(page, ALL, []);
  await expect(page.getByText(EMPTY)).toBeHidden();
});

test('searching narrows the list to matching recipes', async ({ page, user, db }) => {
  await seedCookbook(db, user);
  await page.goto('/');
  await expectCards(page, ALL, []);

  const search = page.getByRole('searchbox', { name: 'Search recipes...' });
  await search.fill('chili');
  await expectCards(page, ['Chili Con Carne', 'Chocolate Chili Cake'], ['Banana Bread']);

  await search.fill('no such dish');
  await expectCards(page, [], ALL);
  await expect(page.getByText(EMPTY)).toBeVisible();

  await search.fill('');
  await expectCards(page, ALL, []);
});

test('a category chip filters the list, and clicking it again clears the filter', async ({
  page,
  user,
  db,
}) => {
  await seedCookbook(db, user);
  await page.goto('/');
  await expectCards(page, ALL, []);

  const baking = page.getByRole('button', { name: 'baking', exact: true });
  await expect(baking).toHaveAttribute('aria-pressed', 'false');
  await baking.click();
  await expectCards(page, ['Banana Bread', 'Chocolate Chili Cake'], ['Chili Con Carne']);
  await expect(baking).toHaveAttribute('aria-pressed', 'true');

  await baking.click();
  await expectCards(page, ALL, []);
  await expect(baking).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'dinner', exact: true }).click();
  await expectCards(page, ['Chili Con Carne'], ['Banana Bread', 'Chocolate Chili Cake']);

  // Categories come first, so their "All" chip is the first one.
  await page.getByRole('button', { name: 'All', exact: true }).first().click();
  await expectCards(page, ALL, []);
});

test('a tag chip filters the list, and "All" clears the filter', async ({ page, user, db }) => {
  await seedCookbook(db, user);
  await page.goto('/');
  await expectCards(page, ALL, []);

  const spicy = page.getByRole('button', { name: 'spicy', exact: true });
  await spicy.click();
  await expectCards(page, ['Chili Con Carne', 'Chocolate Chili Cake'], ['Banana Bread']);

  await spicy.click();
  await expectCards(page, ALL, []);

  await page.getByRole('button', { name: 'sweet', exact: true }).click();
  await expectCards(page, ['Banana Bread', 'Chocolate Chili Cake'], ['Chili Con Carne']);

  // Tags come after categories, so theirs is the last "All" chip.
  await page.getByRole('button', { name: 'All', exact: true }).last().click();
  await expectCards(page, ALL, []);
});

test('category, tag and search filters combine', async ({ page, user, db }) => {
  await seedCookbook(db, user);
  await page.goto('/');
  await expectCards(page, ALL, []);

  await page.getByRole('button', { name: 'baking', exact: true }).click();
  await page.getByRole('button', { name: 'spicy', exact: true }).click();
  await expectCards(page, ['Chocolate Chili Cake'], ['Banana Bread', 'Chili Con Carne']);

  await page.getByRole('searchbox', { name: 'Search recipes...' }).fill('banana');
  await expectCards(page, [], ALL);
  await expect(page.getByText(EMPTY)).toBeVisible();
});

test('clicking a card opens the recipe', async ({ page, user, db }) => {
  await seedCookbook(db, user);
  await page.goto('/');
  await card(page, 'Banana Bread').click();

  await expect(page).toHaveURL(/\/recipes\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Banana Bread', level: 1 })).toBeVisible();
  await expect(page.getByText('Moist loaf')).toBeVisible();
});
