import type { Request, Response } from 'express';
import { isEmailConfigured } from '../services/email.service.js';

// Cheap, no-network check the frontend polls (unauthenticated, from the login page) to decide
// whether to show the "forgot password" link at all, rather than only discovering email isn't
// configured after submitting the form.
//
// Lives at /api/config rather than /api/auth/config: everything under /api/auth
// is now handled by better-auth's catch-all, which would swallow this route.
export function getAppConfig(_req: Request, res: Response) {
  res.json({ passwordResetEnabled: isEmailConfigured() });
}
