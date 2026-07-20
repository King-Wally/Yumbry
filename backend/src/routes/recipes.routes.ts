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

export const recipesRouter = Router();

recipesRouter.post('/import', uploadJsonFile.single('file'), importRecipe);
recipesRouter.get('/', getRecipes);
recipesRouter.get('/:id', getRecipe);
recipesRouter.get('/:id/export', exportRecipe);
recipesRouter.post('/', postRecipe);
recipesRouter.put('/:id', putRecipe);
recipesRouter.delete('/:id', removeRecipe);
recipesRouter.post('/:id/photo', uploadPhoto.single('photo'), uploadRecipePhoto);
