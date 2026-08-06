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
