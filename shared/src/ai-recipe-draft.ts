import { QUANTITY_TOKEN_PATTERN, parseQuantityToken } from './quantity.js';

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
const EXAMPLES: Record<
  SupportedLocale,
  { ingredient: string; countable: string; instruction: string }
> = {
  en: { ingredient: '450 g flour', countable: '2 eggs', instruction: 'Finely chop the onion.' },
  nl: { ingredient: '450 g bloem', countable: '2 eieren', instruction: 'Snijd de ajuin fijn.' },
  fr: {
    ingredient: '450 g farine',
    countable: '2 œufs',
    instruction: "Hachez finement l'oignon.",
  },
  es: {
    ingredient: '450 g harina',
    countable: '2 huevos',
    instruction: 'Pica finamente la cebolla.',
  },
};

export interface AiJsonSchemaFormat {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

/** Standard OpenAI-compatible sampling fields, sent as-is to Gemini's OpenAI-compat endpoint. */
export interface AiSamplingParams {
  temperature?: number;
  top_p?: number;
}

/**
 * Sampling tuned for constrained JSON recipe drafting: low variance, since the failure mode
 * we're guarding against is invented quantities, not repetitive prose.
 */
export const RECIPE_SAMPLING: AiSamplingParams = {
  temperature: 0.6,
  top_p: 0.95,
};

/**
 * Sent as `response_format: { type: 'json_schema', json_schema: ... }` so models that support
 * constrained decoding make an invalid response structurally impossible rather than merely
 * discouraged.
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
    "ingredients": ["450 g flour", "2 eggs"],
    "instructions": ["one short imperative step"],
    "tags": ["string"],
    "category": "string or null"
  }
}`;

function languageRules(locale: SupportedLocale): string {
  const languageName = LANGUAGE_NAMES[locale];

  if (locale === 'en') {
    return `- Write the recipe in ${languageName}.`;
  }

  // Compose directly in the target language and directly in metric — no intermediate English
  // draft, no separate conversion step. A draft-then-convert stage is what produces recipes that
  // start out imperial and only become metric (and get a "converted to metric" narration) on the
  // next turn.
  //
  // Unlike English (see the comment on IMPERIAL_UNIT_ALTERNATION below), we also ask for metric
  // explicitly here: the deterministic converter only recognizes English unit words, so it can't
  // catch imperial units written in French/Dutch/Spanish. Metric is already the ambient default
  // for cooking content in these languages, so a prompt reminder is far more likely to be
  // followed than it would be against English's strong imperial-recipe training prior.
  return `- Write the recipe directly in ${languageName}. Do not draft it in another language first.
- Use metric units (g, kg, ml, l, °C) for every measurement.`;
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
- Each "ingredients" entry is one plain line, amount followed by name and nothing else — for example
  "${example.ingredient}" or "${example.countable}". No prep notes, no parentheses, no alternatives;
  that detail belongs in a step.
- Countable items take just the number and the plural name, no unit word — for example
  "${example.countable}". Never write the literal word "unit".
- Each "instructions" entry is one short imperative action — for example "${example.instruction}". No
  step numbers, no explanation of why it matters, no technique commentary.
- "total_time_minutes" equals prep plus cook time, unless there is resting or marinating time to add.
- "category" is a single short category such as "Main course", "Dessert" or "Breakfast".

## Writing the reply
- Write "reply" in ${languageName}, 2-3 sentences at most, and never leave it empty.
- Say briefly what the recipe is and what you changed, or ask a clarifying question.
- Do not restate the ingredient list or justify every choice — the preview already shows the recipe.
- Never mention units, measurements, or converting them — the user never asked for a conversion.

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

// Some models (e.g. OpenRouter-routed deepseek-r1, qwen3) emit <think> blocks before the answer;
// markdown-fenced JSON is also common despite being told not to. Kept defensively — it's unclear
// whether Gemini's OpenAI-compat layer leaks thinking text into content the same way, and this
// stripping is a no-op if it never does.
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

/**
 * The model is free to write a recipe in whatever units are natural for it — no "metric only"
 * instruction survives a strong training-data prior for imperial-coded dishes (burgers, American
 * baking, ...) reliably enough to matter. Metric-only output is instead guaranteed here,
 * deterministically, on every ingredient line and instruction: unambiguous units are rewritten
 * with a fixed conversion factor, so the model's choice of units never reaches the user. Genuinely
 * ambiguous units (pint, quart, gallon, stick) are deliberately left untouched rather than guessed
 * at.
 */
const IMPERIAL_UNIT_ALTERNATION =
  'lbs?|pounds?|fl\\s*oz|fluid\\s+ounces?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|cups?|inch(?:es)?';

// Grams/ml/cm read oddly with decimals ("174.999999999999997 g"); recipes never need that
// precision, and it's the same rounding the prompt already asks the model to do itself.
function roundAmount(amount: number): number {
  return Math.round(amount);
}

// Unit tokens can carry inner whitespace ("fl oz"); normalize before looking them up so
// "fl  oz"/"FL OZ" all resolve to the same IMPERIAL_TO_METRIC entry.
function normalizeUnitKey(unitToken: string): string {
  return unitToken.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Bare "oz"/"ounce(s)" default to the weight factor — the common case (meat, cheese, shrimp) —
// since regex alone can't reliably tell it apart from a fluid ounce without more context than an
// ingredient line gives. "fl oz"/"fluid ounce(s)" is unambiguous, so it gets its own volume entry.
const IMPERIAL_TO_METRIC: Record<string, { factor: number; unit: string }> = {
  tsp: { factor: 5, unit: 'ml' },
  teaspoon: { factor: 5, unit: 'ml' },
  teaspoons: { factor: 5, unit: 'ml' },
  tbsp: { factor: 15, unit: 'ml' },
  tablespoon: { factor: 15, unit: 'ml' },
  tablespoons: { factor: 15, unit: 'ml' },
  cup: { factor: 240, unit: 'ml' },
  cups: { factor: 240, unit: 'ml' },
  'fl oz': { factor: 30, unit: 'ml' },
  'fluid ounce': { factor: 30, unit: 'ml' },
  'fluid ounces': { factor: 30, unit: 'ml' },
  oz: { factor: 28, unit: 'g' },
  ounce: { factor: 28, unit: 'g' },
  ounces: { factor: 28, unit: 'g' },
  lb: { factor: 450, unit: 'g' },
  lbs: { factor: 450, unit: 'g' },
  pound: { factor: 450, unit: 'g' },
  pounds: { factor: 450, unit: 'g' },
  inch: { factor: 2.5, unit: 'cm' },
  inches: { factor: 2.5, unit: 'cm' },
};

// A dual-listed amount the model sometimes already self-corrects inline, e.g.
// "1.5 lbs (680g) ground beef" — keep only the given metric value, dropping the imperial part.
// The `{0,20}?` gap tolerates a short hedge phrase before the number ("about", "approx.") so a
// hedge word doesn't leave the imperial part to be converted independently, producing two
// conflicting values.
const DUAL_LISTED_REGEX = new RegExp(
  `(?:${QUANTITY_TOKEN_PATTERN})\\s*(?:${IMPERIAL_UNIT_ALTERNATION})\\.?\\s*\\([a-z.,\\s]{0,20}?([\\d.,]+)\\s*(g|kg|ml|l)\\s*\\)`,
  'gi'
);

// Same idea as DUAL_LISTED_REGEX, for a dual-listed oven temperature, e.g. "350°F (177°C)" — keep
// the given Celsius value instead of also converting the Fahrenheit part independently.
const DUAL_LISTED_TEMPERATURE_REGEX = new RegExp(
  `(?:${QUANTITY_TOKEN_PATTERN})\\s*°?\\s*F\\.?\\s*\\([a-z.,\\s]{0,20}?([\\d.,]+)\\s*°?\\s*C\\s*\\)`,
  'gi'
);

// Allows a hyphen between amount and unit ("1-inch pieces"), not just whitespace. The optional
// leading "<amount>-" group handles a written range ("2-3 tbsp"): when present, both ends are
// converted with the same factor instead of only the unit-adjacent number.
const STANDALONE_IMPERIAL_REGEX = new RegExp(
  `(?:(${QUANTITY_TOKEN_PATTERN})\\s*-\\s*)?(${QUANTITY_TOKEN_PATTERN})[\\s-]*(${IMPERIAL_UNIT_ALTERNATION})\\.?\\b`,
  'gi'
);

// Same range handling as STANDALONE_IMPERIAL_REGEX, for a written temperature range ("350-375°F").
const FAHRENHEIT_REGEX = /(?:(\d+(?:\.\d+)?)\s*-\s*)?(\d+(?:\.\d+)?)\s*°?\s*F\b/gi;

function fahrenheitToCelsius(fahrenheit: number): number {
  return Math.round(((fahrenheit - 32) * 5) / 9 / 5) * 5;
}

function convertImperialToMetric(text: string): string {
  return text
    .replace(DUAL_LISTED_REGEX, (_match, metricAmount: string, metricUnit: string) => {
      return `${metricAmount} ${metricUnit}`;
    })
    .replace(DUAL_LISTED_TEMPERATURE_REGEX, (_match, celsius: string) => `${celsius}°C`)
    .replace(
      STANDALONE_IMPERIAL_REGEX,
      (match, rangeStart: string | undefined, amountToken: string, unitToken: string) => {
        const conversion = IMPERIAL_TO_METRIC[normalizeUnitKey(unitToken)];
        if (!conversion) return match;

        const convertedEnd = roundAmount(parseQuantityToken(amountToken) * conversion.factor);
        if (!Number.isFinite(convertedEnd)) return match;

        if (rangeStart) {
          const convertedStart = roundAmount(parseQuantityToken(rangeStart) * conversion.factor);
          if (!Number.isFinite(convertedStart)) return match;
          return `${convertedStart}-${convertedEnd} ${conversion.unit}`;
        }

        return `${convertedEnd} ${conversion.unit}`;
      }
    )
    .replace(FAHRENHEIT_REGEX, (_match, rangeStart: string | undefined, fahrenheit: string) => {
      const convertedEnd = fahrenheitToCelsius(Number(fahrenheit));
      if (rangeStart) {
        const convertedStart = fahrenheitToCelsius(Number(rangeStart));
        return `${convertedStart}-${convertedEnd}°C`;
      }
      return `${convertedEnd}°C`;
    });
}

function extractRecipeDraft(
  node: Record<string, unknown>,
  currentImagePath: string | null
): AiRecipeDraft {
  const ingredientLines = mapEntries(node.ingredients, toIngredientLine).map(
    convertImperialToMetric
  );
  const instructionTexts = mapEntries(node.instructions, toInstructionText).map(
    convertImperialToMetric
  );

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
