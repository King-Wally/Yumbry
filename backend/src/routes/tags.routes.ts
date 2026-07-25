import { Router } from 'express';
import { getTags } from '../controllers/tags.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const tagsRouter = Router();

tagsRouter.get('/', asyncHandler(getTags));
