import { Router } from 'express';
import { getCategories } from '../controllers/categories.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', asyncHandler(getCategories));
