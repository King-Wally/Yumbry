import OpenAI, { APIConnectionError, APIError } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
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
  type AiSamplingParams,
} from 'yumbry-shared';

export type { AiChatMessage, AiProvider, AiProviderErrorKind, AiSamplingParams };
export { AiProviderError };

type ChatResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; json_schema: AiJsonSchemaFormat };

// `top_k`/`min_p`/`repeat_penalty` are llama.cpp/Ollama sampler extensions, not part of the
// OpenAI request shape — sending them to OpenAI, Anthropic-compat or Gemini-compat endpoints is
// a 400 waiting to happen. `temperature`/`top_p` are standard OpenAI fields and safe everywhere.
const EXTENDED_SAMPLING_PROVIDERS: ReadonlySet<AiProvider> = new Set(['ollama']);

function samplingBody(
  provider: AiProvider,
  sampling: AiSamplingParams | undefined
): Record<string, unknown> {
  if (!sampling) return {};
  const { temperature, top_p, top_k, min_p, repeat_penalty } = sampling;
  const body: Record<string, unknown> = { temperature, top_p };
  if (EXTENDED_SAMPLING_PROVIDERS.has(provider)) {
    Object.assign(body, { top_k, min_p, repeat_penalty });
  }
  return body;
}

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
    sampling?: AiSamplingParams;
  }
): Promise<string> {
  const client = createClient(options);

  const create = (responseFormat: ChatResponseFormat | undefined, withSampling: boolean) =>
    client.chat.completions.create({
      model: options.model,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(withSampling ? samplingBody(options.provider, options.sampling) : {}),
    } as ChatCompletionCreateParamsNonStreaming);

  const schemaFormat: ChatResponseFormat | undefined = options.jsonSchema
    ? { type: 'json_schema', json_schema: options.jsonSchema }
    : undefined;

  let response;
  try {
    response = await create(schemaFormat, true);
  } catch (err) {
    if (!options.jsonSchema || !rejectsRequestShape(err)) throw toAiProviderError(err);
    // A 400/422 on the schema request means the endpoint refused the request shape (unknown
    // response_format, or possibly an unrecognized sampling field) rather than the model
    // failing, so it's safe to retry once with less asked of it. Sampling params are carried
    // into this first retry since a schema-only endpoint often still accepts them; if that
    // retry itself 400s, drop sampling too on the last attempt — an unsupported sampling field
    // is exactly the kind of thing a downgrade should shed before giving up.
    try {
      response = await create({ type: 'json_object' }, true);
    } catch (retryErr) {
      if (!rejectsRequestShape(retryErr)) throw toAiProviderError(retryErr);
      try {
        response = await create({ type: 'json_object' }, false);
      } catch (finalErr) {
        throw toAiProviderError(finalErr);
      }
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
