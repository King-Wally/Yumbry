import type { Request, Response } from 'express';
import { listTags } from '../services/tag-category.service.js';

export async function getTags(_req: Request, res: Response) {
  res.json(await listTags());
}
