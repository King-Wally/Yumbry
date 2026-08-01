import { Router } from 'express';
import {
  getAiModelsHandler,
  getAiSettingsHandler,
  putAiSettingsHandler,
} from '../controllers/ai-settings.controller.js';
import { postAiChat } from '../controllers/ai.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = Router();

aiRouter.get('/settings', asyncHandler(getAiSettingsHandler));
aiRouter.put('/settings', asyncHandler(putAiSettingsHandler));
aiRouter.get('/settings/models', asyncHandler(getAiModelsHandler));
aiRouter.post('/chat', asyncHandler(postAiChat));
