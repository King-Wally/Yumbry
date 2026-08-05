import { describe, expect, it } from 'vitest';
import {
  buildChatMessages,
  parseChatEnvelope,
  type AiRecipeDraft,
} from '../src/ai-recipe-draft.js';

describe('parseChatEnvelope', () => {
  const wellFormedRecipe = {
    title: 'Spicy Vegetarian Curry',
    description: 'A coconut-based curry.',
    prep_time_minutes: 15,
    cook_time_minutes: 25,
    total_time_minutes: 40,
    servings: 4,
    ingredients: ['1 can coconut milk', '2 tbsp red curry paste'],
    instructions: ['Press and cube the tofu.', 'Simmer the sauce.'],
    tags: ['curry', 'vegetarian', 'Curry'],
    category: 'Main course',
  };
  const wellFormedEnvelope = { reply: 'Here is a spicy curry for you.', recipe: wellFormedRecipe };

  it('parses a well-formed envelope', () => {
    const envelope = parseChatEnvelope(JSON.stringify(wellFormedEnvelope));

    expect(envelope.reply).toBe('Here is a spicy curry for you.');
    expect(envelope.recipe.title).toBe('Spicy Vegetarian Curry');
    expect(envelope.recipe.description).toBe('A coconut-based curry.');
    expect(envelope.recipe.image_path).toBeNull();
    expect(envelope.recipe.prep_time_minutes).toBe(15);
    expect(envelope.recipe.servings).toBe(4);
    expect(envelope.recipe.ingredients).toEqual(['1 can coconut milk', '2 tbsp red curry paste']);
    expect(envelope.recipe.instructions).toEqual([
      { step_number: 1, text: 'Press and cube the tofu.' },
      { step_number: 2, text: 'Simmer the sauce.' },
    ]);
    expect(envelope.recipe.category).toBe('Main course');
  });

  it('carries the current draft image_path through unchanged, since the LLM never sets it', () => {
    const currentDraft: AiRecipeDraft = {
      ...wellFormedRecipe,
      image_path: '/uploads/recipes/1/photo.jpg',
      instructions: [{ step_number: 1, text: 'Simmer.' }],
    };

    const envelope = parseChatEnvelope(JSON.stringify(wellFormedEnvelope), currentDraft);

    expect(envelope.recipe.image_path).toBe('/uploads/recipes/1/photo.jpg');
  });

  it('falls back to a generic reply when reply is missing', () => {
    const envelope = parseChatEnvelope(JSON.stringify({ recipe: wellFormedRecipe }));
    expect(envelope.reply).toBe("Here's the updated recipe.");
  });

  it('falls back to a generic reply when reply is non-string', () => {
    const envelope = parseChatEnvelope(JSON.stringify({ reply: 42, recipe: wellFormedRecipe }));
    expect(envelope.reply).toBe("Here's the updated recipe.");
  });

  it('dedupes and trims tags case-sensitively', () => {
    const envelope = parseChatEnvelope(JSON.stringify(wellFormedEnvelope));
    expect(envelope.recipe.tags).toEqual(['curry', 'vegetarian', 'Curry']);
  });

  it('strips a ```json fenced code block before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(wellFormedEnvelope) + '\n```';
    const envelope = parseChatEnvelope(fenced);
    expect(envelope.recipe.title).toBe('Spicy Vegetarian Curry');
  });

  it('strips a bare ``` fenced code block (no language tag)', () => {
    const fenced = '```\n' + JSON.stringify(wellFormedEnvelope) + '\n```';
    const envelope = parseChatEnvelope(fenced);
    expect(envelope.recipe.title).toBe('Spicy Vegetarian Curry');
  });

  it('falls back to sensible recipe defaults when recipe is missing entirely', () => {
    const envelope = parseChatEnvelope(JSON.stringify({ reply: 'Hi' }));

    expect(envelope.reply).toBe('Hi');
    expect(envelope.recipe.title).toBe('Untitled recipe');
    expect(envelope.recipe.description).toBeNull();
    expect(envelope.recipe.prep_time_minutes).toBeNull();
    expect(envelope.recipe.servings).toBe(1);
    expect(envelope.recipe.ingredients).toEqual([]);
    expect(envelope.recipe.instructions).toEqual([]);
    expect(envelope.recipe.tags).toEqual([]);
    expect(envelope.recipe.category).toBeNull();
  });

  it('falls back to sensible recipe defaults when recipe is malformed (not an object)', () => {
    const envelope = parseChatEnvelope(JSON.stringify({ reply: 'Hi', recipe: 'not an object' }));
    expect(envelope.recipe.title).toBe('Untitled recipe');
    expect(envelope.recipe.servings).toBe(1);
  });

  it('falls back to servings: 1 for non-numeric or non-positive servings', () => {
    expect(
      parseChatEnvelope(JSON.stringify({ recipe: { servings: 'four' } })).recipe.servings
    ).toBe(1);
    expect(parseChatEnvelope(JSON.stringify({ recipe: { servings: -2 } })).recipe.servings).toBe(1);
    expect(parseChatEnvelope(JSON.stringify({ recipe: { servings: 0 } })).recipe.servings).toBe(1);
  });

  it('filters out non-string entries from ingredients/instructions/tags arrays', () => {
    const envelope = parseChatEnvelope(
      JSON.stringify({
        recipe: {
          ingredients: ['2 eggs', { weird: true }, 'salt'],
          instructions: ['Step one.', 42, 'Step two.'],
          tags: ['vegan', null, 'quick'],
        },
      })
    );

    expect(envelope.recipe.ingredients).toEqual(['2 eggs', 'salt']);
    expect(envelope.recipe.instructions).toEqual([
      { step_number: 1, text: 'Step one.' },
      { step_number: 2, text: 'Step two.' },
    ]);
    expect(envelope.recipe.tags).toEqual(['vegan', 'quick']);
  });

  it('throws a clear error when the response is not JSON at all', () => {
    expect(() => parseChatEnvelope('Sorry, I cannot help with that.')).toThrow(
      /did not contain valid JSON/
    );
  });

  it('throws a clear error when the response is a JSON scalar, not an object', () => {
    expect(() => parseChatEnvelope('"just a string"')).toThrow(/did not contain a JSON object/);
  });
});

describe('buildChatMessages', () => {
  it('includes "no recipe draft yet" context when currentDraft is null', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'a spicy curry' }], null);
    expect(JSON.stringify(messages)).toContain('no recipe draft yet');
  });

  it('serializes the current draft into a system message when provided', () => {
    const draft: AiRecipeDraft = {
      title: 'Mild Curry',
      description: null,
      image_path: null,
      prep_time_minutes: null,
      cook_time_minutes: null,
      total_time_minutes: null,
      servings: 4,
      ingredients: [],
      instructions: [],
      tags: [],
      category: null,
    };
    const messages = buildChatMessages([{ role: 'user', content: 'make it spicier' }], draft);
    expect(JSON.stringify(messages)).toContain('Mild Curry');
  });
});
