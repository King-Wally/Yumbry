import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { chatWithAi } from '../services/ai-provider.service.js';
import {
  AI_ENVELOPE_JSON_SCHEMA,
  buildChatMessages,
  DEFAULT_LOCALE,
  DEFAULT_SMALL_VOLUME_STYLE,
  DEFAULT_UNIT_SYSTEM,
  isSmallVolumeStyle,
  isSupportedLocale,
  isUnitSystem,
  parseChatEnvelope,
  RECIPE_SAMPLING,
  type SmallVolumeStyle,
  type SupportedLocale,
  type UnitSystem,
} from 'yumbry-shared';
import { AiChatTurnRequestSchema } from '../schemas/ai-chat.schema.js';
import { sendAiProviderError } from '../utils/ai-provider-error-response.js';

function isEnvelopeParseError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('The AI response');
}

// Cheap, no-network check the frontend polls to decide whether to show AI entry points at all,
// rather than only discovering the server has no key configured after a chat attempt 503s.
export async function getAiStatus(_req: Request, res: Response) {
  res.json({ configured: Boolean(process.env.GEMINI_API_KEY) });
}

export async function postAiChat(req: Request, res: Response) {
  try {
    const body = AiChatTurnRequestSchema.parse(req.body);

    // Both columns are unconstrained strings in the database, so re-validate rather than trusting
    // the value; both already default to the same fallbacks used here.
    const locale: SupportedLocale = isSupportedLocale(req.user?.locale)
      ? req.user.locale
      : DEFAULT_LOCALE;
    const unitSystem: UnitSystem = isUnitSystem(req.user?.unitSystem)
      ? req.user.unitSystem
      : DEFAULT_UNIT_SYSTEM;
    const smallVolumes: SmallVolumeStyle = isSmallVolumeStyle(req.user?.smallVolumes)
      ? req.user.smallVolumes
      : DEFAULT_SMALL_VOLUME_STYLE;

    // `unitSystem` reaches the parser and never the prompt. The model writes canonical metric for
    // every reader; converting it afterwards is what makes unit compliance a property of the code
    // rather than a hope about the model.
    // The opening turn of a new recipe is the only one written from nothing, so it's the only one
    // that gets the big model; every later turn — and every improve turn — edits a draft that is
    // already in hand.
    const tier = body.mode === 'create' && body.messages.length === 1 ? 'big' : 'small';

    const raw = await chatWithAi(buildChatMessages(body.messages, body.current_draft, locale), {
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      sampling: RECIPE_SAMPLING,
      tier,
    });

    res.json(
      parseChatEnvelope(raw, {
        currentDraft: body.current_draft,
        locale,
        unitSystem,
        smallVolumes,
      })
    );
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    if (isEnvelopeParseError(err)) {
      return res.status(502).json({ error: err.message, kind: 'malformed_response' });
    }
    sendAiProviderError(res, err);
  }
}
