import type { Request, Response } from 'express';
import { ZodError } from 'zod';
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
import { publicUploadPath } from '../middleware/upload.js';
import { RecipeBodySchema, type RecipeBody } from '../schemas/recipe.schema.js';
import { UrlImportBodySchema } from '../schemas/url-import.schema.js';
import { sendUrlImportError } from '../utils/url-import-error.js';

/** Manually-entered ingredients are given as raw text lines; parse them the same
 * way JSON-LD import does, so scaling works regardless of entry route. */
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
    const rawJsonLdText = req.file ? req.file.buffer.toString('utf-8') : req.body.jsonLd;

    if (!rawJsonLdText) {
      return res.status(400).json({ error: 'Provide JSON-LD text or upload a .json file.' });
    }

    const parsedRecipe = parseRecipeFromJsonLd(rawJsonLdText);
    const recipe = await createRecipe(parsedRecipe, req.userId as number);
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

/** Fetches `url`, extracts its schema.org Recipe JSON-LD, and returns an
 * unsaved draft — unlike importRecipe (JSON-LD paste/upload), nothing is
 * persisted here; the frontend hands the response to the recipe form for
 * review, the same way the AI-create draft hand-off works. */
export async function importRecipeFromUrl(req: Request, res: Response) {
  try {
    const { url } = UrlImportBodySchema.parse(req.body);
    const draft = await scrapeRecipeFromUrl(url);
    res.status(200).json(draft);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Provide a valid recipe page URL.' });
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
  const recipe = await getRecipeById(req.params.id, req.userId as number);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const jsonLd = recipeToJsonLd(recipe);
  res.setHeader('Content-Disposition', `attachment; filename="${slugify(recipe.title)}.json"`);
  res.json(jsonLd);
}

export async function getRecipes(req: Request, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const recipes = await listRecipes(req.userId as number, { search, tag, category });
  res.json(recipes);
}

export async function getRecipe(req: Request, res: Response) {
  const recipe = await getRecipeById(req.params.id, req.userId as number);
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
      req.userId as number
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
      req.params.id,
      {
        ...body,
        ingredients: normalizeIngredients(body.ingredients),
      },
      req.userId as number
    );
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function removeRecipe(req: Request, res: Response) {
  const deleted = await deleteRecipe(req.params.id, req.userId as number);
  if (!deleted) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
}

export async function uploadRecipePhoto(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

  const imagePath = publicUploadPath(req.file.path);
  const updated = await setRecipePhoto(req.params.id, imagePath, req.userId as number);
  if (!updated) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ image_path: imagePath });
}
