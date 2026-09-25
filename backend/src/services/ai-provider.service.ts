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
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// `big` is reserved for the opening turn of a new recipe, where the model invents the whole thing
// from one line of prompt; `medium` edits a draft already in hand; `small` estimates nutrition for a
// recipe that is already written; `image` reads a photo and so must be a vision-capable model.
export type AiModelTier = 'big' | 'medium' | 'small' | 'image';

// Nutrition estimates go straight to Google's own OpenAI-compatible endpoint rather than through
// OpenRouter; every other tier is routed by OpenRouter.
type AiBackend = 'openrouter' | 'gemini';

const TIER_BACKEND: Record<AiModelTier, AiBackend> = {
  big: 'openrouter',
  medium: 'openrouter',
  small: 'gemini',
  image: 'openrouter',
};

const BACKEND_LABEL: Record<AiBackend, string> = { openrouter: 'OpenRouter', gemini: 'Gemini' };

const DEFAULT_MODELS: Record<AiModelTier, string> = {
  big: 'google/gemini-3.6-flash',
  medium: 'google/gemini-3.5-flash-lite',
  // A Gemini API model id (no `google/` vendor prefix), since this tier bypasses OpenRouter.
  small: 'gemini-3.5-flash-lite',
  image: 'google/gemini-3.6-flash',
};

type ReasoningEffort = 'max' | 'high' | 'medium' | 'low';

// Writing a recipe from nothing and reading one off a photo get the most thinking; edits to a draft
// in hand get a little; nutrition is left to the model's own default.
const REASONING_EFFORT: Partial<Record<AiModelTier, ReasoningEffort>> = {
  big: 'high',
  medium: 'low',
  image: 'high',
};

interface TierConfig {
  backend: AiBackend;
  model: string;
  fallbackModel?: string;
  /** OpenRouter provider slugs in priority order; empty lets OpenRouter route freely. */
  providers: string[];
  reasoningEffort?: ReasoningEffort;
}

// Read lazily, like the API key, so a changed .env takes effect without touching module state.
// Env names are AI_MODEL_<TIER>, AI_MODEL_<TIER>_FALLBACK, AI_PROVIDER_<TIER> and
// AI_PROVIDER_<TIER>_FALLBACK. The Gemini tier reads only AI_MODEL_<TIER>: Gemini has no
// OpenRouter-style fallback models or provider pinning.
function resolveTierConfig(tier: AiModelTier): TierConfig {
  const suffix = tier.toUpperCase();
  const env = (name: string) => process.env[name]?.trim() || undefined;
  const backend = TIER_BACKEND[tier];
  const model = env(`AI_MODEL_${suffix}`) ?? DEFAULT_MODELS[tier];
  const reasoningEffort = REASONING_EFFORT[tier];

  if (backend === 'gemini') return { backend, model, providers: [], reasoningEffort };

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
    backend,
    model,
    fallbackModel: env(`AI_MODEL_${suffix}_FALLBACK`),
    providers: provider ? [provider, ...(fallbackProvider ? [fallbackProvider] : [])] : [],
    reasoningEffort,
  };
}

// OpenRouter extensions to the chat-completions body. `models` makes OpenRouter itself retry on the
// fallback model when the primary errors (rate limit, downtime, moderation), so there is no retry
// loop of our own. The provider list is a strict pin: `allow_fallbacks: false` means only the listed
// providers are ever used, tried in order — which also applies to the fallback model. `reasoning`
// is OpenRouter's unified reasoning control; models without reasoning support ignore it.
function routingBody(config: TierConfig): Record<string, unknown> {
  if (config.backend === 'gemini') return { model: config.model };
  return {
    model: config.model,
    ...(config.fallbackModel ? { models: [config.model, config.fallbackModel] } : {}),
    ...(config.providers.length
      ? { provider: { order: config.providers, allow_fallbacks: false } }
      : {}),
    ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
  };
}

type ChatResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; json_schema: AiJsonSchemaFormat };

function samplingBody(sampling: AiSamplingParams | undefined): Record<string, unknown> {
  if (!sampling) return {};
  const { temperature, topP } = sampling;
  return { temperature, top_p: topP };
}

// Read lazily (at call time, not import time) so the app still boots without an API key set —
// self-hosters who don't want the AI assistant shouldn't be forced to configure one. A missing
// GEMINI_API_KEY only takes nutrition estimates offline; the rest of the assistant keeps working.
const geminiNotConfiguredMessage =
  'Nutrition estimates are not configured on this server. Ask your administrator to set GEMINI_API_KEY.';

function requireApiKey(backend: AiBackend): string {
  if (backend === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new AiProviderError(geminiNotConfiguredMessage, 'not_configured');
    return key;
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiProviderError(notConfiguredMessage, 'not_configured');
  return key;
}

function createClient(backend: AiBackend, apiKey: string): OpenAI {
  if (backend === 'gemini') {
    return new OpenAI({ baseURL: GEMINI_BASE_URL, apiKey, maxRetries: 0 });
  }
  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    // Optional app attribution shown on OpenRouter's side (activity page, app rankings).
    defaultHeaders: { 'X-Title': 'Yumbry' },
    maxRetries: 0,
  });
}

// Logged here (not just left to bubble up as a generic 503) so the real cause — the upstream's own
// status and message, e.g. a 503 "model overloaded" — is visible in server logs even though the
// client only ever sees the generic AiProviderError kind/message.
function toAiProviderError(err: unknown, backend: AiBackend): AiProviderError {
  const label = BACKEND_LABEL[backend];
  if (err instanceof APIConnectionError) {
    console.error(`[ai-provider] connection to ${label} failed: ${err.message}`);
    return new AiProviderError(unreachableMessage(), 'unreachable', err);
  }
  if (err instanceof APIError) {
    console.error(`[ai-provider] ${label} responded with HTTP ${err.status}: ${err.message}`);
    return new AiProviderError(
      badStatusMessage(err.status ?? '???', err.message),
      'bad_status',
      err
    );
  }
  console.error(`[ai-provider] unexpected error calling ${label}:`, err);
  return new AiProviderError(unreachableMessage(), 'unreachable', err);
}

// Gemini signals an exhausted quota as a 400 carrying RESOURCE_EXHAUSTED for some limits, which
// would otherwise look like a rejected request shape.
const QUOTA_PATTERN = /resource_exhausted|quota|rate limit|too many requests/i;

// A 400/422 means the endpoint (or the underlying model) refused the request shape (unknown
// response_format) rather than the model failing, so it's safe to resend once asking only for JSON.
// A quota-shaped 400 is excluded: retrying it would only burn more of the exhausted quota.
function rejectsRequestShape(err: unknown): boolean {
  return (
    err instanceof APIError &&
    (err.status === 400 || err.status === 422) &&
    !QUOTA_PATTERN.test(err.message)
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
  config: TierConfig,
  messages: AiChatMessage[],
  options: ChatOptions
): Promise<string> {
  const client = createClient(config.backend, requireApiKey(config.backend));
  const fail = (err: unknown) => toAiProviderError(err, config.backend);

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
    if (!options.jsonSchema || !rejectsRequestShape(err)) throw fail(err);
    // A 400/422 on the schema request means the endpoint refused the request shape rather than
    // the model failing, so it's safe to retry once with less asked of it. Sampling params are
    // carried into this first retry since a schema-only endpoint often still accepts them; if
    // that retry itself 400s, drop sampling too on the last attempt.
    warnDowngrade('json_schema', 'json_object', err);
    try {
      response = await create({ type: 'json_object' }, true);
    } catch (retryErr) {
      if (!rejectsRequestShape(retryErr)) throw fail(retryErr);
      warnDowngrade('json_object with sampling', 'json_object alone', retryErr);
      try {
        response = await create({ type: 'json_object' }, false);
      } catch (finalErr) {
        throw fail(finalErr);
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
