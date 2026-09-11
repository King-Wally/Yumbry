import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const requireAuth = asyncHandler(async (req: Request, res, next) => {
  // getSession reads the session row and its user row from the database on every
  // call — session.cookieCache is deliberately off (see src/auth.ts), so familyId
  // here is always current even if the user joined or left a family elsewhere.
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const { user } = session;

  // familyId is declared as an optional additionalField (better-auth validates
  // required fields against the request payload, which can never carry this
  // one), so its type is nullable even though the column is NOT NULL and the
  // user-create hook always fills it. Fail loudly rather than casting: an
  // undefined familyId reaching a Prisma `where` would silently match every
  // family in the database instead of none.
  if (typeof user.familyId !== 'number') {
    console.error(`User ${user.id} has no familyId`);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  req.userId = user.id;
  req.familyId = user.familyId;
  req.user = {
    id: user.id,
    email: user.email,
    locale: user.locale,
    unitSystem: user.unitSystem,
    smallVolumes: user.smallVolumes,
    jsonImportExportEnabled: user.jsonImportExportEnabled,
    familyId: user.familyId,
  };
  next();
});
