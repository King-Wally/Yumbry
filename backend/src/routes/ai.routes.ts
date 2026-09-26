import { Router } from 'express';
import {
  getAiStatus,
  postAiChat,
  postAiPhotoImport,
  postAiNutrition,
} from '../controllers/ai.controller.js';
import { uploadErrorHandler } from '../middleware/multer-error.js';
import { MEMORY_PHOTO_LIMIT_MB, uploadPhotoToMemory } from '../middleware/upload.js';
import { photoImportRateLimiter } from '../middleware/rate-limit.js';
import { requireGeminiQuota, requireOpenRouterBudget } from '../middleware/require-ai-budget.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = Router();

aiRouter.get('/status', asyncHandler(getAiStatus));
aiRouter.post('/chat', asyncHandler(requireOpenRouterBudget), asyncHandler(postAiChat));
aiRouter.post(
  '/photo-import',
  photoImportRateLimiter,
  // Before the upload, so a refused import never has its photo read into memory.
  asyncHandler(requireOpenRouterBudget),
  uploadPhotoToMemory.single('photo'),
  uploadErrorHandler(MEMORY_PHOTO_LIMIT_MB),
  asyncHandler(postAiPhotoImport)
);
aiRouter.post('/nutrition', asyncHandler(requireGeminiQuota), asyncHandler(postAiNutrition));
