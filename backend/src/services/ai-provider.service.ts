import OpenAI, { APIConnectionError, APIError } from 'openai';
import {
  AiProviderError,
  DEFAULT_OLLAMA_BASE_URL,
  badStatusMessage,
  malformedModelListMessage,
  malformedResponseMessage,
  unreachableMessage,
  type AiChatMessage,
  type AiProvider,
  type AiProviderErrorKind,
} from 'yumbry-shared';

export type { AiChatMessage, AiProvider, AiProviderErrorKind };
export { AiProviderError };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

const DEFAULT_BASE_URLS: Record<Exclude<AiProvider, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: DEFAULT_OLLAMA_BASE_URL,
};

/** Resolves the base URL to actually call: the user's stored override if
 * present, otherwise each hosted provider's known OpenAI-compatible endpoint.
 * `custom` has no default — the caller must always supply a base_url for it
 * (enforced by AiSettingsBodySchema at the API boundary). */
export function resolveBaseUrl(provider: AiProvider, baseUrl: string | null): string {
  if (baseUrl) return normalizeBaseUrl(baseUrl);
  if (provider === 'custom') {
    throw new AiProviderError('A base URL is required for a custom provider.', 'unreachable');
  }
  return DEFAULT_BASE_URLS[provider];
}

function createClient(options: {
  provider: AiProvider;
  baseUrl: string | null;
  apiKey: string | null;
}): OpenAI {
  return new OpenAI({
    baseURL: resolveBaseUrl(options.provider, options.baseUrl),
    apiKey: options.apiKey || 'unused',
    // Fail fast rather than retrying with backoff — matches the old ollama-js
    // client's behavior and keeps AiProviderError kinds predictable for callers.
    maxRetries: 0,
  });
}

function toAiProviderError(err: unknown): AiProviderError {
  if (err instanceof APIConnectionError) {
    return new AiProviderError(unreachableMessage(), 'unreachable', err);
  }
  if (err instanceof APIError) {
    return new AiProviderError(
      badStatusMessage(err.status ?? '???', err.message),
      'bad_status',
      err
    );
  }
  return new AiProviderError(unreachableMessage(), 'unreachable', err);
}

/** Calls the provider's non-streaming chat-completions endpoint and returns
 * the assistant's reply text. Throws AiProviderError with a `kind` the caller
 * can map to an HTTP status; never throws a bare openai-SDK error. */
export async function chatWithAi(
  messages: AiChatMessage[],
  options: {
    provider: AiProvider;
    baseUrl: string | null;
    apiKey: string | null;
    model: string;
    jsonMode?: boolean;
  }
): Promise<string> {
  const client = createClient(options);

  let response;
  try {
    response = await client.chat.completions.create({
      model: options.model,
      messages,
      ...(options.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    });
  } catch (err) {
    throw toAiProviderError(err);
  }

  const content = response.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiProviderError(malformedResponseMessage, 'malformed_response');
  }
  return content;
}

/** Lists available models, for the Settings page dropdown. Best-effort: works
 * for OpenAI/Ollama/custom endpoints that implement GET /v1/models. If a
 * provider doesn't support this, the caller falls back to a free-text model
 * input, so failures here don't need special-casing per provider. */
export async function listAiModels(options: {
  provider: AiProvider;
  baseUrl: string | null;
  apiKey: string | null;
}): Promise<{ name: string }[]> {
  const client = createClient(options);

  let response;
  try {
    response = await client.models.list();
  } catch (err) {
    throw toAiProviderError(err);
  }

  const models = response.data;
  if (!Array.isArray(models)) {
    throw new AiProviderError(malformedModelListMessage, 'malformed_response');
  }

  return models.filter((m) => typeof m?.id === 'string').map((m) => ({ name: m.id }));
}
