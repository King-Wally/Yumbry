/** Single source of truth for the AI-chat prompt and JSON-envelope parsing
 * shared by every caller of an OpenAI-compatible chat-completions endpoint —
 * the backend's `/api/ai/chat` proxy (backend/src/controllers/ai.controller.ts)
 * for hosted providers, and the frontend's browser-direct Ollama client
 * (frontend/src/services/ollama-direct.ts). Living in its own workspace
 * package means both consume the exact same compiled logic — there is no
 * second hand-copied version of this prompt or its parsing to drift out of
 * sync. */

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

const RECIPE_JSON_SHAPE = `{
  "title": string,
  "description": string | null,
  "prep_time_minutes": number | null,
  "cook_time_minutes": number | null,
  "total_time_minutes": number | null,
  "servings": number,
  "ingredients": string[],   // each ONLY "<amount> <unit> <ingredient name>", e.g. "450 g bloem" —
                              // no prep notes ("fijngehakt", "in blokjes"), no parenthetical asides
                              // or alternatives; prep goes in "instructions" instead
  "instructions": string[],  // each one short, imperative step, no numbering prefix, no explanation
                              // of why — just the action itself, e.g. "Hak de ui fijn."
  "tags": string[],
  "category": string | null  // a single short category like "Main course", "Dessert", "Breakfast"
}`.trim();

const ENVELOPE_JSON_INSTRUCTIONS = `
Respond with ONLY a single JSON object (no prose outside it, no markdown fences) with exactly
these two top-level keys:
{
  "reply": string,   // a SHORT conversational message to the user (2-3 sentences max): briefly say
                      // what the recipe is and what you changed, or ask a clarifying question if you
                      // need more information. Do not restate the ingredient list or explain every
                      // choice you made — the recipe itself is already visible in the preview.
                      // Never leave this empty.
  "recipe": ${RECIPE_JSON_SHAPE}
}`.trim();

function buildChatSystemPrompt(): AiChatMessage {
  return {
    role: 'system',
    content:
      'You are a friendly recipe-development assistant, working with a home cook through a live chat ' +
      'next to a recipe preview that always shows your current best draft. Every reply you give MUST ' +
      'include your full current recipe, not just the parts that changed. On the first message, if ' +
      'there is no existing draft yet, produce a best-guess full recipe immediately from whatever the ' +
      'user has said so far — do not refuse or wait for more detail; ask clarifying questions in your ' +
      '"reply" text while still attempting a reasonable draft. When a draft already exists, only change ' +
      'what the latest message is actually about and leave the rest as-is. Keep "reply" short — a ' +
      'brief summary of the recipe and what changed (or, on the first turn, what you assumed), not a ' +
      'detailed walkthrough of every ingredient choice or technique; your "reply" text should match ' +
      'the language the user is using. ' +
      'Each ingredient line must be ONLY the amount, unit, and ingredient name — never add prep ' +
      'instructions ("fijngehakt", "in blokjes gesneden"), parenthetical asides, or alternatives to an ' +
      'ingredient line; that kind of detail belongs in the corresponding instruction step instead ' +
      '(e.g. "Hak de ui fijn." as its own step, not "ui, fijngehakt" in the ingredient list). ' +
      'Each instruction step must be short and imperative — just the action itself, with no ' +
      'explanation of why it matters or background/technique commentary. ' +
      'Do the recipe itself (title, ingredients, instructions) as a two-stage process every turn: ' +
      '(1) First, draft or update the recipe in English, using whichever units are most natural for ' +
      'that recipe (cups, ounces, pounds, °F, tablespoons, etc. are all fine at this stage — pick ' +
      'whatever a native English-speaking recipe would normally use). (2) Then, as a final step before ' +
      'responding, translate that English recipe into Flemish Dutch (Belgian Dutch as spoken in ' +
      'Flanders — e.g. "ajuin" not "ui", "kropsla" not "krop sla", prefer Flemish everyday vocabulary ' +
      'and phrasing over Netherlands Dutch terms where they differ) and convert every measurement to ' +
      'metric units (grams, kilograms, milliliters, liters, °C) — never leave imperial/US units ' +
      '(cups, ounces, pounds, °F, etc.) in the final result. Only the fully translated, metric version ' +
      'of the recipe (title, ingredients, instructions) is what goes into the "recipe" field of your ' +
      'response — the English/imperial draft from stage 1 is an internal step and must never be shown ' +
      'to the user. ' +
      ENVELOPE_JSON_INSTRUCTIONS,
  };
}

export function buildChatMessages(
  conversation: AiChatMessage[],
  currentDraft: AiRecipeDraft | null
): AiChatMessage[] {
  const draftContext: AiChatMessage = {
    role: 'system',
    content: currentDraft
      ? `Current recipe draft (JSON):\n${JSON.stringify(currentDraft, null, 2)}`
      : 'There is no recipe draft yet — this is the start of a new recipe.',
  };
  return [buildChatSystemPrompt(), draftContext, ...conversation];
}

function stripJsonFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

function extractRecipeDraft(
  node: Record<string, unknown>,
  currentImagePath: string | null
): AiRecipeDraft {
  const ingredientLines = Array.isArray(node.ingredients)
    ? node.ingredients.filter((e): e is string => typeof e === 'string')
    : [];

  const instructionTexts = Array.isArray(node.instructions)
    ? node.instructions.filter((e): e is string => typeof e === 'string')
    : [];

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

// image_path carries forward from currentDraft since LLM can't generate it
export function parseChatEnvelope(
  rawContent: string,
  currentDraft: AiRecipeDraft | null = null
): AiChatEnvelope {
  const jsonText = stripJsonFences(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
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
    node.recipe && typeof node.recipe === 'object' ? (node.recipe as Record<string, unknown>) : {};

  return { reply, recipe: extractRecipeDraft(recipeNode, currentDraft?.image_path ?? null) };
}
