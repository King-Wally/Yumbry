import type { Request, Response } from 'express';
import { listCategories } from '../services/tag-category.service.js';

export async function getCategories(_req: Request, res: Response) {
  res.json(await listCategories());
}
