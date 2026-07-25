import { Router } from 'express';
import { listCategories } from '../services/recipe.service.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listCategories());
  } catch (err) {
    next(err);
  }
});
