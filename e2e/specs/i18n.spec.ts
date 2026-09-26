import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';

type Locale = 'en' | 'nl' | 'fr' | 'es';

interface LocaleExpectations {
  label: string;
  loginHeading: string;
  addRecipe: string;
  ingredients: string;
  notFound: string;
  settings: string;
}

// A handful of strings per language, enough to prove the UI really switched.
const LOCALES: Record<Locale, LocaleExpectations> = {
  en: {
    label: 'English',
    loginHeading: 'Log in',
    addRecipe: 'Add recipe',
    ingredients: 'Ingredients',
    notFound: 'Page not found',
    settings: 'Settings',
  },
  nl: {
    label: 'Nederlands',
    loginHeading: 'Inloggen',
    addRecipe: 'Recept toevoegen',
    ingredients: 'Ingrediënten',
    notFound: 'Pagina niet gevonden',
    settings: 'Instellingen',
  },
  fr: {
    label: 'Français',
    loginHeading: 'Se connecter',
    addRecipe: 'Ajouter une recette',
    ingredients: 'Ingrédients',
    notFound: 'Page introuvable',
    settings: 'Paramètres',
  },
  es: {
    label: 'Español',
    loginHeading: 'Iniciar sesión',
    addRecipe: 'Añadir receta',
    ingredients: 'Ingredientes',
    notFound: 'Página no encontrada',
    settings: 'Ajustes',
  },
};

/**
 * Text that looks like an untranslated i18n key ("recipeForm.title", "nav.addRecipe"), from the
 * page's visible text and the user-facing attributes screen readers and placeholders expose.
 * Emails, URLs and numbers are stripped first, and every segment must be 2+ letters (so "e.g."
 * is not a key).
 */
async function leakedKeys(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const attrs = ['placeholder', 'aria-label', 'title', 'alt'];
    const values = Array.from(document.querySelectorAll('*')).flatMap((el) =>
      attrs.map((attr) => el.getAttribute(attr) ?? '')
    );
    return [document.body.innerText, document.title, ...values];
  });
  const cleaned = texts
    .join('\n')
    .replace(/\S+@\S+/g, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ')
    .replace(/\bv?\d+(?:\.\d+)+\b/g, ' ');
  return [...new Set(cleaned.match(/\b[a-z][a-zA-Z]+(?:\.[a-zA-Z]{2,})+\b/g) ?? [])];
}

async function expectNoLeakedKeys(page: Page): Promise<void> {
  expect(await leakedKeys(page), `untranslated keys on ${page.url()}`).toEqual([]);
}

for (const [locale, strings] of Object.entries(LOCALES) as [Locale, LocaleExpectations][]) {
  test.describe(`${strings.label} (${locale})`, () => {
    test('anonymous pages are translated', async ({ page }) => {
      await page.addInitScript((value) => {
        try {
          localStorage.setItem('yumbry.locale', value);
        } catch {
          // Ignore: the assertions below would then fail loudly.
        }
      }, locale);

      await page.goto('/login');
      await expect(page.getByRole('heading', { name: strings.loginHeading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expectNoLeakedKeys(page);

      await page.goto('/register');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoLeakedKeys(page);

      await page.goto('/some/unknown/path');
      await expect(page.getByRole('heading', { name: strings.notFound })).toBeVisible();
      await expectNoLeakedKeys(page);
    });

    test('signed-in pages are translated', async ({ page, user, db }) => {
      const recipeId = await db.insertRecipe(user.familyId, user.id, {
        title: 'Polyglot Paella',
        description: 'Rice with saffron',
        servings: 4,
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        calories: 450,
        category: 'mains',
        tags: ['rice'],
        ingredients: [
          { raw: '300 g rice', amount: 300, unit: 'g', name: 'rice' },
          { raw: 'salt to taste' },
        ],
        instructions: ['Toast the rice.', 'Add the stock.'],
      });

      await page.goto('/settings');
      if (locale !== 'en') {
        await page.getByLabel('Language').selectOption({ label: strings.label });
      }
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('button', { name: strings.addRecipe })).toBeVisible();
      await expectNoLeakedKeys(page);

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Polyglot Paella' })).toBeVisible();
      await expect(page.getByRole('button', { name: strings.addRecipe })).toBeVisible();
      await expectNoLeakedKeys(page);

      await page.goto('/recipes/new');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoLeakedKeys(page);

      await page.goto(`/recipes/${recipeId}`);
      await expect(page.getByRole('heading', { name: 'Polyglot Paella' })).toBeVisible();
      await expect(page.getByRole('heading', { name: strings.ingredients })).toBeVisible();
      await expectNoLeakedKeys(page);

      await page.goto(`/recipes/${recipeId}/edit`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoLeakedKeys(page);
    });

    test(`the Settings page heading is translated`, async ({ page, user }) => {
      void user;
      await page.goto('/settings');
      if (locale !== 'en') {
        await page.getByLabel('Language').selectOption({ label: strings.label });
      }
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.settings);
    });
  });
}

test('an unknown path shows a not-found page with a way home', async ({ page, user }) => {
  void user;
  await page.goto('/some/unknown/path');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL('/');
});

test('an unknown path shows the not-found page to signed-out visitors too', async ({ page }) => {
  await page.goto('/some/unknown/path');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
});
