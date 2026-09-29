import type { Page } from '@playwright/test';
import { choosePhoto, FIXTURE_FILES } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';

async function openEditPage(page: Page, recipeId: number): Promise<void> {
  await page.goto(`/recipes/${recipeId}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
  await expect(page.getByText('Recipe photo', { exact: true })).toBeVisible();
}

/** The hero image on the detail page, once it has actually loaded. */
async function heroImageSrc(page: Page, title: string): Promise<string> {
  const hero = page.getByRole('img', { name: title, exact: true });
  await hero.scrollIntoViewIfNeeded();
  await expect
    .poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  return (await hero.getAttribute('src'))!;
}

test('an uploaded photo shows on the recipe, and replacing it swaps the image', async ({
  page,
  user,
  db,
}) => {
  const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Photo Paella' });
  await openEditPage(page, recipeId);

  await choosePhoto(page, 'Upload recipe photo', FIXTURE_FILES.dishJpg);
  await expect(page.getByRole('button', { name: 'Replace recipe photo' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Recipe photo' })).toBeVisible();
  await expect.poll(() => db.recipeImagePath(recipeId)).not.toBeNull();

  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByRole('heading', { name: 'Photo Paella', level: 1 })).toBeVisible();
  await expect(page.getByText('No photo yet')).toBeHidden();
  const firstSrc = await heroImageSrc(page, 'Photo Paella');

  await openEditPage(page, recipeId);
  const firstPath = await db.recipeImagePath(recipeId);
  await choosePhoto(page, 'Replace recipe photo', FIXTURE_FILES.dishPng);
  await expect.poll(() => db.recipeImagePath(recipeId)).not.toBe(firstPath);

  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByRole('heading', { name: 'Photo Paella', level: 1 })).toBeVisible();
  const secondSrc = await heroImageSrc(page, 'Photo Paella');
  expect(secondSrc).not.toBe(firstSrc);
});

test('a recipe photo is only served to the family that owns it', async ({
  page,
  user,
  db,
  newSession,
  request,
}) => {
  const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Private Paella' });
  await openEditPage(page, recipeId);
  await choosePhoto(page, 'Upload recipe photo', FIXTURE_FILES.dishJpg);
  await expect(page.getByRole('button', { name: 'Replace recipe photo' })).toBeVisible();

  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByRole('heading', { name: 'Private Paella', level: 1 })).toBeVisible();
  const src = await heroImageSrc(page, 'Private Paella');

  const owner = await page.request.get(src);
  expect(owner.status()).toBe(200);
  expect(owner.headers()['content-type']).toMatch(/^image\//);

  const stranger = await newSession();
  const strangerResponse = await stranger.page.request.get(src);
  expect(strangerResponse.ok()).toBe(false);

  // The `request` fixture carries no session cookie.
  const anonymous = await request.get(src, { maxRedirects: 0 });
  expect(anonymous.ok()).toBe(false);
});

test('a file that is not an image is refused and the photo stays unchanged', async ({
  page,
  user,
  db,
}) => {
  const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Text Paella' });
  await openEditPage(page, recipeId);

  // A file chooser bypasses the input's `accept` filter, so this reaches the server.
  const refused = page.waitForResponse((response) => response.request().method() === 'POST');
  await choosePhoto(page, 'Upload recipe photo', FIXTURE_FILES.notAnImage);
  expect((await refused).ok()).toBe(false);

  await expect(page.getByRole('button', { name: 'Upload recipe photo' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Recipe photo' })).toBeHidden();
  expect(await db.recipeImagePath(recipeId)).toBeNull();

  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByText('No photo yet')).toBeVisible();
});

test('a refused upload does not replace an existing photo', async ({ page, user, db }) => {
  const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Kept Paella' });
  await openEditPage(page, recipeId);
  await choosePhoto(page, 'Upload recipe photo', FIXTURE_FILES.dishJpg);
  await expect.poll(() => db.recipeImagePath(recipeId)).not.toBeNull();
  const original = await db.recipeImagePath(recipeId);

  const refused = page.waitForResponse((response) => response.request().method() === 'POST');
  await choosePhoto(page, 'Replace recipe photo', FIXTURE_FILES.notAnImage);
  expect((await refused).ok()).toBe(false);
  expect(await db.recipeImagePath(recipeId)).toBe(original);
});

test('a refused upload tells the user why', async ({ page, user, db }) => {
  const recipeId = await db.insertRecipe(user.familyId, user.id, { title: 'Told Paella' });
  await openEditPage(page, recipeId);
  await choosePhoto(page, 'Upload recipe photo', FIXTURE_FILES.notAnImage);
  await expect(page.getByText(/image|not allowed|couldn't|failed/i)).toBeVisible();
});
