import { describe, expect, it } from 'vitest';
import {
  AI_ENVELOPE_JSON_SCHEMA,
  buildChatMessages,
  parseChatEnvelope,
  RECIPE_SAMPLING,
  type AiChatMessage,
  type AiRecipeDraft,
  type SupportedLocale,
} from '../src/ai-recipe-draft.js';

const SYSTEM_PROMPT_MARKER = 'You are a friendly recipe-development assistant.';

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

  it('strips a <think> block emitted before the JSON by reasoning models', () => {
    const raw =
      '<think>\nThe user wants a curry. I should keep it vegetarian.\n</think>\n' +
      JSON.stringify(wellFormedEnvelope);
    expect(parseChatEnvelope(raw).recipe.title).toBe('Spicy Vegetarian Curry');
  });

  it('extracts the JSON object when the model wraps it in prose', () => {
    const raw =
      'Sure! Here is the recipe you asked for:\n' +
      JSON.stringify(wellFormedEnvelope) +
      '\nLet me know if you want it spicier.';
    expect(parseChatEnvelope(raw).recipe.title).toBe('Spicy Vegetarian Curry');
  });

  it('is not confused by braces inside recipe text when extracting from prose', () => {
    const raw =
      'Here you go: ' +
      JSON.stringify({
        reply: 'Use a { brace } in the note.',
        recipe: { ...wellFormedRecipe, description: 'Serve with rice }' },
      });

    const envelope = parseChatEnvelope(raw);
    expect(envelope.reply).toBe('Use a { brace } in the note.');
    expect(envelope.recipe.description).toBe('Serve with rice }');
  });

  it('accepts object-shaped instructions, the shape the current draft is sent in', () => {
    const envelope = parseChatEnvelope(
      JSON.stringify({
        reply: 'Updated.',
        recipe: {
          ...wellFormedRecipe,
          instructions: [
            { step_number: 1, text: 'Press and cube the tofu.' },
            { step_number: 2, text: 'Simmer the sauce.' },
          ],
        },
      })
    );

    expect(envelope.recipe.instructions).toEqual([
      { step_number: 1, text: 'Press and cube the tofu.' },
      { step_number: 2, text: 'Simmer the sauce.' },
    ]);
  });

  it('renumbers object-shaped instructions from array order, ignoring the given step numbers', () => {
    const envelope = parseChatEnvelope(
      JSON.stringify({
        recipe: {
          instructions: [
            { step_number: 7, text: 'Chop.' },
            { step: 'Simmer.' },
            { text: 'Serve.' },
          ],
        },
      })
    );

    expect(envelope.recipe.instructions).toEqual([
      { step_number: 1, text: 'Chop.' },
      { step_number: 2, text: 'Simmer.' },
      { step_number: 3, text: 'Serve.' },
    ]);
  });

  it('accepts object-shaped ingredients, joining amount/unit/name', () => {
    const envelope = parseChatEnvelope(
      JSON.stringify({
        recipe: {
          ingredients: [
            { amount: 450, unit: 'g', name: 'flour' },
            { amount: '2', name: 'eggs' },
            { name: 'salt' },
            { raw_text: '30 ml olive oil' },
          ],
        },
      })
    );

    expect(envelope.recipe.ingredients).toEqual([
      '450 g flour',
      '2 eggs',
      'salt',
      '30 ml olive oil',
    ]);
  });

  it('falls back to sensible recipe defaults when recipe is missing entirely and there is no current draft', () => {
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

  it('falls back to sensible recipe defaults when recipe is malformed (not an object) and there is no current draft', () => {
    const envelope = parseChatEnvelope(JSON.stringify({ reply: 'Hi', recipe: 'not an object' }));
    expect(envelope.recipe.title).toBe('Untitled recipe');
    expect(envelope.recipe.servings).toBe(1);
  });

  it('preserves the current draft unchanged when recipe is omitted entirely (a non-edit reply)', () => {
    const currentDraft: AiRecipeDraft = {
      ...wellFormedRecipe,
      image_path: '/uploads/recipes/1/photo.jpg',
      instructions: [{ step_number: 1, text: 'Simmer.' }],
    };

    const envelope = parseChatEnvelope(
      JSON.stringify({ reply: "You're welcome! Enjoy the curry." }),
      currentDraft
    );

    expect(envelope.reply).toBe("You're welcome! Enjoy the curry.");
    expect(envelope.recipe).toEqual(currentDraft);
  });

  it('preserves the current draft unchanged when recipe is explicitly null', () => {
    const currentDraft: AiRecipeDraft = {
      ...wellFormedRecipe,
      image_path: '/uploads/recipes/1/photo.jpg',
      instructions: [{ step_number: 1, text: 'Simmer.' }],
    };

    const envelope = parseChatEnvelope(
      JSON.stringify({ reply: 'Happy to help!', recipe: null }),
      currentDraft
    );

    expect(envelope.recipe).toEqual(currentDraft);
  });

  it('preserves the current draft rather than wiping the preview for an empty recipe object', () => {
    const currentDraft: AiRecipeDraft = {
      ...wellFormedRecipe,
      image_path: null,
      instructions: [{ step_number: 1, text: 'Simmer.' }],
    };

    const envelope = parseChatEnvelope(
      JSON.stringify({ reply: 'Anything else?', recipe: {} }),
      currentDraft
    );

    expect(envelope.recipe).toEqual(currentDraft);
  });

  it('treats a top-level recipe with no envelope wrapper as the recipe', () => {
    const envelope = parseChatEnvelope(JSON.stringify(wellFormedRecipe));

    expect(envelope.reply).toBe("Here's the updated recipe.");
    expect(envelope.recipe.title).toBe('Spicy Vegetarian Curry');
    expect(envelope.recipe.ingredients).toHaveLength(2);
  });

  it('falls back to servings: 1 for non-numeric or non-positive servings', () => {
    expect(
      parseChatEnvelope(JSON.stringify({ recipe: { servings: 'four' } })).recipe.servings
    ).toBe(1);
    expect(parseChatEnvelope(JSON.stringify({ recipe: { servings: -2 } })).recipe.servings).toBe(1);
    expect(parseChatEnvelope(JSON.stringify({ recipe: { servings: 0 } })).recipe.servings).toBe(1);
  });

  it('filters out unusable entries from ingredients/instructions/tags arrays', () => {
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

  it('still throws for a plain prose reply — those are surfaced, never silently swallowed', () => {
    const prose =
      "Here's a classic pad thai — the sauce is the heart of it: tamarind for tang, fish " +
      'sauce for salt, and palm sugar for sweetness in roughly equal parts. I used chicken for ' +
      'the protein; let me know if you would like it spicier.';

    expect(() => parseChatEnvelope(prose, null)).toThrow(/did not contain valid JSON/);
  });
});

describe('AI_ENVELOPE_JSON_SCHEMA', () => {
  it('is shaped for OpenAI strict mode: every property required, no extras, nullable recipe', () => {
    const schema = AI_ENVELOPE_JSON_SCHEMA.schema as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type: unknown; required?: string[]; properties?: object }>;
    };

    expect(AI_ENVELOPE_JSON_SCHEMA.strict).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['reply', 'recipe']);
    expect(schema.properties.recipe.type).toEqual(['object', 'null']);

    const recipe = schema.properties.recipe as { required: string[]; properties: object };
    expect(recipe.required).toEqual(Object.keys(recipe.properties));
    expect(recipe.required).not.toContain('image_path');
  });
});

describe('buildChatMessages', () => {
  const draft: AiRecipeDraft = {
    title: 'Mild Curry',
    description: null,
    image_path: null,
    prep_time_minutes: null,
    cook_time_minutes: null,
    total_time_minutes: null,
    servings: 4,
    ingredients: ['1 can coconut milk'],
    instructions: [{ step_number: 1, text: 'Simmer.' }],
    tags: [],
    category: null,
  };

  // Same recipe, in the shape the system prompt asks the model to produce: flat instruction
  // strings and no image_path.
  const promptShapedDraft = {
    title: draft.title,
    description: draft.description,
    prep_time_minutes: draft.prep_time_minutes,
    cook_time_minutes: draft.cook_time_minutes,
    total_time_minutes: draft.total_time_minutes,
    servings: draft.servings,
    ingredients: draft.ingredients,
    instructions: ['Simmer.'],
    tags: draft.tags,
    category: draft.category,
  };

  it('includes "no recipe draft yet" context when currentDraft is null', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'a spicy curry' }], null);
    expect(JSON.stringify(messages)).toContain('no recipe draft yet');
  });

  it('serializes the current draft into a system message when there is no assistant turn yet', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'make it spicier' }], draft);

    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe('system');
    expect(messages[1].content).toContain('Current recipe draft');
    expect(messages[1].content).toContain('Mild Curry');
  });

  it('re-serializes assistant turns as JSON envelopes so history never demonstrates prose', () => {
    const conversation: AiChatMessage[] = [
      { role: 'user', content: 'a pad thai' },
      { role: 'assistant', content: "Here's a classic pad thai." },
      { role: 'user', content: 'swap the shrimp for chicken' },
    ];

    const messages = buildChatMessages(conversation, draft);

    // system prompt + the three conversation turns; the draft rides along in the assistant
    // turn instead of a separate system message.
    expect(messages).toHaveLength(4);
    expect(messages.filter((m) => m.role === 'system')).toHaveLength(1);

    const assistantTurn = messages.find((m) => m.role === 'assistant');
    const parsed = JSON.parse(assistantTurn!.content);
    expect(parsed.reply).toBe("Here's a classic pad thai.");
    expect(parsed.recipe).toEqual({ ...promptShapedDraft });
  });

  it('shows the draft in the shape the model is asked to produce, not our internal one', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'spicier' }], draft);

    // Flat instruction strings and no image_path — otherwise the example we show contradicts
    // the schema we ask for, and the model mirrors the example.
    expect(messages[1].content).toContain('"instructions": [\n    "Simmer."\n  ]');
    expect(messages[1].content).not.toContain('image_path');
    expect(messages[1].content).not.toContain('step_number');
  });

  it('inlines the draft only in the most recent assistant turn', () => {
    const conversation: AiChatMessage[] = [
      { role: 'user', content: 'a pad thai' },
      { role: 'assistant', content: 'First draft.' },
      { role: 'user', content: 'more peanuts' },
      { role: 'assistant', content: 'Second draft.' },
      { role: 'user', content: 'swap the shrimp for chicken' },
    ];

    const messages = buildChatMessages(conversation, draft);
    const assistantTurns = messages.filter((m) => m.role === 'assistant').map((m) => m.content);

    expect(JSON.parse(assistantTurns[0])).toEqual({ reply: 'First draft.' });
    expect(JSON.parse(assistantTurns[1])).toEqual({
      reply: 'Second draft.',
      recipe: promptShapedDraft,
    });
  });

  it('keeps the standalone draft message when there is an assistant turn but no draft', () => {
    const messages = buildChatMessages(
      [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'What would you like to cook?' },
        { role: 'user', content: 'a curry' },
      ],
      null
    );

    expect(messages[1].content).toContain('no recipe draft yet');
    expect(JSON.parse(messages[3].content)).toEqual({ reply: 'What would you like to cook?' });
  });

  it('leaves user turns untouched', () => {
    const messages = buildChatMessages(
      [
        { role: 'user', content: 'a pad thai' },
        { role: 'assistant', content: 'Done.' },
        { role: 'user', content: 'swap the shrimp for chicken' },
      ],
      draft
    );

    expect(messages[1]).toEqual({ role: 'user', content: 'a pad thai' });
    expect(messages[3]).toEqual({ role: 'user', content: 'swap the shrimp for chicken' });
  });

  it('round-trips its own assistant turn through parseChatEnvelope', () => {
    const messages = buildChatMessages(
      [
        { role: 'user', content: 'a curry' },
        { role: 'assistant', content: 'Here is a curry.' },
        { role: 'user', content: 'spicier' },
      ],
      draft
    );

    const assistantTurn = messages.find((m) => m.role === 'assistant')!;
    expect(parseChatEnvelope(assistantTurn.content, draft)).toEqual({
      reply: 'Here is a curry.',
      recipe: draft,
    });
  });

  it('defaults to English, with no translation stage and no separate override message', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'hi' }], null);

    expect(messages).toHaveLength(3);
    expect(messages.some((m) => m.content.startsWith('Language override:'))).toBe(false);
    expect(messages[0].content).toContain(SYSTEM_PROMPT_MARKER);
    expect(messages[0].content).toContain('Write the recipe in English.');
    expect(messages[0].content).toContain('Write "reply" in English');
    // "Translate this English recipe into English" is contradictory noise for en.
    expect(messages[0].content).not.toContain('translate');
  });

  const locales: { locale: SupportedLocale; languageName: string }[] = [
    { locale: 'nl', languageName: 'Flemish Dutch' },
    { locale: 'fr', languageName: 'French' },
    { locale: 'es', languageName: 'Spanish' },
  ];

  it.each(locales)(
    'parameterizes the single system prompt with the target language for locale $locale',
    ({ locale, languageName }) => {
      const messages = buildChatMessages([{ role: 'user', content: 'hi' }], null, locale);

      expect(messages).toHaveLength(3);
      expect(messages.some((m) => m.content.startsWith('Language override:'))).toBe(false);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain(SYSTEM_PROMPT_MARKER);
      expect(messages[0].content).toContain(`Write "reply" in ${languageName}`);
      expect(messages[0].content).toContain(`Write the recipe in ${languageName}`);
      expect(messages[0].content).not.toContain('translate');
      expect(messages[1]).toEqual({
        role: 'system',
        content: 'There is no recipe draft yet — this is the start of a new recipe.',
      });
      expect(messages[2]).toEqual({ role: 'user', content: 'hi' });
    }
  );

  it.each([
    { locale: 'en' as const, ingredient: '450 g flour' },
    { locale: 'nl' as const, ingredient: '450 g bloem' },
    { locale: 'fr' as const, ingredient: '450 g farine' },
    { locale: 'es' as const, ingredient: '450 g harina' },
  ])('shows example lines in the target language for locale $locale', ({ locale, ingredient }) => {
    const messages = buildChatMessages([{ role: 'user', content: 'hi' }], null, locale);
    expect(messages[0].content).toContain(ingredient);
  });

  it('reuses the existing Flemish Dutch vocabulary guidance for locale nl', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'hi' }], null, 'nl');
    expect(messages[0].content).toContain('"ajuin" not "ui"');
  });

  it('does not add Flemish-specific vocabulary guidance for non-Dutch locales', () => {
    const messages = buildChatMessages([{ role: 'user', content: 'hi' }], null, 'es');
    expect(messages[0].content).not.toContain('"ajuin" not "ui"');
  });
});

describe('RECIPE_SAMPLING', () => {
  it('has no repetition penalty and a low, deterministic-leaning temperature', () => {
    expect(RECIPE_SAMPLING.repeat_penalty).toBe(1.0);
    expect(RECIPE_SAMPLING.temperature).toBeLessThan(0.8);
  });
});
