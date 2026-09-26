import { Router } from 'express';
import {
  deleteRecipeShare,
  exportRecipe,
  getRecipe,
  getRecipes,
  getRecipeVersion,
  getRecipeVersions,
  importRecipe,
  importRecipeFromUrl,
  postRecipe,
  postRecipeShare,
  postRevertRecipeVersion,
  putRecipe,
  removeRecipe,
  uploadRecipePhoto,
} from '../controllers/recipes.controller.js';
import { uploadJsonFile, uploadPhoto } from '../middleware/upload.js';
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
recipesRouter.get('/:id/versions', validateRecipeIdParam, asyncHandler(getRecipeVersions));
recipesRouter.get(
  '/:id/versions/:versionId',
  validateRecipeIdParam,
  asyncHandler(getRecipeVersion)
);
recipesRouter.post(
  '/:id/versions/:versionId/revert',
  validateRecipeIdParam,
  asyncHandler(postRevertRecipeVersion)
);
recipesRouter.post('/', asyncHandler(postRecipe));
recipesRouter.put('/:id', validateRecipeIdParam, asyncHandler(putRecipe));
recipesRouter.delete('/:id', validateRecipeIdParam, asyncHandler(removeRecipe));
recipesRouter.post(
  '/:id/photo',
  validateRecipeIdParam,
  asyncHandler(requireRecipeAccess),
  uploadPhoto.single('photo'),
  asyncHandler(uploadRecipePhoto)
);
recipesRouter.post('/:id/share', validateRecipeIdParam, asyncHandler(postRecipeShare));
recipesRouter.delete('/:id/share', validateRecipeIdParam, asyncHandler(deleteRecipeShare));
