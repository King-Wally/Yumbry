import { Router } from 'express';
import {
  deleteAccount,
  getMe,
  postForgotPassword,
  postLogin,
  postLogout,
  postRegister,
  postResetPassword,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/require-auth.js';
import { forgotPasswordRateLimiter, loginRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

authRouter.post('/register', loginRateLimiter, asyncHandler(postRegister));
authRouter.post('/login', loginRateLimiter, asyncHandler(postLogin));
authRouter.post('/logout', loginRateLimiter, asyncHandler(postLogout));
authRouter.get('/me', requireAuth, asyncHandler(getMe));
authRouter.delete('/me', requireAuth, loginRateLimiter, asyncHandler(deleteAccount));
authRouter.post('/forgot-password', forgotPasswordRateLimiter, asyncHandler(postForgotPassword));
authRouter.post('/reset-password', loginRateLimiter, asyncHandler(postResetPassword));
