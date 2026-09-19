import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { chatWithAi } from '../services/ai-provider.service.js';
import {
  AI_ENVELOPE_JSON_SCHEMA,
  AI_NUTRITION_JSON_SCHEMA,
  buildChatMessages,
  buildPhotoImportMessages,
  buildNutritionMessages,
  DEFAULT_LOCALE,
  DEFAULT_SMALL_VOLUME_STYLE,
  DEFAULT_UNIT_SYSTEM,
  isSmallVolumeStyle,
  isSupportedLocale,
  isUnitSystem,
  NUTRITION_SAMPLING,
  parseChatEnvelope,
  parseNutritionEstimate,
  RECIPE_SAMPLING,
  type SmallVolumeStyle,
  type SupportedLocale,
  type UnitSystem,
} from 'yumbry-shared';
import { AiChatTurnRequestSchema } from '../schemas/ai-chat.schema.js';
import { prepareImageForModel, UnreadableImageError } from '../services/image-prep.service.js';
import { AiNutritionRequestSchema } from '../schemas/ai-nutrition.schema.js';
import { sendAiProviderError } from '../utils/ai-provider-error-response.js';

function isEnvelopeParseError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('The AI response');
}

interface ReaderPreferences {
  locale: SupportedLocale;
  unitSystem: UnitSystem;
  smallVolumes: SmallVolumeStyle;
}

// All three columns are unconstrained strings in the database, so re-validate rather than trusting
// the value; each already defaults to the same fallback used here.
function readerPreferences(req: Request): ReaderPreferences {
  return {
    locale: isSupportedLocale(req.user?.locale) ? req.user.locale : DEFAULT_LOCALE,
    unitSystem: isUnitSystem(req.user?.unitSystem) ? req.user.unitSystem : DEFAULT_UNIT_SYSTEM,
    smallVolumes: isSmallVolumeStyle(req.user?.smallVolumes)
      ? req.user.smallVolumes
      : DEFAULT_SMALL_VOLUME_STYLE,
  };
}

// Cheap, no-network check the frontend polls to decide whether to show AI entry points at all,
// rather than only discovering the server has no key configured after a chat attempt 503s.
export async function getAiStatus(_req: Request, res: Response) {
  res.json({ configured: Boolean(process.env.GEMINI_API_KEY) });
}

export async function postAiChat(req: Request, res: Response) {
  try {
    const body = AiChatTurnRequestSchema.parse(req.body);

    const { locale, unitSystem, smallVolumes } = readerPreferences(req);

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

// Reading a photo on the big model is slower than any chat turn — a dense cookbook page can run
// well past the 30s default, and a timeout here costs the user the whole upload.
const PHOTO_IMPORT_TIMEOUT_MS = 90_000;

export async function postAiPhotoImport(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo was uploaded.' });
    }

    const { locale, unitSystem, smallVolumes } = readerPreferences(req);

    // Straightened by its EXIF orientation and bounded in size before it is sent — always JPEG
    // afterwards, whatever arrived.
    const prepared = await prepareImageForModel(req.file.buffer);
    const dataUrl = `data:image/jpeg;base64,${prepared.toString('base64')}`;

    // Always the big model: reading handwriting off a photo is the hardest thing the app asks of
    // the model, and unlike a chat turn there is no draft in hand to fall back on. chatWithAi's
    // quota fallback to the small model still applies.
    const raw = await chatWithAi(buildPhotoImportMessages(dataUrl, locale), {
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      sampling: RECIPE_SAMPLING,
      tier: 'big',
      timeoutMs: PHOTO_IMPORT_TIMEOUT_MS,
    });

    const envelope = parseChatEnvelope(raw, {
      currentDraft: null,
      locale,
      unitSystem,
      smallVolumes,
    });

    // "recipe": null is a first-class answer here — the prompt asks for it when the photo holds no
    // recipe — but with no current draft to preserve, parseChatEnvelope turns it into an empty
    // default. Handing the user a blank form would read as a bug, so surface the model's own
    // explanation of what it saw instead.
    const { recipe } = envelope;
    if (!recipe.ingredients.length && !recipe.instructions.length) {
      return res.status(422).json({ error: envelope.reply, kind: 'no_recipe_found' });
    }

    res.json(envelope);
  } catch (err) {
    // The upload claimed to be an image and wasn't one anything here can decode — the user's to
    // fix, so a 400 rather than the generic 500 the catch-all would give.
    if (err instanceof UnreadableImageError) {
      return res.status(400).json({ error: err.message, kind: 'unreadable_image' });
    }
    if (isEnvelopeParseError(err)) {
      return res.status(502).json({ error: err.message, kind: 'malformed_response' });
    }
    sendAiProviderError(res, err);
  }
}

/**
 * Estimates the four per-serving nutrition values for whatever the cook currently has in the
 * recipe form. Kept off `/ai/chat`: that endpoint's envelope is strict-mode, so every property is
 * `required`, and folding nutrition into it would force every recipe turn to emit values nobody
 * asked for.
 *
 * No locale/unitSystem resolution here — every value in the response is a number, so nothing is
 * rendered back to the reader.
 */
export async function postAiNutrition(req: Request, res: Response) {
  try {
    const body = AiNutritionRequestSchema.parse(req.body);

    const raw = await chatWithAi(buildNutritionMessages(body), {
      jsonSchema: AI_NUTRITION_JSON_SCHEMA,
      sampling: NUTRITION_SAMPLING,
      // Always the cheap tier: this measures a recipe already in hand rather than inventing one,
      // which is exactly the case the small model exists for.
      tier: 'small',
    });

    res.json(parseNutritionEstimate(raw));
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues });
    if (isEnvelopeParseError(err)) {
      return res.status(502).json({ error: err.message, kind: 'malformed_response' });
    }
    sendAiProviderError(res, err);
  }
}
