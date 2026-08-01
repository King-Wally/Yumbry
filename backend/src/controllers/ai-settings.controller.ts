import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { getAiSettings, updateAiSettings } from '../services/ai-settings.service.js';
import { listOllamaModels } from '../services/ollama.service.js';
import { AiSettingsBodySchema } from '../schemas/ai-settings.schema.js';
import { sendOllamaError } from '../utils/ollama-error-response.js';

export async function getAiSettingsHandler(_req: Request, res: Response) {
  res.json(await getAiSettings());
}

export async function putAiSettingsHandler(req: Request, res: Response) {
  try {
    const body = AiSettingsBodySchema.parse(req.body);
    res.json(await updateAiSettings(body));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function getAiModelsHandler(req: Request, res: Response) {
  const overrideBaseUrl = typeof req.query.base_url === 'string' ? req.query.base_url : undefined;
  const baseUrl = overrideBaseUrl || (await getAiSettings()).base_url;
  try {
    const models = await listOllamaModels(baseUrl);
    res.json({ models });
  } catch (err) {
    sendOllamaError(res, err);
  }
}
