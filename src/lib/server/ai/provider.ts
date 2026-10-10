import OpenAI, { APIConnectionError, APIError } from 'openai';
import type {
	ChatCompletion as OpenAIChatCompletion,
	ChatCompletionCreateParamsNonStreaming
} from 'openai/resources/chat/completions';
import {
	AI_MODEL_BIG,
	AI_MODEL_IMAGE,
	AI_MODEL_MEDIUM,
	AI_MODEL_SMALL,
	GEMINI_API_KEY,
	GEMINI_BASE_URL,
	OPENROUTER_API_KEY,
	OPENROUTER_BASE_URL
} from '$app/env/private';
import { recordAiUsage, type AiBackendName } from '#lib/server/ai/budget.ts';
import { AiProviderError } from '#lib/server/ai/errors.ts';
import type {
	AiChatMessage,
	AiJsonSchemaFormat,
	AiSamplingParams
} from '#lib/shared/ai/recipe-draft.ts';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// `big` is reserved for the opening turn of a new recipe, where the model invents the whole thing
// from one line of prompt; `medium` edits a draft already in hand; `small` estimates nutrition for a
// recipe that is already written; `image` reads a photo and so must be a vision-capable model.
export type AiModelTier = 'big' | 'medium' | 'small' | 'image';

// Nutrition estimates go straight to Google's own OpenAI-compatible endpoint rather than through
// OpenRouter; every other tier is routed by OpenRouter.
const TIER_BACKEND: Record<AiModelTier, AiBackendName> = {
	big: 'openrouter',
	medium: 'openrouter',
	small: 'gemini',
	image: 'openrouter'
};

const BACKEND_LABEL: Record<AiBackendName, string> = { openrouter: 'OpenRouter', gemini: 'Gemini' };

const DEFAULT_MODELS: Record<AiModelTier, string> = {
	big: 'google/gemini-3.6-flash',
	medium: 'google/gemini-3.5-flash-lite',
	// A Gemini API model id (no `google/` vendor prefix), since this tier bypasses OpenRouter.
	small: 'gemini-3.5-flash-lite',
	image: 'google/gemini-3.6-flash'
};

type ReasoningEffort = 'max' | 'high' | 'medium' | 'low';

// Writing a recipe from nothing and reading one off a photo get the most thinking; edits to a draft
// in hand get a little; nutrition is left to the model's own default.
const REASONING_EFFORT: Partial<Record<AiModelTier, ReasoningEffort>> = {
	big: 'high',
	medium: 'low',
	image: 'high'
};

interface TierConfig {
	backend: AiBackendName;
	model: string;
	reasoningEffort?: ReasoningEffort;
}

// Every key, URL and model is read at call time, not import time, so the app boots without any of
// them: self-hosters who don't want the assistant needn't configure it.
function configuredModel(tier: AiModelTier): string | undefined {
	const models = {
		big: AI_MODEL_BIG,
		medium: AI_MODEL_MEDIUM,
		small: AI_MODEL_SMALL,
		image: AI_MODEL_IMAGE
	};
	return models[tier]?.trim() || undefined;
}

function resolveTierConfig(tier: AiModelTier): TierConfig {
	return {
		backend: TIER_BACKEND[tier],
		model: configuredModel(tier) ?? DEFAULT_MODELS[tier],
		reasoningEffort: REASONING_EFFORT[tier]
	};
}

// No `provider` field is sent, so OpenRouter applies its default provider routing (price-weighted
// load balancing with automatic fallback to other providers). `reasoning` is OpenRouter's unified
// reasoning control; models without reasoning support ignore it.
function routingBody(config: TierConfig): Record<string, unknown> {
	if (config.backend === 'gemini') return { model: config.model };
	return {
		model: config.model,
		...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {})
	};
}

type ChatResponseFormat =
	{ type: 'json_object' } | { type: 'json_schema'; json_schema: AiJsonSchemaFormat };

function samplingBody(sampling: AiSamplingParams | undefined): Record<string, unknown> {
	if (!sampling) return {};
	const { temperature, topP } = sampling;
	return { temperature, top_p: topP };
}

function requireApiKey(backend: AiBackendName): string {
	if (backend === 'gemini') {
		if (!GEMINI_API_KEY) throw new AiProviderError('GEMINI_API_KEY is not set.', 'not_configured');
		return GEMINI_API_KEY;
	}
	if (!OPENROUTER_API_KEY)
		throw new AiProviderError('OPENROUTER_API_KEY is not set.', 'not_configured');
	return OPENROUTER_API_KEY;
}

// The *_BASE_URL overrides exist so the e2e suite can point both backends at a local fake; they are
// unset in production.
function createClient(backend: AiBackendName, apiKey: string): OpenAI {
	if (backend === 'gemini') {
		const baseURL = GEMINI_BASE_URL?.trim() || DEFAULT_GEMINI_BASE_URL;
		return new OpenAI({ baseURL, apiKey, maxRetries: 0 });
	}
	return new OpenAI({
		baseURL: OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
		apiKey,
		// Optional app attribution shown on OpenRouter's side (activity page, app rankings).
		defaultHeaders: { 'X-Title': 'Yumbry' },
		maxRetries: 0
	});
}

// Logged here because the caller only shows the kind's generic message: the upstream's own status
// and text (a 503 "model overloaded", say) are only visible in the server log.
function toAiProviderError(err: unknown, backend: AiBackendName): AiProviderError {
	const label = BACKEND_LABEL[backend];
	if (err instanceof APIConnectionError) {
		console.error(`[ai-provider] connection to ${label} failed: ${err.message}`);
		return new AiProviderError(`Could not reach ${label}.`, 'unreachable', err);
	}
	if (err instanceof APIError) {
		console.error(`[ai-provider] ${label} responded with HTTP ${err.status}: ${err.message}`);
		return new AiProviderError(
			`${label} responded with HTTP ${err.status}: ${err.message}`,
			'bad_status',
			err
		);
	}
	console.error(`[ai-provider] unexpected error calling ${label}:`, err);
	return new AiProviderError(`Could not reach ${label}.`, 'unreachable', err);
}

// Gemini signals an exhausted quota as a 400 carrying RESOURCE_EXHAUSTED for some limits, which
// would otherwise look like a rejected request shape.
const QUOTA_PATTERN = /resource_exhausted|quota|rate limit|too many requests/i;

function rejectsRequestShape(err: unknown): boolean {
	return (
		err instanceof APIError &&
		(err.status === 400 || err.status === 422) &&
		!QUOTA_PATTERN.test(err.message)
	);
}

// The request still succeeds after a downgrade, so a schema that is never applied would look exactly
// like one that works. Whether it was decides how much the prompt alone has to carry, so say so.
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
		requestCount
	});
}

type CreateCompletion = (
	responseFormat: ChatResponseFormat | undefined,
	withSampling: boolean
) => Promise<ChatCompletion>;

/**
 * The downgrade ladder. Not every model behind OpenRouter or Gemini's compat layer accepts a
 * `json_schema` response format, or sampling alongside one. A 400/422 (other than a quota error)
 * means the endpoint refused the request shape rather than the model failing, so the request is
 * resent with less asked of it: `json_schema` with sampling, then `json_object` with sampling, then
 * `json_object` alone. Any other failure ends the ladder.
 *
 * The lower rungs send no schema, so everything the schema constrains is also stated in the prompt,
 * and every parser of a model's answer tolerates the loose JSON a schema-free model sends.
 */
async function requestCompletion(
	create: CreateCompletion,
	jsonSchema: AiJsonSchemaFormat | undefined
): Promise<ChatCompletion> {
	if (!jsonSchema) return create(undefined, true);
	try {
		return await create({ type: 'json_schema', json_schema: jsonSchema }, true);
	} catch (err) {
		if (!rejectsRequestShape(err)) throw err;
		warnDowngrade('json_schema', 'json_object', err);
	}
	try {
		return await create({ type: 'json_object' }, true);
	} catch (err) {
		if (!rejectsRequestShape(err)) throw err;
		warnDowngrade('json_object with sampling', 'json_object alone', err);
	}
	return create({ type: 'json_object' }, false);
}

async function runCompletion(
	config: TierConfig,
	tier: AiModelTier,
	messages: AiChatMessage[],
	options: ChatOptions
): Promise<string> {
	const client = createClient(config.backend, requireApiKey(config.backend));

	let requestCount = 0;
	const create: CreateCompletion = (responseFormat, withSampling) => {
		requestCount++;
		return client.chat.completions.create({
			...routingBody(config),
			messages,
			...(responseFormat ? { response_format: responseFormat } : {}),
			...(withSampling ? samplingBody(options.sampling) : {})
		} as ChatCompletionCreateParamsNonStreaming) as Promise<ChatCompletion>;
	};

	let response: ChatCompletion | undefined;
	try {
		response = await requestCompletion(create, options.jsonSchema);
	} catch (err) {
		throw toAiProviderError(err, config.backend);
	} finally {
		await recordUsage(config, tier, options.userId, requestCount, response);
	}

	const content = response.choices[0]?.message?.content;
	if (typeof content !== 'string') {
		throw new AiProviderError('The reply had no assistant message.', 'malformed_response');
	}
	return content;
}

/** One completion from the tier's model (default `medium`), billed to `userId` in the ledger. The
 * caller checks the budget first (`assertOpenRouterBudget` / `assertGeminiQuota`). */
export async function chatWithAi(
	messages: AiChatMessage[],
	options: ChatOptions & { tier?: AiModelTier }
): Promise<string> {
	const tier = options.tier ?? 'medium';
	return runCompletion(resolveTierConfig(tier), tier, messages, options);
}
