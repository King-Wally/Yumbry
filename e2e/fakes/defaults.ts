// What the fakes server answers when no spec has queued anything for a request. Imported by specs
// too, so assertions name these values instead of repeating them.

export const DEFAULT_REPLY = 'Here is a draft.';

export const DEFAULT_RECIPE = {
  title: 'Fake Tomato Soup',
  description: 'A quick weeknight soup.',
  servings: 4,
  prep_time_minutes: 10,
  cook_time_minutes: 20,
  total_time_minutes: 30,
  calories: null,
  fat_content: null,
  carbohydrate_content: null,
  protein_content: null,
  category: 'Soup',
  tags: ['tomato', 'vegetarian', 'soup'],
  ingredients: [
    { item: 'tomatoes', quantity: 800, unit: 'g', note: null, density_key: 'none' },
    { item: 'onion', quantity: 1, unit: '', note: 'chopped', density_key: 'none' },
    { item: 'olive oil', quantity: 30, unit: 'ml', note: null, density_key: 'none' },
  ],
  instructions: [
    'Soften the onion in the oil.',
    'Add the tomatoes and simmer for 20 minutes.',
    'Blend until smooth.',
  ],
};

export const DEFAULT_NUTRITION = {
  calories: 180,
  fat_content: 7.5,
  carbohydrate_content: 22,
  protein_content: 4.2,
};
