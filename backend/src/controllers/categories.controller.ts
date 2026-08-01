import type { Request, Response } from 'express';
import { listCategories } from '../services/tag-category.service.js';

export async function getCategories(req: Request, res: Response) {
  res.json(await listCategories(req.userId as number));
}
