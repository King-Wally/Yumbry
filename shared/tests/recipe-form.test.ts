import { describe, expect, it } from 'vitest';
import {
  addTag,
  draftFromRecipe,
  EMPTY_RECIPE_FORM,
  formStateFromDraft,
  formStateFromRecipe,
  mergeNutritionEstimate,
  numberField,
  nutritionRequestFromForm,
  recipeInputFromForm,
  suggestTags,
  type RecipeFormState,
  type SavedRecipeForForm,
} from '../src/recipe-form.js';

const saved: SavedRecipeForForm = {
  id: 7,
  title: 'Lentil soup',
  description: null,
  image_path: '/uploads/recipes/7/photo.jpg',
  prep_time_minutes: 10,
  cook_time_minutes: null,
  total_time_minutes: 40,
  servings: '4.00',
  calories: '420.00',
  fat_content: null,
  carbohydrate_content: '55.50',
  protein_content: '0.00',
  ingredients: [{ raw_text: '200 g lentils' }, { raw_text: '1 onion' }],
  instructions: [
    { id: 11, step_number: 1, text: 'Chop.' },
    { id: 12, step_number: 2, text: 'Simmer.' },
  ],
  tags: [{ name: 'soup' }, { name: 'vegan' }],
  category: { name: 'Soup' },
};

function form(overrides: Partial<RecipeFormState> = {}): RecipeFormState {
  return { ...EMPTY_RECIPE_FORM, title: 'Stew', ingredients: ['1 carrot'], ...overrides };
}

describe('numberField', () => {
  it('shows a Decimal string as a plain number', () => {
    expect(numberField('420.00')).toBe('420');
  });

  it('shows an absent value as an empty input, not 0', () => {
    expect(numberField(null)).toBe('');
    expect(numberField(undefined)).toBe('');
  });
});

describe('formStateFromRecipe', () => {
  it('fills the form from a saved recipe', () => {
    const state = formStateFromRecipe(saved);
    expect(state).toMatchObject({
      title: 'Lentil soup',
      description: '',
      prep_time_minutes: '10',
      cook_time_minutes: '',
      total_time_minutes: '40',
      servings: 4,
      calories: '420',
      fat_content: '',
      carbohydrate_content: '55.5',
      protein_content: '0',
      ingredients: ['200 g lentils', '1 onion'],
      instructions: [
        { id: 11, text: 'Chop.' },
        { id: 12, text: 'Simmer.' },
      ],
      tags: ['soup', 'vegan'],
      category: 'Soup',
    });
  });

  it('starts with one empty step when the recipe has none', () => {
    expect(formStateFromRecipe({ ...saved, instructions: [] }).instructions).toEqual([
      { text: '' },
    ]);
  });
});

describe('formStateFromDraft', () => {
  it('fills the form from an imported draft', () => {
    const state = formStateFromDraft({
      title: 'Pancakes',
      servings: 2,
      calories: 300,
      ingredients: ['2 eggs'],
      instructions: [{ step_number: 1, text: 'Whisk.' }],
      tags: ['breakfast'],
      category: null,
    });
    expect(state).toMatchObject({
      title: 'Pancakes',
      description: '',
      prep_time_minutes: '',
      servings: 2,
      calories: '300',
      fat_content: '',
      ingredients: ['2 eggs'],
      instructions: [{ text: 'Whisk.' }],
    });
  });

  it('keeps one empty ingredient line and step for an empty draft', () => {
    const state = formStateFromDraft({
      title: 'Empty',
      servings: 1,
      ingredients: [],
      instructions: [],
      tags: [],
      category: null,
    });
    expect(state.ingredients).toEqual(['']);
    expect(state.instructions).toEqual([{ text: '' }]);
  });
});

describe('recipeInputFromForm', () => {
  it('drops blank lines and renumbers steps from 1', () => {
    const input = recipeInputFromForm(
      form({
        ingredients: ['1 carrot', '  ', ''],
        instructions: [{ text: '' }, { text: 'Peel.' }, { text: '  ' }, { text: 'Boil.' }],
      })
    );
    expect(input.ingredients).toEqual(['1 carrot']);
    expect(input.instructions).toEqual([
      { step_number: 1, text: 'Peel.' },
      { step_number: 2, text: 'Boil.' },
    ]);
  });

  it('turns empty numbers into null, never 0', () => {
    const input = recipeInputFromForm(form({ prep_time_minutes: '', calories: '' }));
    expect(input.prep_time_minutes).toBeNull();
    expect(input.calories).toBeNull();
  });

  it('keeps a real zero', () => {
    expect(recipeInputFromForm(form({ fat_content: '0' })).fat_content).toBe(0);
  });

  it('sends an empty description as null', () => {
    expect(recipeInputFromForm(form({ description: '' })).description).toBeNull();
  });

  it('round-trips a saved recipe', () => {
    const input = recipeInputFromForm(formStateFromRecipe(saved));
    expect(input).toMatchObject({
      title: 'Lentil soup',
      servings: 4,
      calories: 420,
      fat_content: null,
      carbohydrate_content: 55.5,
      ingredients: ['200 g lentils', '1 onion'],
      tags: ['soup', 'vegan'],
      category: 'Soup',
      image_path: '/uploads/recipes/7/photo.jpg',
    });
  });
});

describe('nutritionRequestFromForm', () => {
  it('needs a title', () => {
    expect(nutritionRequestFromForm(form({ title: '  ' }))).toBeNull();
  });

  it('needs at least one ingredient', () => {
    expect(nutritionRequestFromForm(form({ ingredients: ['', ' '] }))).toBeNull();
  });

  it('measures the live form, trimmed', () => {
    expect(
      nutritionRequestFromForm(
        form({
          title: ' Stew ',
          description: '',
          servings: 3,
          ingredients: ['1 carrot', ''],
          instructions: [{ text: ' Boil. ' }, { text: '' }],
        })
      )
    ).toEqual({
      title: 'Stew',
      description: null,
      servings: 3,
      ingredients: ['1 carrot'],
      instructions: ['Boil.'],
    });
  });
});

describe('mergeNutritionEstimate', () => {
  it('fills the values the estimate has and keeps the rest', () => {
    const merged = mergeNutritionEstimate(form({ calories: '100', fat_content: '9' }), {
      calories: 321,
      fat_content: null,
      carbohydrate_content: 40,
      protein_content: 12.5,
    });
    expect(merged).toMatchObject({
      calories: '321',
      fat_content: '9',
      carbohydrate_content: '40',
      protein_content: '12.5',
    });
  });
});

describe('addTag', () => {
  it('adds a trimmed tag', () => {
    expect(addTag(['soup'], '  vegan ')).toEqual(['soup', 'vegan']);
  });

  it('ignores a duplicate in any letter case', () => {
    expect(addTag(['Soup'], 'soup')).toEqual(['Soup']);
  });

  it('ignores a blank tag', () => {
    expect(addTag(['soup'], '   ')).toEqual(['soup']);
  });
});

describe('suggestTags', () => {
  const existing = [{ name: 'Vegan' }, { name: 'vegetarian' }, { name: 'soup' }];

  it('matches case-insensitively on a substring', () => {
    expect(suggestTags(existing, 'VEG', []).map((t) => t.name)).toEqual(['Vegan', 'vegetarian']);
  });

  it('leaves out tags already added', () => {
    expect(suggestTags(existing, 'veg', ['vegan']).map((t) => t.name)).toEqual(['vegetarian']);
  });

  it('suggests nothing for an empty input', () => {
    expect(suggestTags(existing, '  ', [])).toEqual([]);
  });
});

describe('draftFromRecipe', () => {
  it('turns a saved recipe into the assistant draft shape', () => {
    expect(draftFromRecipe(saved)).toEqual({
      title: 'Lentil soup',
      description: null,
      image_path: '/uploads/recipes/7/photo.jpg',
      prep_time_minutes: 10,
      cook_time_minutes: null,
      total_time_minutes: 40,
      servings: 4,
      calories: 420,
      fat_content: null,
      carbohydrate_content: 55.5,
      protein_content: 0,
      ingredients: ['200 g lentils', '1 onion'],
      instructions: [
        { step_number: 1, text: 'Chop.' },
        { step_number: 2, text: 'Simmer.' },
      ],
      tags: ['soup', 'vegan'],
      category: 'Soup',
    });
  });
});
