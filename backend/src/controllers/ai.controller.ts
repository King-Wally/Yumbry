import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { chatWithAi } from '../services/ai-provider.service.js';
import {
  AI_ENVELOPE_JSON_SCHEMA,
  buildChatMessages,
  parseChatEnvelope,
  RECIPE_SAMPLING,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from 'yumbry-shared';
import { AiChatTurnRequestSchema } from '../schemas/ai-chat.schema.js';
import { sendAiProviderError } from '../utils/ai-provider-error-response.js';

function isEnvelopeParseError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('The AI response');
}

export async function postAiChat(req: Request, res: Response) {
  try {
    const body = AiChatTurnRequestSchema.parse(req.body);

    // Use the user's chosen locale, defaulting to English when they haven't
    // set one (users.locale itself already defaults to 'en').
    const locale: SupportedLocale =
      req.user && SUPPORTED_LOCALES.includes(req.user.locale as SupportedLocale)
        ? (req.user.locale as SupportedLocale)
        : 'en';

    const raw = await chatWithAi(buildChatMessages(body.messages, body.current_draft, locale), {
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      sampling: RECIPE_SAMPLING,
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
