import { Router } from 'express';
import { getAiStatus, postAiChat, postAiNutrition } from '../controllers/ai.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = Router();

aiRouter.get('/status', asyncHandler(getAiStatus));
aiRouter.post('/chat', asyncHandler(postAiChat));
aiRouter.post('/nutrition', asyncHandler(postAiNutrition));
