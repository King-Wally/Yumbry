import type { AiNutritionEstimate, AiNutritionRequest } from './ai-nutrition.js';
import type { AiRecipeDraft } from './ai-recipe-draft.js';
import { toNullableNumber, toNumber } from './numeric.js';
import type { RecipeInput } from './recipe-dto.js';

// The rules behind the recipe editor, kept free of any UI framework so a rewrite of the form can
// reuse them unchanged. The form holds every number as a string, so an empty input stays empty
// rather than turning into 0 — an absent nutrition value is not a measured zero.

export interface RecipeFormInstruction {
  id?: number;
  text: string;
}

export interface RecipeFormState {
  title: string;
  description: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  total_time_minutes: string;
  servings: number;
  calories: string;
  fat_content: string;
  carbohydrate_content: string;
  protein_content: string;
  image_path: string | null;
  ingredients: string[];
  instructions: RecipeFormInstruction[];
  tags: string[];
  category: string | null;
}

/** The fields of a saved recipe the editor reads. Decimal columns may arrive as strings. */
export interface SavedRecipeForForm {
  id?: number;
  title: string;
  description: string | null;
  image_path: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: string | number;
  calories: string | number | null;
  fat_content: string | number | null;
  carbohydrate_content: string | number | null;
  protein_content: string | number | null;
  ingredients: { raw_text: string }[];
  instructions: { id?: number; step_number: number; text: string }[];
  tags: { name: string }[];
  category: { name: string } | null;
}

export const EMPTY_RECIPE_FORM: RecipeFormState = {
  title: '',
  description: '',
  prep_time_minutes: '',
  cook_time_minutes: '',
  total_time_minutes: '',
  servings: 4,
  calories: '',
  fat_content: '',
  carbohydrate_content: '',
  protein_content: '',
  image_path: null,
  ingredients: [''],
  instructions: [{ text: '' }],
  tags: [],
  category: null,
};

/** A number for an input: '' when absent, and a Decimal column's "420.00" shown as 420. */
export function numberField(value: string | number | null | undefined): string {
  const parsed = toNullableNumber(value);
  return parsed === null ? '' : String(parsed);
}

function minutesField(value: number | null | undefined): string {
  return value != null ? String(value) : '';
}

export function formStateFromRecipe(recipe: SavedRecipeForForm): RecipeFormState {
  return {
    title: recipe.title ?? '',
    description: recipe.description ?? '',
    prep_time_minutes: minutesField(recipe.prep_time_minutes),
    cook_time_minutes: minutesField(recipe.cook_time_minutes),
    total_time_minutes: minutesField(recipe.total_time_minutes),
    servings: toNumber(recipe.servings, 1),
    calories: numberField(recipe.calories),
    fat_content: numberField(recipe.fat_content),
    carbohydrate_content: numberField(recipe.carbohydrate_content),
    protein_content: numberField(recipe.protein_content),
    image_path: recipe.image_path ?? null,
    ingredients: recipe.ingredients?.map((i) => i.raw_text) ?? [''],
    instructions: recipe.instructions?.length
      ? recipe.instructions.map((i) => ({ id: i.id, text: i.text }))
      : [{ text: '' }],
    tags: recipe.tags?.map((tag) => tag.name) ?? [],
    category: recipe.category?.name ?? null,
  };
}

/** A draft handed to the editor by the AI assistant, URL import or photo import. */
export function formStateFromDraft(draft: RecipeInput): RecipeFormState {
  return {
    title: draft.title,
    description: draft.description ?? '',
    prep_time_minutes: minutesField(draft.prep_time_minutes),
    cook_time_minutes: minutesField(draft.cook_time_minutes),
    total_time_minutes: minutesField(draft.total_time_minutes),
    servings: draft.servings,
    calories: numberField(draft.calories),
    fat_content: numberField(draft.fat_content),
    carbohydrate_content: numberField(draft.carbohydrate_content),
    protein_content: numberField(draft.protein_content),
    image_path: draft.image_path ?? null,
    ingredients: draft.ingredients.length ? draft.ingredients : [''],
    instructions: draft.instructions.length
      ? draft.instructions.map((i) => ({ text: i.text }))
      : [{ text: '' }],
    tags: draft.tags,
    category: draft.category,
  };
}

function nullableMinutes(value: string): number | null {
  return value === '' ? null : Number(value);
}

/** What gets saved: blank lines dropped, steps renumbered from 1, empty numbers as null. */
export function recipeInputFromForm(form: RecipeFormState): RecipeInput {
  return {
    title: form.title,
    description: form.description || null,
    prep_time_minutes: nullableMinutes(form.prep_time_minutes),
    cook_time_minutes: nullableMinutes(form.cook_time_minutes),
    total_time_minutes: nullableMinutes(form.total_time_minutes),
    servings: Number(form.servings),
    calories: toNullableNumber(form.calories),
    fat_content: toNullableNumber(form.fat_content),
    carbohydrate_content: toNullableNumber(form.carbohydrate_content),
    protein_content: toNullableNumber(form.protein_content),
    image_path: form.image_path,
    ingredients: form.ingredients.filter((line) => line.trim() !== ''),
    instructions: form.instructions
      .filter((step) => step.text.trim() !== '')
      .map((step, index) => ({ step_number: index + 1, text: step.text })),
    tags: form.tags,
    category: form.category,
  };
}

/**
 * The request for a nutrition estimate, built from what the cook is looking at right now rather
 * than the saved recipe. `null` when there is nothing to measure yet: a title and at least one
 * ingredient are needed.
 */
export function nutritionRequestFromForm(form: RecipeFormState): AiNutritionRequest | null {
  const ingredients = form.ingredients.filter((line) => line.trim() !== '');
  if (form.title.trim() === '' || ingredients.length === 0) return null;
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    servings: Number(form.servings),
    ingredients,
    instructions: form.instructions.map((step) => step.text.trim()).filter(Boolean),
  };
}

/**
 * Applies an estimate to the form. A null stays null: a value the model declined to guess keeps
 * whatever the cook already had, rather than being overwritten with a fake 0 they would have to
 * notice and clear.
 */
export function mergeNutritionEstimate(
  form: RecipeFormState,
  estimate: AiNutritionEstimate
): RecipeFormState {
  const pick = (value: number | null, current: string) => (value != null ? String(value) : current);
  return {
    ...form,
    calories: pick(estimate.calories, form.calories),
    fat_content: pick(estimate.fat_content, form.fat_content),
    carbohydrate_content: pick(estimate.carbohydrate_content, form.carbohydrate_content),
    protein_content: pick(estimate.protein_content, form.protein_content),
  };
}

function hasTag(tags: readonly string[], name: string): boolean {
  return tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
}

/** Adds a tag unless it is blank or already present in any letter case. */
export function addTag(tags: readonly string[], name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || hasTag(tags, trimmed)) return [...tags];
  return [...tags, trimmed];
}

/** Existing tags matching what is typed so far, leaving out the ones already added. */
export function suggestTags<T extends { name: string }>(
  existing: readonly T[],
  input: string,
  added: readonly string[]
): T[] {
  const query = input.trim().toLowerCase();
  if (!query) return [];
  return existing.filter(
    (tag) => tag.name.toLowerCase().includes(query) && !hasTag(added, tag.name)
  );
}

/** A saved recipe as the AI assistant's starting draft (improve mode). */
export function draftFromRecipe(recipe: SavedRecipeForForm): AiRecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    image_path: recipe.image_path,
    prep_time_minutes: recipe.prep_time_minutes,
    cook_time_minutes: recipe.cook_time_minutes,
    total_time_minutes: recipe.total_time_minutes,
    servings: toNumber(recipe.servings, 1),
    calories: toNullableNumber(recipe.calories),
    fat_content: toNullableNumber(recipe.fat_content),
    carbohydrate_content: toNullableNumber(recipe.carbohydrate_content),
    protein_content: toNullableNumber(recipe.protein_content),
    ingredients: recipe.ingredients.map((i) => i.raw_text),
    instructions: recipe.instructions.map((i) => ({ step_number: i.step_number, text: i.text })),
    tags: recipe.tags.map((t) => t.name),
    category: recipe.category?.name ?? null,
  };
}
