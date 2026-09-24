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

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// `big` is reserved for the opening turn of a new recipe, where the model invents the whole thing
// from one line of prompt; `medium` edits a draft already in hand; `small` estimates nutrition for a
// recipe that is already written; `image` reads a photo and so must be a vision-capable model.
export type AiModelTier = 'big' | 'medium' | 'small' | 'image';

const DEFAULT_MODELS: Record<AiModelTier, string> = {
  big: 'google/gemini-3.6-flash',
  medium: 'google/gemini-3.5-flash-lite',
  small: 'google/gemini-3.5-flash-lite',
  image: 'google/gemini-3.6-flash',
};

interface TierConfig {
  model: string;
  fallbackModel?: string;
  /** OpenRouter provider slugs in priority order; empty lets OpenRouter route freely. */
  providers: string[];
}

// Read lazily, like the API key, so a changed .env takes effect without touching module state.
// Env names are AI_MODEL_<TIER>, AI_MODEL_<TIER>_FALLBACK, AI_PROVIDER_<TIER> and
// AI_PROVIDER_<TIER>_FALLBACK.
function resolveTierConfig(tier: AiModelTier): TierConfig {
  const suffix = tier.toUpperCase();
  const env = (name: string) => process.env[name]?.trim() || undefined;

  const provider = env(`AI_PROVIDER_${suffix}`);
  const fallbackProvider = env(`AI_PROVIDER_${suffix}_FALLBACK`);
  // A fallback with no primary is almost certainly a typo in the config, and silently promoting it
  // to primary would hide that.
  if (fallbackProvider && !provider) {
    console.warn(
      `[ai-provider] AI_PROVIDER_${suffix}_FALLBACK is set without AI_PROVIDER_${suffix}; ignoring it`
    );
  }

  return {
    model: env(`AI_MODEL_${suffix}`) ?? DEFAULT_MODELS[tier],
    fallbackModel: env(`AI_MODEL_${suffix}_FALLBACK`),
    providers: provider ? [provider, ...(fallbackProvider ? [fallbackProvider] : [])] : [],
  };
}

// OpenRouter extensions to the chat-completions body. `models` makes OpenRouter itself retry on the
// fallback model when the primary errors (rate limit, downtime, moderation), so there is no retry
// loop of our own. The provider list is a strict pin: `allow_fallbacks: false` means only the listed
// providers are ever used, tried in order — which also applies to the fallback model.
function routingBody(config: TierConfig): Record<string, unknown> {
  return {
    model: config.model,
    ...(config.fallbackModel ? { models: [config.model, config.fallbackModel] } : {}),
    ...(config.providers.length
      ? { provider: { order: config.providers, allow_fallbacks: false } }
      : {}),
  };
}

type ChatResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; json_schema: AiJsonSchemaFormat };

function samplingBody(sampling: AiSamplingParams | undefined): Record<string, unknown> {
  if (!sampling) return {};
  const { temperature, topP } = sampling;
  return { temperature, top_p: topP };
}

// Read lazily (at call time, not import time) so the app still boots without an OpenRouter key
// set — self-hosters who don't want the AI assistant shouldn't be forced to configure one.
function requireApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiProviderError(notConfiguredMessage, 'not_configured');
  return key;
}

// Bounds how long a single OpenRouter call can hang before we give up and surface a clean
// `unreachable` error, rather than silently outliving whatever edge/proxy timeout fronts this
// server in production.
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30_000;

// AI_REQUEST_TIMEOUT_MS overrides the default for every call; a caller passing `timeoutMs`
// overrides both, for the one request that is legitimately slower than the rest (reading a photo
// on the image model, where 30s is not enough for a full cookbook page).
function createClient(apiKey: string, timeoutMs = REQUEST_TIMEOUT_MS): OpenAI {
  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    // Optional app attribution shown on OpenRouter's side (activity page, app rankings).
    defaultHeaders: { 'X-Title': 'Yumbry' },
    maxRetries: 0,
    timeout: timeoutMs,
  });
}

// Logged here (not just left to bubble up as a generic 503) so the real cause — OpenRouter's own
// status and message, e.g. a 503 "model overloaded" — is visible in server logs even though the
// client only ever sees the generic AiProviderError kind/message.
function toAiProviderError(err: unknown): AiProviderError {
  if (err instanceof APIConnectionError) {
    console.error(`[ai-provider] connection to OpenRouter failed: ${err.message}`);
    return new AiProviderError(unreachableMessage(), 'unreachable', err);
  }
  if (err instanceof APIError) {
    console.error(`[ai-provider] OpenRouter responded with HTTP ${err.status}: ${err.message}`);
    return new AiProviderError(
      badStatusMessage(err.status ?? '???', err.message),
      'bad_status',
      err
    );
  }
  console.error('[ai-provider] unexpected error calling OpenRouter:', err);
  return new AiProviderError(unreachableMessage(), 'unreachable', err);
}

// A 400/422 means the endpoint (or the underlying model) refused the request shape (unknown
// response_format) rather than the model failing, so it's safe to resend once asking only for JSON.
function rejectsRequestShape(err: unknown): boolean {
  return err instanceof APIError && (err.status === 400 || err.status === 422);
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
  /** Overrides REQUEST_TIMEOUT_MS for this call. */
  timeoutMs?: number;
};

async function runCompletion(
  config: TierConfig,
  messages: AiChatMessage[],
  options: ChatOptions
): Promise<string> {
  const client = createClient(requireApiKey(), options.timeoutMs);

  const create = (responseFormat: ChatResponseFormat | undefined, withSampling: boolean) =>
    client.chat.completions.create({
      ...routingBody(config),
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
  return runCompletion(resolveTierConfig(options.tier ?? 'medium'), messages, options);
}
