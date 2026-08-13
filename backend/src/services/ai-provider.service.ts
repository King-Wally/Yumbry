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
const DEFAULT_BIG_MODEL = 'gemini-3.6-flash';
const DEFAULT_SMALL_MODEL = 'gemini-3.5-flash-lite';

// `big` is reserved for the opening turn of a new recipe, where the model invents the whole thing
// from one line of prompt. Every other turn edits an existing draft, which the small model handles.
export type AiModelTier = 'big' | 'small';

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

function resolveModel(tier: AiModelTier): string {
  return tier === 'big'
    ? process.env.GEMINI_MODEL_BIG || DEFAULT_BIG_MODEL
    : process.env.GEMINI_MODEL_SMALL || DEFAULT_SMALL_MODEL;
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

const QUOTA_PATTERN = /resource_exhausted|quota|rate limit|too many requests/i;

// Gemini signals an exhausted quota as a 429, but also as a 403/400 carrying RESOURCE_EXHAUSTED
// depending on which limit was hit — the only case where retrying on a different model helps.
function isQuotaError(err: unknown): boolean {
  if (!(err instanceof APIError)) return false;
  if (err.status === 429) return true;
  return (err.status === 403 || err.status === 400) && QUOTA_PATTERN.test(err.message);
}

// A 400/422 means Gemini's OpenAI-compat endpoint (or the underlying model) refused the request
// shape (unknown response_format) rather than the model failing, so it's safe to resend once
// asking only for JSON. A quota-shaped 400 is excluded: burning it through the downgrade ladder
// would swallow the signal the tier fallback needs.
function rejectsRequestShape(err: unknown): boolean {
  return (
    err instanceof APIError && (err.status === 400 || err.status === 422) && !isQuotaError(err)
  );
}

// Whether the endpoint accepted our `json_schema` response_format is otherwise unobservable: the
// ladder below swallows the rejection and the request still succeeds, so a schema that is silently
// never applied looks exactly like one that works. That distinction decides how much of the unit
// and language contract the prompt alone has to carry, so make the downgrade audible.
function warnDowngrade(from: string, to: string, err: unknown): void {
  const detail = err instanceof APIError ? `${err.status} ${err.message}` : String(err);
  console.warn(`[ai-provider] response_format ${from} rejected, retrying as ${to}: ${detail}`);
}

type ChatOptions = {
  jsonSchema?: AiJsonSchemaFormat;
  sampling?: AiSamplingParams;
};

async function runCompletion(
  model: string,
  messages: AiChatMessage[],
  options: ChatOptions
): Promise<string> {
  const client = createClient(requireApiKey());

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
    warnDowngrade('json_schema', 'json_object', err);
    try {
      response = await create({ type: 'json_object' }, true);
    } catch (retryErr) {
      if (!rejectsRequestShape(retryErr)) throw toAiProviderError(retryErr);
      warnDowngrade('json_object with sampling', 'json_object alone', retryErr);
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

export async function chatWithAi(
  messages: AiChatMessage[],
  options: ChatOptions & { tier?: AiModelTier }
): Promise<string> {
  const tier = options.tier ?? 'small';
  if (tier === 'small') return runCompletion(resolveModel('small'), messages, options);

  try {
    return await runCompletion(resolveModel('big'), messages, options);
  } catch (err) {
    // Only quota exhaustion is worth re-running on another model — a 5xx or an unreachable
    // provider would fail identically on the small one, and a second call would just double the
    // wait before the user sees the error.
    if (!(err instanceof AiProviderError) || !isQuotaError(err.cause)) throw err;
    console.warn(`[ai-provider] big model quota exhausted, falling back to small: ${err.message}`);
    return runCompletion(resolveModel('small'), messages, options);
  }
}
