import { Router } from 'express';
import { postAiChat } from '../controllers/ai.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = Router();

aiRouter.post('/chat', asyncHandler(postAiChat));
