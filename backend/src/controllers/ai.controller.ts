import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { getAiSettingsForCall } from '../services/ai-settings.service.js';
import { chatWithAi, type AiProvider } from '../services/ai-provider.service.js';
import { buildChatMessages, parseChatEnvelope } from 'recipe-vault-shared';
import { AiChatTurnRequestSchema } from '../schemas/ai-chat.schema.js';
import { sendAiProviderError } from '../utils/ai-provider-error-response.js';

function isEnvelopeParseError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('The AI response');
}

async function requireModel(
  res: Response,
  userId: number
): Promise<{
  provider: AiProvider;
  base_url: string | null;
  api_key: string | null;
  model: string;
} | null> {
  const settings = await getAiSettingsForCall(userId);
  if (!settings.model || !settings.provider) {
    res.status(409).json({ error: 'No AI model is configured yet. Visit Settings to choose one.' });
    return null;
  }
  return {
    provider: settings.provider,
    base_url: settings.base_url,
    api_key: settings.api_key,
    model: settings.model,
  };
}

export async function postAiChat(req: Request, res: Response) {
  try {
    const body = AiChatTurnRequestSchema.parse(req.body);
    const settings = await requireModel(res, req.userId as number);
    if (!settings) return;

    const raw = await chatWithAi(buildChatMessages(body.messages, body.current_draft), {
      provider: settings.provider,
      baseUrl: settings.base_url,
      apiKey: settings.api_key,
      model: settings.model,
      jsonMode: true,
    });

    res.json(parseChatEnvelope(raw, body.current_draft));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    if (isEnvelopeParseError(err)) {
      return res.status(502).json({ error: err.message, kind: 'malformed_response' });
    }
    sendAiProviderError(res, err);
  }
}
