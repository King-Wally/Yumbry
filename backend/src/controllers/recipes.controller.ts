import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { isSupportedLocale } from 'yumbry-shared';
import { parseRecipeFromJsonLd } from '../services/jsonld-import.service.js';
import { recipeToJsonLd } from '../services/jsonld-export.service.js';
import { scrapeRecipeFromUrl } from '../services/url-recipe-import.service.js';
import { parseIngredientLine } from '../services/ingredient-parser.js';
import {
  createRecipe,
  deleteRecipe,
  getRecipeById,
  listRecipes,
  setRecipePhoto,
  updateRecipe,
} from '../services/recipe.service.js';
import type { IngredientInput } from '../services/recipe.types.js';
import { disableShare, enableShare } from '../services/recipe-share.service.js';
import { publicUploadPath } from '../middleware/upload.js';
import { RecipeBodySchema, type RecipeBody } from '../schemas/recipe.schema.js';
import { UrlImportBodySchema } from '../schemas/url-import.schema.js';
import { sendUrlImportError, UrlImportError } from '../utils/url-import-error.js';
import { logImportAttempt } from '../services/import-log.service.js';

function normalizeIngredients(ingredients: RecipeBody['ingredients']): IngredientInput[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map((ingredient) => {
    const rawText = typeof ingredient === 'string' ? ingredient : ingredient.raw_text;
    return { ...parseIngredientLine(rawText) };
  });
}

function isErrorWithMessage(err: unknown): err is Error {
  return err instanceof Error;
}

export async function importRecipe(req: Request, res: Response) {
  try {
    // The body branch needs narrowing, the file branch doesn't: parseRecipeFromJsonLd
    // immediately iterates the string, so a truthy non-string ({}, 123, true) would
    // throw a TypeError past all three catch branches below and surface as a 500.
    const rawJsonLdText = req.file
      ? req.file.buffer.toString('utf-8')
      : typeof req.body?.jsonLd === 'string'
        ? req.body.jsonLd
        : undefined;

    if (!rawJsonLdText) {
      return res.status(400).json({ error: 'Provide JSON-LD text or upload a .json file.' });
    }

    const parsedRecipe = parseRecipeFromJsonLd(rawJsonLdText);
    const recipe = await createRecipe(parsedRecipe, {
      familyId: req.familyId as number,
      authorId: req.userId as string,
    });
    res.status(201).json(recipe);
  } catch (err) {
    if (err instanceof ZodError) {
      return res
        .status(400)
        .json({ error: 'The JSON-LD document must be a JSON object or array.' });
    }
    if (
      err instanceof SyntaxError ||
      (isErrorWithMessage(err) && err.message.includes('No schema.org Recipe'))
    ) {
      return res
        .status(400)
        .json({ error: isErrorWithMessage(err) ? err.message : 'Invalid JSON-LD.' });
    }
    throw err;
  }
}

export async function importRecipeFromUrl(req: Request, res: Response) {
  let url: string | undefined;
  try {
    ({ url } = UrlImportBodySchema.parse(req.body));
    const locale = isSupportedLocale(req.user?.locale) ? req.user.locale : undefined;
    const draft = await scrapeRecipeFromUrl(url, locale);
    await logImportAttempt({ url, success: true });
    res.status(200).json(draft);
  } catch (err) {
    if (err instanceof ZodError) {
      // req.body.url may not be a string at all (e.g. missing/non-string) —
      // fall back to a placeholder rather than logging something misleading.
      const attemptedUrl =
        typeof req.body?.url === 'string' ? req.body.url : '(invalid request body)';
      await logImportAttempt({
        url: attemptedUrl,
        success: false,
        errorKind: 'validation_error',
        errorMessage: 'Provide a valid recipe page URL.',
      });
      return res.status(400).json({ error: 'Provide a valid recipe page URL.' });
    }

    if (err instanceof UrlImportError) {
      await logImportAttempt({
        url: url ?? '(unknown url)',
        success: false,
        errorKind: err.kind,
        errorMessage: err.message,
      });
    } else {
      await logImportAttempt({
        url: url ?? '(unknown url)',
        success: false,
        errorKind: 'unknown',
        errorMessage: String(err).slice(0, 500),
      });
    }

    sendUrlImportError(res, err);
  }
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'recipe'
  );
}

export async function exportRecipe(req: Request, res: Response) {
  const recipe = await getRecipeById(req.recipeId as number, req.familyId as number);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const jsonLd = recipeToJsonLd(recipe);
  res.setHeader('Content-Disposition', `attachment; filename="${slugify(recipe.title)}.json"`);
  res.json(jsonLd);
}

// Clamped rather than rejected: a 400 on a long paste into the search box is worse
// UX than searching its first 100 characters. The typeof narrows below are what keep
// qs object/array values (?tag[contains]=x) out of the Prisma filter; the length cap
// bounds `search`, which feeds two unindexed ILIKE '%…%' scans.
const MAX_SEARCH_LENGTH = 100;

export async function getRecipes(req: Request, res: Response) {
  const search =
    typeof req.query.search === 'string' ? req.query.search.slice(0, MAX_SEARCH_LENGTH) : undefined;
  const tag =
    typeof req.query.tag === 'string' ? req.query.tag.slice(0, MAX_SEARCH_LENGTH) : undefined;
  const category =
    typeof req.query.category === 'string'
      ? req.query.category.slice(0, MAX_SEARCH_LENGTH)
      : undefined;
  const recipes = await listRecipes(req.familyId as number, { search, tag, category });
  res.json(recipes);
}

export async function getRecipe(req: Request, res: Response) {
  const recipe = await getRecipeById(req.recipeId as number, req.familyId as number);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
}

export async function postRecipe(req: Request, res: Response) {
  try {
    const body = RecipeBodySchema.parse(req.body);
    const recipe = await createRecipe(
      {
        ...body,
        ingredients: normalizeIngredients(body.ingredients),
      },
      { familyId: req.familyId as number, authorId: req.userId as string }
    );
    res.status(201).json(recipe);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function putRecipe(req: Request, res: Response) {
  try {
    const body = RecipeBodySchema.parse(req.body);
    const recipe = await updateRecipe(
      req.recipeId as number,
      {
        ...body,
        ingredients: normalizeIngredients(body.ingredients),
      },
      req.familyId as number
    );
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function removeRecipe(req: Request, res: Response) {
  const deleted = await deleteRecipe(req.recipeId as number, req.familyId as number);
  if (!deleted) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
}

export async function uploadRecipePhoto(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

  const imagePath = publicUploadPath(req.file.path);
  const updated = await setRecipePhoto(req.recipeId as number, imagePath, req.familyId as number);
  if (!updated) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ image_path: imagePath });
}

export async function postRecipeShare(req: Request, res: Response) {
  const shareToken = await enableShare(req.recipeId as number, req.familyId as number);
  if (!shareToken) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ share_token: shareToken });
}

export async function deleteRecipeShare(req: Request, res: Response) {
  const found = await disableShare(req.recipeId as number, req.familyId as number);
  if (!found) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
}
