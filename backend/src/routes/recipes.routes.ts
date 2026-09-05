import { Router } from 'express';
import {
  exportRecipe,
  getRecipe,
  getRecipes,
  importRecipe,
  importRecipeFromUrl,
  postRecipe,
  putRecipe,
  removeRecipe,
  uploadRecipePhoto,
} from '../controllers/recipes.controller.js';
import { uploadJsonFile, uploadPhoto } from '../middleware/upload.js';
import { requireRecipeAccess } from '../middleware/require-recipe-access.js';
import { urlImportRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';

export const recipesRouter = Router();

recipesRouter.post('/import', uploadJsonFile.single('file'), asyncHandler(importRecipe));
recipesRouter.post('/import-url', urlImportRateLimiter, asyncHandler(importRecipeFromUrl));
recipesRouter.get('/', asyncHandler(getRecipes));
recipesRouter.get('/:id', asyncHandler(getRecipe));
recipesRouter.get('/:id/export', asyncHandler(exportRecipe));
recipesRouter.post('/', asyncHandler(postRecipe));
recipesRouter.put('/:id', asyncHandler(putRecipe));
recipesRouter.delete('/:id', asyncHandler(removeRecipe));
recipesRouter.post(
  '/:id/photo',
  asyncHandler(requireRecipeAccess),
  uploadPhoto.single('photo'),
  asyncHandler(uploadRecipePhoto)
);
