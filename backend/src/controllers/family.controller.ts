import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  FAMILY_ERROR_STATUS,
  FamilyError,
  getFamily,
  joinFamily,
  leaveFamily,
} from '../services/family.service.js';
import { JoinFamilyBodySchema } from '../schemas/family.schema.js';
import { sendKindedError } from '../utils/kinded-error-response.js';

export async function getMyFamily(req: Request, res: Response) {
  const family = await getFamily(req.familyId as number);
  if (!family) return res.status(404).json({ error: 'Family not found' });
  res.json(family);
}

export async function postJoinFamily(req: Request, res: Response) {
  try {
    const { token } = JoinFamilyBodySchema.parse(req.body);
    await joinFamily(req.userId as number, token);
    res.status(204).end();
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    sendKindedError(res, err, FamilyError, FAMILY_ERROR_STATUS);
  }
}

export async function postLeaveFamily(req: Request, res: Response) {
  try {
    await leaveFamily(req.userId as number);
    res.status(204).end();
  } catch (err) {
    sendKindedError(res, err, FamilyError, FAMILY_ERROR_STATUS);
  }
}
