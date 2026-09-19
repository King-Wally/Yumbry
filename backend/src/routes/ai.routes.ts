import { Router } from 'express';
import {
  getAiStatus,
  postAiChat,
  postAiPhotoImport,
  postAiNutrition,
} from '../controllers/ai.controller.js';
import { handleUploadError } from '../middleware/multer-error.js';
import { uploadPhotoToMemory } from '../middleware/upload.js';
import { photoImportRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = Router();

aiRouter.get('/status', asyncHandler(getAiStatus));
aiRouter.post('/chat', asyncHandler(postAiChat));
aiRouter.post(
  '/photo-import',
  photoImportRateLimiter,
  uploadPhotoToMemory.single('photo'),
  handleUploadError,
  asyncHandler(postAiPhotoImport)
);
aiRouter.post('/nutrition', asyncHandler(postAiNutrition));
