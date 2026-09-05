import { Router } from 'express';
import { getMyFamily, postJoinFamily, postLeaveFamily } from '../controllers/family.controller.js';
import { loginRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';

export const familyRouter = Router();

familyRouter.get('/', asyncHandler(getMyFamily));
// Rate-limited: an invite token is a bearer secret, and this is the only
// endpoint in the app where one can be guessed at.
familyRouter.post('/join', loginRateLimiter, asyncHandler(postJoinFamily));
familyRouter.post('/leave', asyncHandler(postLeaveFamily));
