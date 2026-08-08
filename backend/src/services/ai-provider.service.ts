import OpenAI, { APIConnectionError, APIError } from 'openai';
import {
  AiProviderError,
  DEFAULT_BASE_URLS,
  badStatusMessage,
  malformedModelListMessage,
  malformedResponseMessage,
  unreachableMessage,
  type AiChatMessage,
  type AiJsonSchemaFormat,
  type AiProvider,
  type AiProviderErrorKind,
} from 'yumbry-shared';

export type { AiChatMessage, AiProvider, AiProviderErrorKind };
export { AiProviderError };

type ChatResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; json_schema: AiJsonSchemaFormat };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

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

// Not every OpenAI-compatible endpoint accepts a `json_schema` response format — the
// Anthropic/Gemini compat shims and older Ollama builds reject the request outright. A 400/422
// means the request shape was refused (rather than the model failing), so it's safe to resend
// once asking only for JSON.
function rejectsRequestShape(err: unknown): boolean {
  return err instanceof APIError && (err.status === 400 || err.status === 422);
}

export async function chatWithAi(
  messages: AiChatMessage[],
  options: {
    provider: AiProvider;
    baseUrl: string | null;
    apiKey: string | null;
    model: string;
    jsonSchema?: AiJsonSchemaFormat;
  }
): Promise<string> {
  const client = createClient(options);

  const create = (responseFormat?: ChatResponseFormat) =>
    client.chat.completions.create({
      model: options.model,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    });

  let response;
  try {
    response = await create(
      options.jsonSchema ? { type: 'json_schema', json_schema: options.jsonSchema } : undefined
    );
  } catch (err) {
    if (!options.jsonSchema || !rejectsRequestShape(err)) throw toAiProviderError(err);
    try {
      response = await create({ type: 'json_object' });
    } catch (retryErr) {
      throw toAiProviderError(retryErr);
    }
  }

  const content = response.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiProviderError(malformedResponseMessage, 'malformed_response');
  }
  return content;
}

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
