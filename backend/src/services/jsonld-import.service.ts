import { z } from 'zod';
import { isoDurationToMinutes } from '../utils/iso-duration.js';
import { stripHtml } from '../utils/strip-html.js';
import { parseIngredientLine, type ParsedIngredient } from './ingredient-parser.js';

type JsonLdNode = Record<string, unknown>;

const JsonLdDocumentSchema: z.ZodType<JsonLdNode | unknown[]> = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

export interface ParsedRecipeImport {
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: number;
  ingredients: (ParsedIngredient & { sort_order: number })[];
  instructions: { step_number: number; text: string }[];
  tags: string[];
  category: string | null;
}

function hasRecipeType(node: unknown): node is JsonLdNode {
  if (!node || typeof node !== 'object') return false;
  const type = (node as JsonLdNode)['@type'];
  if (Array.isArray(type)) return type.includes('Recipe');
  return type === 'Recipe';
}

export function findRecipeNode(jsonLd: unknown): JsonLdNode | null {
  if (Array.isArray(jsonLd)) {
    for (const node of jsonLd) {
      const found = findRecipeNode(node);
      if (found) return found;
    }
    return null;
  }

  if (hasRecipeType(jsonLd)) return jsonLd;

  if (jsonLd && typeof jsonLd === 'object' && Array.isArray((jsonLd as JsonLdNode)['@graph'])) {
    return findRecipeNode((jsonLd as JsonLdNode)['@graph']);
  }

  return null;
}

function extractImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    for (const entry of image) {
      const url = extractImageUrl(entry);
      if (url) return url;
    }
    return null;
  }
  if (typeof image === 'object' && typeof (image as JsonLdNode).url === 'string') {
    return (image as JsonLdNode).url as string;
  }
  return null;
}

function extractServings(recipeYield: unknown): number {
  const value = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = /\d+(\.\d+)?/.exec(value);
    if (match) return Number(match[0]);
  }
  return 1;
}

function extractTagNames(node: JsonLdNode): string[] {
  const names: string[] = [];

  const keywords = node.keywords;
  if (Array.isArray(keywords)) {
    names.push(...keywords.filter((entry): entry is string => typeof entry === 'string'));
  } else if (typeof keywords === 'string') {
    names.push(...keywords.split(','));
  }

  return [...new Set(names.map((name) => stripHtml(name).trim()).filter(Boolean))];
}

function extractCategoryName(node: JsonLdNode): string | null {
  const category = node.recipeCategory;
  if (typeof category === 'string') {
    const trimmed = stripHtml(category).trim();
    return trimmed || null;
  }
  if (Array.isArray(category)) {
    for (const entry of category) {
      if (typeof entry === 'string' && entry.trim()) return stripHtml(entry).trim();
    }
  }
  return null;
}

function extractInstructionTexts(recipeInstructions: unknown): string[] {
  if (!recipeInstructions) return [];

  if (typeof recipeInstructions === 'string') {
    return recipeInstructions
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  if (Array.isArray(recipeInstructions)) {
    return recipeInstructions.flatMap((item): string[] => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];

      const node = item as JsonLdNode;

      if (node['@type'] === 'HowToSection' && Array.isArray(node.itemListElement)) {
        return extractInstructionTexts(node.itemListElement);
      }

      if (typeof node.text === 'string') return [node.text];
      if (typeof node.name === 'string') return [node.name];
      return [];
    });
  }

  return [];
}

/**
 * Some sites emit JSON-LD whose string values contain raw control characters (most often a
 * literal newline in a multi-paragraph `description`) instead of the escaped `\n` the JSON
 * spec requires — usually because the value was template-interpolated without proper JSON
 * escaping. `JSON.parse` throws on those even though the document is otherwise well-formed.
 * This repairs it by escaping any raw control character (0x00-0x1F) encountered while
 * lexically inside a string literal, leaving whitespace between tokens (which is legal)
 * untouched.
 */
function escapeControlCharsInStrings(text: string): string {
  let result = '';
  let inString = false;
  let escapedNext = false;

  for (const char of text) {
    if (!inString) {
      if (char === '"') inString = true;
      result += char;
      continue;
    }

    if (escapedNext) {
      result += char;
      escapedNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapedNext = true;
      continue;
    }

    if (char === '"') {
      inString = false;
      result += char;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code <= 0x1f) {
      switch (char) {
        case '\n':
          result += '\\n';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\t':
          result += '\\t';
          break;
        default:
          result += `\\u${code.toString(16).padStart(4, '0')}`;
      }
      continue;
    }

    result += char;
  }

  return result;
}

export function parseRecipeFromJsonLd(rawJsonLdText: string): ParsedRecipeImport {
  const rawParsed: unknown = JSON.parse(escapeControlCharsInStrings(rawJsonLdText));
  const parsed = JsonLdDocumentSchema.parse(rawParsed);
  const node = findRecipeNode(parsed);

  if (!node) {
    throw new Error('No schema.org Recipe found in the provided JSON-LD.');
  }

  const prepTimeMinutes = isoDurationToMinutes(node.prepTime);
  const cookTimeMinutes = isoDurationToMinutes(node.cookTime);
  const totalTimeMinutes =
    isoDurationToMinutes(node.totalTime) ??
    (prepTimeMinutes !== null && cookTimeMinutes !== null
      ? prepTimeMinutes + cookTimeMinutes
      : null);

  // schema.org's Recipe type calls this `recipeIngredient`, but some sites (e.g.
  // libelle-lekker.be) emit a non-standard `ingredients` key instead — fall back to it.
  const rawIngredientLines = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient
    : Array.isArray(node.ingredients)
      ? node.ingredients
      : [];
  const ingredientLines: string[] = rawIngredientLines
    .filter((entry): entry is string => typeof entry === 'string')
    .map((line) => stripHtml(line));
  const ingredients = ingredientLines.map((line, index) => ({
    ...parseIngredientLine(line),
    sort_order: index,
  }));

  const instructions = extractInstructionTexts(node.recipeInstructions).map((text, index) => ({
    step_number: index + 1,
    text: stripHtml(text),
  }));

  return {
    title: typeof node.name === 'string' ? stripHtml(node.name) : 'Untitled recipe',
    description: typeof node.description === 'string' ? stripHtml(node.description) : null,
    image_path: extractImageUrl(node.image),
    prep_time_minutes: prepTimeMinutes,
    cook_time_minutes: cookTimeMinutes,
    total_time_minutes: totalTimeMinutes,
    servings: extractServings(node.recipeYield),
    ingredients,
    instructions,
    tags: extractTagNames(node),
    category: extractCategoryName(node),
  };
}
