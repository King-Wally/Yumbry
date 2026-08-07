import { Router } from 'express';
import {
  deleteAccount,
  getMe,
  patchMe,
  postChangePassword,
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
authRouter.post('/logout', asyncHandler(postLogout));
authRouter.get('/me', requireAuth, asyncHandler(getMe));
authRouter.patch('/me', requireAuth, asyncHandler(patchMe));
authRouter.delete('/me', requireAuth, loginRateLimiter, asyncHandler(deleteAccount));
authRouter.post(
  '/change-password',
  requireAuth,
  loginRateLimiter,
  asyncHandler(postChangePassword)
);
authRouter.post('/forgot-password', forgotPasswordRateLimiter, asyncHandler(postForgotPassword));
authRouter.post('/reset-password', loginRateLimiter, asyncHandler(postResetPassword));
