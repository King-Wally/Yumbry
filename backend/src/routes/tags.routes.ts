import { Router } from 'express';
import { listTags } from '../services/recipe.service.js';

export const tagsRouter = Router();

tagsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listTags());
  } catch (err) {
    next(err);
  }
});
