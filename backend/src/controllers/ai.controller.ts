import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { getAiSettings } from '../services/ai-settings.service.js';
import { chatWithOllama } from '../services/ollama.service.js';
import { buildChatMessages, parseChatEnvelope } from '../services/ai-recipe-draft.service.js';
import { AiChatTurnRequestSchema } from '../schemas/ai-chat.schema.js';
import { sendOllamaError } from '../utils/ollama-error-response.js';

function isEnvelopeParseError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('The AI response');
}

async function requireModel(
  res: Response,
  userId: number
): Promise<{ base_url: string; model: string } | null> {
  const settings = await getAiSettings(userId);
  if (!settings.model) {
    res
      .status(409)
      .json({ error: 'No Ollama model is configured yet. Visit Settings to choose one.' });
    return null;
  }
  return { base_url: settings.base_url, model: settings.model };
}

export async function postAiChat(req: Request, res: Response) {
  try {
    const body = AiChatTurnRequestSchema.parse(req.body);
    const settings = await requireModel(res, req.userId as number);
    if (!settings) return;

    const raw = await chatWithOllama(buildChatMessages(body.messages, body.current_draft), {
      baseUrl: settings.base_url,
      model: settings.model,
      format: 'json',
    });

    res.json(parseChatEnvelope(raw));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    if (isEnvelopeParseError(err)) {
      return res.status(502).json({ error: err.message, kind: 'malformed_response' });
    }
    sendOllamaError(res, err);
  }
}
