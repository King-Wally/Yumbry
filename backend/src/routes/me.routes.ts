import { Router } from 'express';
import { getMe, patchMe } from '../controllers/me.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const meRouter = Router();

meRouter.get('/', asyncHandler(getMe));
meRouter.patch('/', asyncHandler(patchMe));
