import OpenAI, { APIConnectionError, APIError } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import {
  AiProviderError,
  badStatusMessage,
  malformedResponseMessage,
  notConfiguredMessage,
  unreachableMessage,
  type AiChatMessage,
  type AiJsonSchemaFormat,
  type AiProviderErrorKind,
  type AiSamplingParams,
} from 'yumbry-shared';

export type { AiChatMessage, AiProviderErrorKind, AiSamplingParams };
export { AiProviderError };

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_MODEL = 'gemini-2.5-flash';

type ChatResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; json_schema: AiJsonSchemaFormat };

function samplingBody(sampling: AiSamplingParams | undefined): Record<string, unknown> {
  if (!sampling) return {};
  const { temperature, top_p } = sampling;
  return { temperature, top_p };
}

// Read lazily (at call time, not import time) so the app still boots without a Gemini key
// set — self-hosters who don't want the AI assistant shouldn't be forced to configure one.
function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiProviderError(notConfiguredMessage, 'not_configured');
  return key;
}

function resolveModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({ baseURL: GEMINI_BASE_URL, apiKey, maxRetries: 0 });
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

// A 400/422 means Gemini's OpenAI-compat endpoint (or the underlying model) refused the request
// shape (unknown response_format) rather than the model failing, so it's safe to resend once
// asking only for JSON.
function rejectsRequestShape(err: unknown): boolean {
  return err instanceof APIError && (err.status === 400 || err.status === 422);
}

export async function chatWithAi(
  messages: AiChatMessage[],
  options: {
    jsonSchema?: AiJsonSchemaFormat;
    sampling?: AiSamplingParams;
  }
): Promise<string> {
  const client = createClient(requireApiKey());
  const model = resolveModel();

  const create = (responseFormat: ChatResponseFormat | undefined, withSampling: boolean) =>
    client.chat.completions.create({
      model,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(withSampling ? samplingBody(options.sampling) : {}),
    } as ChatCompletionCreateParamsNonStreaming);

  const schemaFormat: ChatResponseFormat | undefined = options.jsonSchema
    ? { type: 'json_schema', json_schema: options.jsonSchema }
    : undefined;

  let response;
  try {
    response = await create(schemaFormat, true);
  } catch (err) {
    if (!options.jsonSchema || !rejectsRequestShape(err)) throw toAiProviderError(err);
    // A 400/422 on the schema request means the endpoint refused the request shape rather than
    // the model failing, so it's safe to retry once with less asked of it. Sampling params are
    // carried into this first retry since a schema-only endpoint often still accepts them; if
    // that retry itself 400s, drop sampling too on the last attempt.
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
