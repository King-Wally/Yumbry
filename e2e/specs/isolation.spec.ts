import { uploadRecipePhoto } from '../support/app.ts';
import { expect, test } from '../support/fixtures.ts';

// Every family's recipes, tags, categories and photos are private to it. These tests pit user A
// (the default `page`/`user`) against user B, a second person in a family of their own.

const A_RECIPE = {
  title: 'Secret Family Stew',
  description: 'Grandma never shared this.',
  category: 'secretcategory',
  tags: ['secrettag'],
  ingredients: [{ raw: '1 secret spice' }],
  instructions: ['Tell no one.'],
};

test.describe("another family's recipe", () => {
  test('its detail page shows "Recipe not found." and none of its content', async ({
    user,
    db,
    newSession,
  }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, A_RECIPE);
    const b = await newSession();

    await b.page.goto(`/recipes/${recipeId}`);
    await expect(b.page.getByText('Recipe not found.')).toBeVisible();
    await expect(b.page.getByText(A_RECIPE.title)).toBeHidden();
    await expect(b.page.getByText(A_RECIPE.description)).toBeHidden();
  });

  test('its edit page says "Recipe not found." and offers no form to change it', async ({
    user,
    db,
    newSession,
  }) => {
    const recipeId = await db.insertRecipe(user.familyId, user.id, A_RECIPE);
    const b = await newSession();

    await b.page.goto(`/recipes/${recipeId}/edit`);
    await expect(b.page.getByText('Recipe not found.')).toBeVisible();
    await expect(b.page.getByText(A_RECIPE.title)).toBeHidden();
    await expect(b.page.getByText(A_RECIPE.category)).toBeHidden();
    await expect(b.page.getByRole('button', { name: 'Save recipe' })).toBeHidden();

    expect(await db.recipeTitles(user.familyId)).toEqual([A_RECIPE.title]);
    expect(await db.recipeTitles(b.user.familyId)).toEqual([]);
  });
});

test("one family's recipes, tags and categories never appear for another", async ({
  page,
  user,
  db,
  newSession,
}) => {
  await db.insertRecipe(user.familyId, user.id, A_RECIPE);
  const b = await newSession();
  await db.insertRecipe(b.user.familyId, b.user.id, {
    title: 'Open Book Soup',
    category: 'soups',
    tags: ['warming'],
  });

  // A sees only A's.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: A_RECIPE.title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'secretcategory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open Book Soup' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'soups' })).toBeHidden();

  // B sees only B's, on the list...
  await b.page.goto('/');
  await expect(b.page.getByRole('heading', { name: 'Open Book Soup' })).toBeVisible();
  await expect(b.page.getByRole('button', { name: 'soups' })).toBeVisible();
  await expect(b.page.getByRole('button', { name: 'warming' })).toBeVisible();
  await expect(b.page.getByRole('heading', { name: A_RECIPE.title })).toBeHidden();
  await expect(b.page.getByRole('button', { name: 'secretcategory' })).toBeHidden();
  await expect(b.page.getByRole('button', { name: 'secrettag' })).toBeHidden();

  // ...when searching for A's recipe by name...
  await b.page.getByRole('searchbox', { name: 'Search recipes...' }).fill('secret');
  await expect(b.page.getByText('No recipes yet. Try importing or adding one.')).toBeVisible();

  // ...and in the recipe form's category chips and tag suggestions.
  await b.page.goto('/recipes/new');
  await expect(b.page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();
  await expect(b.page.getByRole('button', { name: 'soups' })).toBeVisible();
  await expect(b.page.getByRole('button', { name: 'secretcategory' })).toBeHidden();
  await b.page.getByPlaceholder('Add a tag and press Enter').fill('secret');
  await expect(b.page.getByRole('button', { name: 'secrettag' })).toBeHidden();
  await b.page.getByPlaceholder('Add a tag and press Enter').fill('warm');
  await expect(b.page.getByRole('button', { name: 'warming' })).toBeVisible();
});

test.describe('signed-out visitors', () => {
  for (const protectedPath of ['/', '/recipes/new', '/recipes/1', '/recipes/1/edit', '/settings']) {
    test(`are sent to /login from ${protectedPath}`, async ({ page }) => {
      await page.goto(protectedPath);
      await expect(page).toHaveURL('/login');
      await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    });
  }
});

test('a recipe photo is refused to signed-out visitors and to other families', async ({
  page,
  user,
  db,
  newSession,
  request,
}) => {
  const recipeId = await db.insertRecipe(user.familyId, user.id, A_RECIPE);
  const photoUrl = await uploadRecipePhoto(page, recipeId);

  expect((await page.request.get(photoUrl)).status()).toBe(200);

  const b = await newSession();
  expect((await b.page.request.get(photoUrl)).ok()).toBe(false);

  // The `request` fixture carries no session cookie.
  expect((await request.get(photoUrl, { maxRedirects: 0 })).ok()).toBe(false);
});
