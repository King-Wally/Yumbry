import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { UpdateProfileBodySchema } from '../schemas/user-preferences.schema.js';
import { updateUserProfile, type PublicUser } from '../services/user-profile.service.js';

function toPublicUser(user: NonNullable<Request['user']>): PublicUser {
  return {
    id: user.id,
    email: user.email,
    locale: user.locale,
    unitSystem: user.unitSystem,
    smallVolumes: user.smallVolumes,
    jsonImportExportEnabled: user.jsonImportExportEnabled,
  };
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json(toPublicUser(req.user));
}

// Preferences are declared as better-auth additionalFields with `input: false`,
// so its own updateUser endpoint cannot touch them — every write lands here and
// is validated against the shared enums first.
export async function patchMe(req: Request, res: Response) {
  try {
    const patch = UpdateProfileBodySchema.parse(req.body);
    const user = await updateUserProfile(req.userId as string, patch);
    res.json(user);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}
