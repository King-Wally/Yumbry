import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import { asyncHandler } from '../utils/async-handler.js';

/** requireAuth's lenient sibling, for public routes that behave differently
 * for a signed-in viewer: sets req.userId/req.familyId when there is a valid
 * session and otherwise just carries on. Never 401s, so an anonymous visitor
 * never trips the frontend's session-refresh path. */
export const optionalAuth = asyncHandler(async (req: Request, _res, next) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (session && typeof session.user.familyId === 'number') {
    req.userId = session.user.id;
    req.familyId = session.user.familyId;
  }
  next();
});
