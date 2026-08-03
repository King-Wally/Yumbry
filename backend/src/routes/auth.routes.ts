import { Router } from 'express';
import {
  deleteAccount,
  getMe,
  postLogin,
  postLogout,
  postRegister,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/require-auth.js';
import { loginRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

authRouter.post('/register', loginRateLimiter, asyncHandler(postRegister));
authRouter.post('/login', loginRateLimiter, asyncHandler(postLogin));
authRouter.post('/logout', asyncHandler(postLogout));
authRouter.get('/me', requireAuth, asyncHandler(getMe));
authRouter.delete('/me', requireAuth, loginRateLimiter, asyncHandler(deleteAccount));
