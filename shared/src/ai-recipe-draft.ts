export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiRecipeDraft {
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: number;
  ingredients: string[];
  instructions: { step_number: number; text: string }[];
  tags: string[];
  category: string | null;
}

export interface AiChatEnvelope {
  reply: string;
  recipe: AiRecipeDraft;
}

export const SUPPORTED_LOCALES = ['en', 'nl', 'fr', 'es'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  nl: 'Flemish Dutch',
  fr: 'French',
  es: 'Spanish',
};

// Example lines shown in the prompt, per locale.
const EXAMPLES: Record<SupportedLocale, { ingredient: string; instruction: string }> = {
  en: { ingredient: '450 g flour', instruction: 'Finely chop the onion.' },
  nl: { ingredient: '450 g bloem', instruction: 'Snijd de ajuin fijn.' },
  fr: { ingredient: '450 g farine', instruction: "Hachez finement l'oignon." },
  es: { ingredient: '450 g harina', instruction: 'Pica finamente la cebolla.' },
};

export interface AiJsonSchemaFormat {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

/**
 * `temperature`/`top_p` are standard OpenAI fields, sent to every provider. `top_k`/`min_p`/
 * `repeat_penalty` are llama.cpp/Ollama sampler extensions — sending them to OpenAI, Anthropic
 * or Gemini's compat endpoints would 400, so callers must gate those on provider (see
 * `chatWithAi` in backend/src/services/ai-provider.service.ts and the equivalent gating in
 * frontend/src/services/ollama-direct.ts).
 */
export interface AiSamplingParams {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repeat_penalty?: number;
}

/**
 * Sampling tuned for constrained JSON recipe drafting: low variance (the failure mode we're
 * guarding against is invented quantities, not repetitive prose) and no repetition penalty,
 * since the envelope legitimately repeats structural tokens (`", "`, `"_minutes"`) and recipes
 * legitimately repeat ingredient names across the ingredient list and the steps — penalizing
 * that under grammar-constrained decoding just pushes the model onto worse *allowed* tokens.
 * A single global profile rather than a per-provider one: the task's needs are provider-
 * independent, only wire compatibility differs (see `AiSamplingParams`).
 */
export const RECIPE_SAMPLING: AiSamplingParams = {
  temperature: 0.6,
  top_p: 0.95,
  top_k: 64,
  min_p: 0,
  repeat_penalty: 1.0,
};

/**
 * Sent as `response_format: { type: 'json_schema', json_schema: ... }` so providers that
 * support constrained decoding (OpenAI, recent Ollama, most custom endpoints) make an
 * invalid response structurally impossible rather than merely discouraged.
 *
 * Shaped for OpenAI's `strict: true` rules: every property listed in `required`,
 * `additionalProperties: false` everywhere, and optionality expressed as a nullable type —
 * hence `"recipe": null` for a chat-only turn instead of an absent key.
 *
 * `image_path` is deliberately absent: the model can't produce one, and parseChatEnvelope
 * carries it forward from the current draft.
 */
export const AI_ENVELOPE_JSON_SCHEMA: AiJsonSchemaFormat = {
  name: 'recipe_chat_turn',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'recipe'],
    properties: {
      reply: { type: 'string' },
      recipe: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: [
          'title',
          'description',
          'prep_time_minutes',
          'cook_time_minutes',
          'total_time_minutes',
          'servings',
          'ingredients',
          'instructions',
          'tags',
          'category',
        ],
        properties: {
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          prep_time_minutes: { type: ['integer', 'null'] },
          cook_time_minutes: { type: ['integer', 'null'] },
          total_time_minutes: { type: ['integer', 'null'] },
          servings: { type: 'integer' },
          ingredients: { type: 'array', items: { type: 'string' } },
          instructions: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          category: { type: ['string', 'null'] },
        },
      },
    },
  },
};

// A filled skeleton rather than a prose description of the shape: models copy a concrete
// example far more reliably than they follow a spec, and it stays valid JSON (no `//`
// comments) so nothing invalid can be echoed back into the response.
const ENVELOPE_SKELETON = `{
  "reply": "string",
  "recipe": {
    "title": "string",
    "description": "string or null",
    "prep_time_minutes": 0,
    "cook_time_minutes": 0,
    "total_time_minutes": 0,
    "servings": 4,
    "ingredients": ["<amount> <unit> <name>"],
    "instructions": ["one short imperative step"],
    "tags": ["string"],
    "category": "string or null"
  }
}`;

function languageRules(locale: SupportedLocale): string {
  const languageName = LANGUAGE_NAMES[locale];

  // English needs no translation stage
  if (locale === 'en') {
    return `- Write the recipe in ${languageName}.`;
  }

  // Deliberately a single, directly executable instruction rather than "draft in English
  // first, then translate as a final step": under grammar-constrained decoding every token is
  // already inside the JSON envelope, so there is nowhere for a hidden English draft to go —
  // asking for one is an instruction the model cannot actually follow, which for a small model
  // is not a harmless no-op but noise that degrades the instructions around it.
  const flemishNote =
    locale === 'nl'
      ? ' Use Flemish vocabulary as spoken in Flanders, not Netherlands Dutch — "ajuin" not "ui", "kropsla" not "krop sla".'
      : '';

  return (
    `- Write the recipe in ${languageName}, converting every measurement to metric yourself if the ` +
    `dish is normally described with imperial units.${flemishNote}`
  );
}

function buildChatSystemPrompt(locale: SupportedLocale = 'en'): AiChatMessage {
  const languageName = LANGUAGE_NAMES[locale];
  const example = EXAMPLES[locale];

  return {
    role: 'system',
    content: `You are a friendly recipe-development assistant. You chat with a home cook while a live
preview beside the chat shows your current best draft of the recipe.

## When to include the recipe
- The user asks for a recipe, or for any change to the current one: include the full "recipe" object.
- Always send every field, not only what changed. Copy the fields you are not changing verbatim from
  the current draft, and change only what the latest message actually asks for.
- The user is only chatting — thanking you, making small talk, or asking a question that requests no
  change: set "recipe" to null and answer in "reply" alone. The preview keeps the existing draft.
- First message with no draft yet: always produce a full best-guess recipe from whatever the user has
  said. Never refuse and never wait for more detail — ask any clarifying question in "reply" while
  still drafting a reasonable recipe.

## Writing the recipe
${languageRules(locale)}
- Metric units only: g, kg, ml, l, °C. Never cups, ounces, pounds, tablespoons or °F.
- Each "ingredients" entry is one plain line, "<amount> <unit> <name>" and nothing else — for example
  "${example.ingredient}". No prep notes, no parentheses, no alternatives; that detail belongs in a step.
- Each "instructions" entry is one short imperative action — for example "${example.instruction}". No
  step numbers, no explanation of why it matters, no technique commentary.
- "total_time_minutes" equals prep plus cook time, unless there is resting or marinating time to add.
- "category" is a single short category such as "Main course", "Dessert" or "Breakfast".

## Writing the reply
- Write "reply" in ${languageName}, 2-3 sentences at most, and never leave it empty.
- Say briefly what the recipe is and what you changed, or ask a clarifying question.
- Do not restate the ingredient list or justify every choice — the preview already shows the recipe.

## Response format
Respond with one JSON object and nothing else: no markdown fences, no text before or after it, no
comments inside it.
${ENVELOPE_SKELETON}`,
  };
}

/**
 * The draft as the model is asked to write it: flat instruction strings, and no `image_path`
 * (which it never sets). Showing it our internal shape instead would contradict the schema in
 * the system prompt, and invites a response mirroring that shape back.
 */
function toPromptRecipe(draft: AiRecipeDraft): Record<string, unknown> {
  return {
    title: draft.title,
    description: draft.description,
    prep_time_minutes: draft.prep_time_minutes,
    cook_time_minutes: draft.cook_time_minutes,
    total_time_minutes: draft.total_time_minutes,
    servings: draft.servings,
    ingredients: draft.ingredients,
    instructions: draft.instructions.map((step) => step.text),
    tags: draft.tags,
    category: draft.category,
  };
}

/**
 * Assistant turns are stored client-side as the bare `reply` text, but sending them back that
 * way makes every previous assistant message an in-context example of the WRONG output format —
 * and models weigh recent examples far above system instructions. Re-serializing them as JSON
 * envelopes keeps the whole conversation consistent with the format we're asking for.
 */
function serializeAssistantTurn(content: string, recipe: AiRecipeDraft | null): string {
  return JSON.stringify(
    recipe ? { reply: content, recipe: toPromptRecipe(recipe) } : { reply: content }
  );
}

function lastAssistantIndex(conversation: AiChatMessage[]): number {
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    if (conversation[i].role === 'assistant') return i;
  }
  return -1;
}

export function buildChatMessages(
  conversation: AiChatMessage[],
  currentDraft: AiRecipeDraft | null,
  locale: SupportedLocale = 'en'
): AiChatMessage[] {
  const draftTurnIndex = lastAssistantIndex(conversation);

  // The draft belongs inside the most recent assistant turn when there is one: that single
  // message then doubles as a complete, correct example of the exact response we want next.
  // Otherwise (first turn, or a draft seeded from an existing recipe in improve mode) it goes
  // in a system message of its own.
  const inlineDraft = draftTurnIndex >= 0 && currentDraft !== null;

  const messages: AiChatMessage[] = [buildChatSystemPrompt(locale)];

  if (!inlineDraft) {
    messages.push({
      role: 'system',
      content: currentDraft
        ? `Current recipe draft (JSON):\n${JSON.stringify(toPromptRecipe(currentDraft), null, 2)}`
        : 'There is no recipe draft yet — this is the start of a new recipe.',
    });
  }

  conversation.forEach((message, index) => {
    if (message.role !== 'assistant') {
      messages.push(message);
      return;
    }
    messages.push({
      role: 'assistant',
      content: serializeAssistantTurn(
        message.content,
        inlineDraft && index === draftTurnIndex ? currentDraft : null
      ),
    });
  });

  return messages;
}

/**
 * Returns the first balanced `{ ... }` span, tracking string literals and escapes so braces
 * inside recipe text don't throw off the depth count. Covers models that wrap their JSON in a
 * sentence of commentary.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

// Reasoning models (deepseek-r1, qwen3, ...) emit their thinking before the answer; several
// models still wrap JSON in markdown fences despite being told not to.
function extractJsonText(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(withoutThinking);
  return (fenced ? fenced[1] : withoutThinking).trim();
}

function parseJsonLoosely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const balanced = firstBalancedObject(text);
    if (balanced === null) throw new Error('no JSON object found');
    return JSON.parse(balanced);
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Ingredients and instructions are asked for as plain strings, but a model looking at the
 * object-shaped draft we send it will sometimes mirror that shape back. Accepting both means a
 * well-intentioned response doesn't silently lose every step.
 */
function toIngredientLine(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim() || null;
  if (!entry || typeof entry !== 'object') return null;

  const node = entry as Record<string, unknown>;
  const direct = firstString(node.raw_text, node.text, node.line, node.ingredient);
  if (direct) return direct;

  const name = firstString(node.name);
  if (!name) return null;

  const amount =
    typeof node.amount === 'number'
      ? String(node.amount)
      : firstString(node.amount, node.quantity, node.qty);

  return [amount, firstString(node.unit), name].filter(Boolean).join(' ');
}

function toInstructionText(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim() || null;
  if (!entry || typeof entry !== 'object') return null;

  const node = entry as Record<string, unknown>;
  return firstString(node.text, node.step, node.instruction, node.description);
}

function mapEntries<T>(value: unknown, map: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(map).filter((entry): entry is T => entry !== null);
}

function extractRecipeDraft(
  node: Record<string, unknown>,
  currentImagePath: string | null
): AiRecipeDraft {
  const ingredientLines = mapEntries(node.ingredients, toIngredientLine);
  const instructionTexts = mapEntries(node.instructions, toInstructionText);

  const tags = Array.isArray(node.tags)
    ? [
        ...new Set(
          node.tags
            .filter((e): e is string => typeof e === 'string')
            .map((t) => t.trim())
            .filter(Boolean)
        ),
      ]
    : [];

  return {
    title:
      typeof node.title === 'string' && node.title.trim() ? node.title.trim() : 'Untitled recipe',
    description: typeof node.description === 'string' ? node.description : null,
    image_path: currentImagePath,
    prep_time_minutes: typeof node.prep_time_minutes === 'number' ? node.prep_time_minutes : null,
    cook_time_minutes: typeof node.cook_time_minutes === 'number' ? node.cook_time_minutes : null,
    total_time_minutes:
      typeof node.total_time_minutes === 'number' ? node.total_time_minutes : null,
    servings: typeof node.servings === 'number' && node.servings > 0 ? node.servings : 1,
    ingredients: ingredientLines,
    instructions: instructionTexts.map((text, index) => ({ step_number: index + 1, text })),
    tags,
    category:
      typeof node.category === 'string' && node.category.trim() ? node.category.trim() : null,
  };
}

// A model that answers with the recipe fields at the top level, no "recipe" wrapper, still
// clearly meant to send a recipe.
function looksLikeRecipe(node: Record<string, unknown>): boolean {
  return (
    typeof node.title === 'string' ||
    Array.isArray(node.ingredients) ||
    Array.isArray(node.instructions)
  );
}

function hasNoContent(draft: AiRecipeDraft): boolean {
  return (
    draft.title === 'Untitled recipe' && !draft.ingredients.length && !draft.instructions.length
  );
}

// image_path carries forward from currentDraft since LLM can't generate it
export function parseChatEnvelope(
  rawContent: string,
  currentDraft: AiRecipeDraft | null = null
): AiChatEnvelope {
  let parsed: unknown;
  try {
    parsed = parseJsonLoosely(extractJsonText(rawContent));
  } catch {
    throw new Error('The AI response did not contain valid JSON. Try regenerating.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('The AI response did not contain a JSON object. Try regenerating.');
  }
  const node = parsed as Record<string, unknown>;

  const reply =
    typeof node.reply === 'string' && node.reply.trim()
      ? node.reply.trim()
      : "Here's the updated recipe.";

  const recipeNode =
    node.recipe && typeof node.recipe === 'object'
      ? (node.recipe as Record<string, unknown>)
      : !node.recipe && looksLikeRecipe(node)
        ? node
        : null;

  // No usable "recipe" means the model didn't intend a recipe change — keep the existing draft
  // untouched rather than resetting it to blank defaults. Only fall back to defaults when
  // there's no draft yet to preserve.
  if (recipeNode === null) {
    return { reply, recipe: currentDraft ?? extractRecipeDraft({}, null) };
  }

  const recipe = extractRecipeDraft(recipeNode, currentDraft?.image_path ?? null);

  // An empty recipe object is a non-answer, not an instruction to wipe the preview.
  if (currentDraft && hasNoContent(recipe)) {
    return { reply, recipe: currentDraft };
  }

  return { reply, recipe };
}
