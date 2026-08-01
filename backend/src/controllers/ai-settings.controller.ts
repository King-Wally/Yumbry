import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  getAiSettings,
  getAiSettingsForCall,
  updateAiSettings,
} from '../services/ai-settings.service.js';
import { listAiModels, type AiProvider } from '../services/ai-provider.service.js';
import { AiSettingsBodySchema } from '../schemas/ai-settings.schema.js';
import { sendAiProviderError } from '../utils/ai-provider-error-response.js';

const KNOWN_PROVIDERS: AiProvider[] = ['openai', 'anthropic', 'gemini', 'ollama', 'custom'];

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (KNOWN_PROVIDERS as string[]).includes(value);
}

export async function getAiSettingsHandler(req: Request, res: Response) {
  res.json(await getAiSettings(req.userId as number));
}

export async function putAiSettingsHandler(req: Request, res: Response) {
  try {
    const body = AiSettingsBodySchema.parse(req.body);
    res.json(await updateAiSettings(req.userId as number, body));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    throw err;
  }
}

export async function getAiModelsHandler(req: Request, res: Response) {
  const overrideBaseUrl = typeof req.query.base_url === 'string' ? req.query.base_url : undefined;
  const overrideProvider = isAiProvider(req.query.provider) ? req.query.provider : undefined;
  const settings = await getAiSettingsForCall(req.userId as number);
  const baseUrl = overrideBaseUrl || settings.base_url;
  const provider = overrideProvider || settings.provider;

  if (!provider) {
    return res.status(400).json({ error: 'Choose a provider first.' });
  }

  try {
    const models = await listAiModels({
      provider,
      baseUrl: baseUrl ?? null,
      apiKey: settings.api_key,
    });
    res.json({ models });
  } catch (err) {
    sendAiProviderError(res, err);
  }
}
