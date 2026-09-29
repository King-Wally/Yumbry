import { Router } from 'express';
import { getShared, getSharedPhoto, postImportShared } from '../controllers/shared.controller.js';
import { optionalAuth } from '../middleware/optional-auth.js';
import { requireAuth } from '../middleware/require-auth.js';
import { asyncHandler } from '../utils/async-handler.js';

/** Public share links. Mounted without requireAuth: the token in the path is the
 * credential for reading. Importing a copy still needs an account. */
export const sharedRouter = Router();

sharedRouter.get('/:token', optionalAuth, asyncHandler(getShared));
sharedRouter.get('/:token/photo', asyncHandler(getSharedPhoto));
sharedRouter.post('/:token/import', requireAuth, asyncHandler(postImportShared));
