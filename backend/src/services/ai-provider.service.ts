import OpenAI, { APIConnectionError, APIError } from 'openai';
import type {
  ChatCompletion as OpenAIChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions';
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
import { recordAiUsage } from './ai-budget.service.js';

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
  reasoningEffort?: ReasoningEffort;
}

// Read lazily, like the API key, so a changed .env takes effect without touching module state.
// Each tier reads only AI_MODEL_<TIER>.
function resolveTierConfig(tier: AiModelTier): TierConfig {
  const model = process.env[`AI_MODEL_${tier.toUpperCase()}`]?.trim() || DEFAULT_MODELS[tier];
  return { backend: TIER_BACKEND[tier], model, reasoningEffort: REASONING_EFFORT[tier] };
}

// No `provider` field is sent, so OpenRouter applies its default provider routing (price-weighted
// load balancing with automatic fallback to other providers). `reasoning` is OpenRouter's unified
// reasoning control; models without reasoning support ignore it.
function routingBody(config: TierConfig): Record<string, unknown> {
  if (config.backend === 'gemini') return { model: config.model };
  return {
    model: config.model,
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
  /** Who the call is billed to in the usage ledger that the AI budget is enforced from. */
  userId: string;
  jsonSchema?: AiJsonSchemaFormat;
  sampling?: AiSamplingParams;
};

// OpenRouter adds `cost` to the standard usage block.
type ChatCompletion = OpenAIChatCompletion & { usage?: { cost?: number } };

// OpenRouter reports what it charged as `usage.cost`, in credits (1 credit = 1 USD), on every
// response. Gemini's free tier costs nothing, but each of its requests — failed ones and downgrade
// retries included — spends one of the day's quota, so a Gemini call is recorded even when it fails.
async function recordUsage(
  config: TierConfig,
  tier: AiModelTier,
  userId: string,
  requestCount: number,
  response: ChatCompletion | undefined
): Promise<void> {
  if (!response && config.backend !== 'gemini') return;
  let costUsd = 0;
  if (config.backend === 'openrouter') {
    const cost = response?.usage?.cost;
    if (typeof cost === 'number') costUsd = cost;
    else console.warn('[ai-provider] OpenRouter response carried no usage.cost; recording $0');
  }
  await recordAiUsage({
    userId,
    backend: config.backend,
    tier,
    model: response?.model || config.model,
    promptTokens: response?.usage?.prompt_tokens,
    completionTokens: response?.usage?.completion_tokens,
    costUsd,
    requestCount,
  });
}

async function runCompletion(
  config: TierConfig,
  tier: AiModelTier,
  messages: AiChatMessage[],
  options: ChatOptions
): Promise<string> {
  const client = createClient(config.backend, requireApiKey(config.backend));
  const fail = (err: unknown) => toAiProviderError(err, config.backend);

  let requestCount = 0;
  let response: ChatCompletion | undefined;
  try {
    response = await requestCompletion(client, config, messages, options, fail, () => {
      requestCount++;
    });
  } finally {
    await recordUsage(config, tier, options.userId, requestCount, response);
  }

  const content = response.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiProviderError(malformedResponseMessage, 'malformed_response');
  }
  return content;
}

async function requestCompletion(
  client: OpenAI,
  config: TierConfig,
  messages: AiChatMessage[],
  options: ChatOptions,
  fail: (err: unknown) => AiProviderError,
  onAttempt: () => void
): Promise<ChatCompletion> {
  const create = (responseFormat: ChatResponseFormat | undefined, withSampling: boolean) => {
    onAttempt();
    return client.chat.completions.create({
      ...routingBody(config),
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(withSampling ? samplingBody(options.sampling) : {}),
    } as ChatCompletionCreateParamsNonStreaming);
  };

  const schemaFormat: ChatResponseFormat | undefined = options.jsonSchema
    ? { type: 'json_schema', json_schema: options.jsonSchema }
    : undefined;

  try {
    return await create(schemaFormat, true);
  } catch (err) {
    if (!options.jsonSchema || !rejectsRequestShape(err)) throw fail(err);
    // A 400/422 on the schema request means the endpoint refused the request shape rather than
    // the model failing, so it's safe to retry once with less asked of it. Sampling params are
    // carried into this first retry since a schema-only endpoint often still accepts them; if
    // that retry itself 400s, drop sampling too on the last attempt.
    warnDowngrade('json_schema', 'json_object', err);
    try {
      return await create({ type: 'json_object' }, true);
    } catch (retryErr) {
      if (!rejectsRequestShape(retryErr)) throw fail(retryErr);
      warnDowngrade('json_object with sampling', 'json_object alone', retryErr);
      try {
        return await create({ type: 'json_object' }, false);
      } catch (finalErr) {
        throw fail(finalErr);
      }
    }
  }
}

export async function chatWithAi(
  messages: AiChatMessage[],
  options: ChatOptions & { tier?: AiModelTier }
): Promise<string> {
  const tier = options.tier ?? 'medium';
  return runCompletion(resolveTierConfig(tier), tier, messages, options);
}
