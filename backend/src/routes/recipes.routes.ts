import { Router } from 'express';
import {
  exportRecipe,
  getRecipe,
  getRecipes,
  importRecipe,
  postRecipe,
  putRecipe,
  removeRecipe,
  uploadRecipePhoto,
} from '../controllers/recipes.controller.js';
import { uploadJsonFile, uploadPhoto } from '../middleware/upload.js';
import { asyncHandler } from '../utils/async-handler.js';

export const recipesRouter = Router();

recipesRouter.post('/import', uploadJsonFile.single('file'), asyncHandler(importRecipe));
recipesRouter.get('/', asyncHandler(getRecipes));
recipesRouter.get('/:id', asyncHandler(getRecipe));
recipesRouter.get('/:id/export', asyncHandler(exportRecipe));
recipesRouter.post('/', asyncHandler(postRecipe));
recipesRouter.put('/:id', asyncHandler(putRecipe));
recipesRouter.delete('/:id', asyncHandler(removeRecipe));
recipesRouter.post('/:id/photo', uploadPhoto.single('photo'), asyncHandler(uploadRecipePhoto));
