import type { AiChatMessage, RecipeInput } from '../types';
import {
  buildChatMessages,
  parseChatEnvelope,
  type AiChatEnvelope,
  type AiRecipeDraft,
} from 'yumbry-shared';

/**
 * Browser → Ollama direct connection, bypassing the backend entirely — used
 * unconditionally for the `ollama` provider, since reaching a user's own
 * local Ollama instance is only ever possible from their own browser, never
 * from the backend. Every other provider still goes through
 * POST /api/ai/chat as normal.
 *
 * The prompt-building/envelope-parsing logic comes from `yumbry-shared`
 * (see shared/src/ai-recipe-draft.ts) — the same single source of truth the
 * backend's `/api/ai/chat` proxy uses, so a recipe drafted via direct Ollama
 * looks identical in quality/shape to one drafted through the backend.
 *
 * Deliberately plain `fetch` here, not the `openai` SDK the backend uses —
 * the request/response shapes needed from Ollama's OpenAI-compatible
 * endpoint are trivial, and pulling in the SDK just for this one
 * browser-side path isn't worth the bundle weight. Error wording mirrors
 * backend/src/services/ai-provider.service.ts's toAiProviderError, so
 * <AiErrorBanner> reads the same regardless of which path failed.
 */

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1'; // must match backend's DEFAULT_BASE_URLS.ollama

export type AiProviderErrorKind = 'unreachable' | 'bad_status' | 'malformed_response';

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(message: string, kind: AiProviderErrorKind) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}

function resolveBaseUrl(baseUrl: string | null): string {
  return baseUrl ? baseUrl.replace(/\/+$/, '') : DEFAULT_OLLAMA_BASE_URL;
}

async function postChatCompletion(
  baseUrl: string | null,
  model: string,
  messages: unknown
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${resolveBaseUrl(baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
    });
  } catch {
    throw new AiProviderError(
      'Could not reach the AI provider. Check the address and connection on the Settings page.',
      'unreachable'
    );
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new AiProviderError(
      `The AI provider responded with HTTP ${res.status}. ${bodyText}`.trim(),
      'bad_status'
    );
  }

  const json = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiProviderError(
      'The AI provider response did not include an assistant message.',
      'malformed_response'
    );
  }
  return content;
}

/** Runs one chat turn directly against a local Ollama instance and returns
 * the same {reply, recipe} shape POST /api/ai/chat resolves to. */
export async function chatWithOllamaDirect(
  messages: AiChatMessage[],
  currentDraft: RecipeInput | null,
  options: { baseUrl: string | null; model: string }
): Promise<AiChatEnvelope> {
  // RecipeInput's fields are optional where AiRecipeDraft's are required-but-
  // nullable — a safe cast: buildChatMessages only JSON.stringifies this
  // (undefined keys are simply omitted), and parseChatEnvelope only ever
  // reads currentDraft.image_path off it.
  const draft = currentDraft as AiRecipeDraft | null;
  const raw = await postChatCompletion(
    options.baseUrl,
    options.model,
    buildChatMessages(messages, draft)
  );
  return parseChatEnvelope(raw, draft);
}

/** Lists available models directly from a local Ollama instance, for the
 * Settings page's "check connection" button — same {models: {name}[]} shape
 * `listAiModels` (the backend-proxied version) resolves to. */
export async function listOllamaModelsDirect(
  baseUrl: string | null
): Promise<{ models: { name: string }[] }> {
  let res: Response;
  try {
    res = await fetch(`${resolveBaseUrl(baseUrl)}/models`);
  } catch {
    throw new AiProviderError(
      'Could not reach the AI provider. Check the address and connection on the Settings page.',
      'unreachable'
    );
  }

  if (!res.ok) {
    throw new AiProviderError(`The AI provider responded with HTTP ${res.status}.`, 'bad_status');
  }

  const json = await res.json().catch(() => null);
  if (!Array.isArray(json?.data)) {
    throw new AiProviderError(
      'The AI provider returned an unexpected model list response.',
      'malformed_response'
    );
  }

  return {
    models: json.data
      .filter((m: unknown): m is { id: string } => typeof (m as { id?: unknown })?.id === 'string')
      .map((m: { id: string }) => ({ name: m.id })),
  };
}
