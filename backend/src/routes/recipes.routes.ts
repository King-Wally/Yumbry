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
import { uploadErrorHandler } from '../middleware/multer-error.js';
import { PHOTO_LIMIT_MB, uploadJsonFile, uploadPhoto } from '../middleware/upload.js';
import { requireRecipeAccess } from '../middleware/require-recipe-access.js';
import { validateRecipeIdParam } from '../middleware/validate-recipe-id.js';
import { urlImportRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';

export const recipesRouter = Router();

recipesRouter.post('/import', uploadJsonFile.single('file'), asyncHandler(importRecipe));
recipesRouter.post('/import-url', urlImportRateLimiter, asyncHandler(importRecipeFromUrl));
recipesRouter.get('/', asyncHandler(getRecipes));
// validateRecipeIdParam goes first on every `:id` chain — requireRecipeAccess and
// uploadPhoto's destination callback both read req.recipeId. Note this cannot be a
// router.use('/:id', …): `/import` and `/import-url` match that pattern too.
recipesRouter.get('/:id', validateRecipeIdParam, asyncHandler(getRecipe));
recipesRouter.get('/:id/export', validateRecipeIdParam, asyncHandler(exportRecipe));
recipesRouter.post('/', asyncHandler(postRecipe));
recipesRouter.put('/:id', validateRecipeIdParam, asyncHandler(putRecipe));
recipesRouter.delete('/:id', validateRecipeIdParam, asyncHandler(removeRecipe));
recipesRouter.post(
  '/:id/photo',
  validateRecipeIdParam,
  asyncHandler(requireRecipeAccess),
  uploadPhoto.single('photo'),
  uploadErrorHandler(PHOTO_LIMIT_MB),
  asyncHandler(uploadRecipePhoto)
);
