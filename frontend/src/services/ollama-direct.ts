import type { AiChatMessage, RecipeInput } from '../types';
import {
  AI_ENVELOPE_JSON_SCHEMA,
  AiProviderError,
  badStatusMessage,
  buildChatMessages,
  malformedModelListMessage,
  malformedResponseMessage,
  parseChatEnvelope,
  unreachableMessage,
  type AiChatEnvelope,
  type AiRecipeDraft,
  type SupportedLocale,
} from 'yumbry-shared';

/**
 * Browser → Ollama direct connection, bypassing the backend entirely — used
 * unconditionally for the `ollama` provider, since reaching a user's own
 * local Ollama instance is only ever possible from their own browser, never
 * from the backend. Every other provider still goes through
 * POST /api/ai/chat as normal.
 *
 * The prompt-building/envelope-parsing logic, the AiProviderError vocabulary,
 * and the error-message wording all come from `yumbry-shared` (see
 * shared/src/ai-recipe-draft.ts and shared/src/ai-provider-error.ts) — the
 * same single source of truth the backend's `/api/ai/chat` proxy uses, so a
 * recipe drafted via direct Ollama looks identical in quality/shape to one
 * drafted through the backend, and <AiErrorBanner> reads the same regardless
 * of which path failed.
 *
 * Deliberately plain `fetch` here, not the `openai` SDK the backend uses —
 * the request/response shapes needed from Ollama's OpenAI-compatible
 * endpoint are trivial, and pulling in the SDK just for this one
 * browser-side path isn't worth the bundle weight.
 */

function resolveBaseUrl(baseUrl: string | null): string {
  if (baseUrl === null) {
    throw new AiProviderError(
      'A base URL is required for Ollama. Check the address on the Settings page.',
      'unreachable'
    );
  }
  return baseUrl?.replace(/\/+$/, '') || '';
}

async function postChatCompletion(
  baseUrl: string | null,
  model: string,
  messages: unknown
): Promise<string> {
  const url = `${resolveBaseUrl(baseUrl)}/chat/completions`;

  const send = async (responseFormat: unknown): Promise<Response> => {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, response_format: responseFormat }),
      });
    } catch {
      throw new AiProviderError(unreachableMessage(), 'unreachable');
    }
  };

  // Constrained decoding against the envelope schema is the strongest guarantee of a parseable
  // response, but Ollama only gained `json_schema` support in its OpenAI-compatible endpoint in
  // 0.5 — a 400/422 means this build refuses the request shape, so fall back to plain JSON mode.
  let res = await send({ type: 'json_schema', json_schema: AI_ENVELOPE_JSON_SCHEMA });
  if (res.status === 400 || res.status === 422) {
    res = await send({ type: 'json_object' });
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new AiProviderError(badStatusMessage(res.status, bodyText), 'bad_status');
  }

  const json = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiProviderError(malformedResponseMessage, 'malformed_response');
  }
  return content;
}

export async function chatWithOllamaDirect(
  messages: AiChatMessage[],
  currentDraft: RecipeInput | null,
  options: { baseUrl: string | null; model: string; locale: SupportedLocale }
): Promise<AiChatEnvelope> {
  const draft = currentDraft as AiRecipeDraft | null;
  const raw = await postChatCompletion(
    options.baseUrl,
    options.model,
    buildChatMessages(messages, draft, options.locale)
  );
  return parseChatEnvelope(raw, draft);
}

export async function listOllamaModelsDirect(
  baseUrl: string | null
): Promise<{ models: { name: string }[] }> {
  let res: Response;
  try {
    res = await fetch(`${resolveBaseUrl(baseUrl)}/models`);
  } catch {
    throw new AiProviderError(unreachableMessage(), 'unreachable');
  }

  if (!res.ok) {
    throw new AiProviderError(badStatusMessage(res.status, ''), 'bad_status');
  }

  const json = await res.json().catch(() => null);
  if (!Array.isArray(json?.data)) {
    throw new AiProviderError(malformedModelListMessage, 'malformed_response');
  }

  return {
    models: json.data
      .filter((m: unknown): m is { id: string } => typeof (m as { id?: unknown })?.id === 'string')
      .map((m: { id: string }) => ({ name: m.id })),
  };
}
