import { expect, test } from '../support/fixtures.ts';
import { logIn, recipeAction } from '../support/app.ts';
import type { Page } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueEmail } from '../support/users.ts';

const RECIPE = {
  title: 'Shared Pancakes',
  description: 'Fluffy.',
  ingredients: [{ raw: '200 g flour', amount: 200, unit: 'g', name: 'flour' }],
  instructions: ['Whisk everything together.'],
};

const SHARE_URL = /\/share\/[0-9a-f]{64}$/;

/** Opens the share dialog on the recipe page and creates (or shows) the link. */
async function createShareLink(page: Page, recipeId: number): Promise<string> {
  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByRole('heading', { name: RECIPE.title, level: 1 })).toBeVisible();
  await (await recipeAction(page, 'Share')).click();
  const dialog = page.getByRole('dialog', { name: 'Share recipe' });
  const create = dialog.getByRole('button', { name: 'Create link' });
  if (await create.isVisible()) await create.click();
  const link = dialog.getByLabel('Share link');
  await expect(link).toHaveValue(SHARE_URL);
  return link.inputValue();
}

test.describe('sharing a recipe', () => {
  test('creating a link is idempotent and stored on the recipe', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const first = await createShareLink(page, id);
    expect(await db.recipeShareToken(id)).toBe(first.split('/share/')[1]);

    await page.reload();
    expect(await createShareLink(page, id)).toBe(first);
  });

  test('copying the link confirms it', async ({ page, context, user, db }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);

    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  });

  test('stopping sharing kills the link, and sharing again makes a new one', async ({
    page,
    browser,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);

    await page.getByRole('button', { name: 'Stop sharing' }).click();
    const confirm = page.getByRole('dialog', { name: 'Stop sharing this recipe?' });
    await confirm.getByRole('button', { name: 'Stop sharing' }).click();
    await expect(confirm).toBeHidden();
    await expect.poll(() => db.recipeShareToken(id)).toBeNull();

    const visitor = await browser.newContext({ locale: 'en-US' });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(url);
    await expect(
      visitorPage.getByRole('heading', { name: 'This link is no longer active' })
    ).toBeVisible();
    await visitor.close();

    expect(await createShareLink(page, id)).not.toBe(url);
  });
});

test.describe('viewing a shared recipe', () => {
  test('anyone with the link can read it without an account', async ({
    page,
    browser,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);

    const visitor = await browser.newContext({ locale: 'en-US' });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(url);
    await expect(visitorPage.getByRole('heading', { name: RECIPE.title, level: 1 })).toBeVisible();
    await expect(visitorPage.getByText('200 g flour')).toBeVisible();
    await expect(visitorPage.getByText('Whisk everything together.')).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: 'Create account' })).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: 'Edit', exact: true })).toBeHidden();
    await visitor.close();
  });

  test('an unknown link shows the dead-link page', async ({ browser }) => {
    const visitor = await browser.newContext({ locale: 'en-US' });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/share/${'a'.repeat(64)}`);
    await expect(
      visitorPage.getByRole('heading', { name: 'This link is no longer active' })
    ).toBeVisible();
    await expect(visitorPage.getByRole('link', { name: 'Back to home' })).toBeVisible();
    await visitor.close();
  });

  test('a visitor who logs in from the page comes back to it', async ({
    page,
    newSession,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);
    const other = await newSession();
    await other.page.context().clearCookies();

    await other.page.goto(url);
    await other.page.getByRole('link', { name: 'Log in' }).click();
    await logIn(other.page, other.user.email, other.user.password);
    await expect(other.page).toHaveURL(url);
    await expect(other.page.getByRole('button', { name: 'Add to my recipes' })).toBeVisible();
  });

  test('a visitor who registers from the page does onboarding, then comes back to it', async ({
    page,
    browser,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);

    const visitor = await browser.newContext({ locale: 'en-US' });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(url);
    await visitorPage.getByRole('link', { name: 'Create account' }).click();
    await visitorPage.getByLabel('Email').fill(uniqueEmail('share-register'));
    await visitorPage.getByLabel('Password (min. 8 characters)').fill(DEFAULT_PASSWORD);
    await visitorPage.getByRole('button', { name: 'Register' }).click();

    await expect(visitorPage).toHaveURL('/onboarding');
    await visitorPage.getByRole('button', { name: 'English' }).click();
    const next = visitorPage.getByRole('button', { name: 'Next' });
    while (await next.isVisible()) await next.click();
    await visitorPage.getByRole('button', { name: 'Start cooking' }).click();

    await expect(visitorPage).toHaveURL(url);
    await expect(visitorPage.getByRole('button', { name: 'Add to my recipes' })).toBeVisible();
    await visitor.close();
  });

  test('someone from another family can save their own copy', async ({
    page,
    newSession,
    user,
    db,
  }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);
    const other = await newSession();

    await other.page.goto(url);
    await other.page.getByRole('button', { name: 'Add to my recipes' }).click();
    await expect(other.page.getByText('Added to your recipes')).toBeVisible();
    await expect(other.page).toHaveURL(/\/recipes\/\d+$/);
    await expect(other.page.getByRole('heading', { name: RECIPE.title, level: 1 })).toBeVisible();
    expect(await db.recipeTitles(other.user.familyId)).toEqual([RECIPE.title]);

    // The copy is independent of the original.
    await (await recipeAction(other.page, 'Edit')).click();
    await other.page.getByLabel('Title').fill('Their Pancakes');
    await other.page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(
      other.page.getByRole('heading', { name: 'Their Pancakes', level: 1 })
    ).toBeVisible();
    expect(await db.recipeTitles(user.familyId)).toEqual([RECIPE.title]);
  });

  test('the owner’s family is pointed to its own copy', async ({ page, user, db }) => {
    const id = await db.insertRecipe(user.familyId, user.id, RECIPE);
    const url = await createShareLink(page, id);

    await page.goto(url);
    await expect(page.getByText('This recipe is already in your collection.')).toBeVisible();
    await page.getByRole('link', { name: 'Open recipe' }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);
  });
});
