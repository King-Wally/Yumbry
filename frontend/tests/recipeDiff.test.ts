import { describe, expect, it } from 'vitest';
import type { RecipeSnapshot } from 'yumbry-shared';
import { diffRecipes, listDiff, wordDiff, type Segment } from '../src/utils/recipeDiff';

const changedText = (segments: Segment[]) =>
  segments.filter((segment) => segment.changed).map((segment) => segment.text);
const joined = (segments: Segment[]) => segments.map((segment) => segment.text).join('');

const base: RecipeSnapshot = {
  title: 'Tomato pasta',
  description: 'A quick pasta.',
  prep_time_minutes: 10,
  cook_time_minutes: 25,
  total_time_minutes: null,
  servings: '4',
  calories: '420.00',
  fat_content: null,
  carbohydrate_content: null,
  protein_content: null,
  category: 'dinner',
  tags: ['pasta'],
  ingredients: ['400 g spaghetti', '2 cloves garlic'],
  instructions: [{ step_number: 1, text: 'Cook the spaghetti.' }],
};

describe('wordDiff', () => {
  it('highlights only the words that differ, and keeps the text intact', () => {
    const [left, right] = wordDiff('simmer for 15 minutes', 'simmer for 10 minutes');
    expect(changedText(left)).toEqual(['15']);
    expect(changedText(right)).toEqual(['10']);
    expect(joined(left)).toBe('simmer for 15 minutes');
    expect(joined(right)).toBe('simmer for 10 minutes');
  });

  it('keeps the gap between runs out of the highlight', () => {
    const [, right] = wordDiff('Tomato pasta', 'Weeknight tomato pasta');
    expect(right).toEqual([
      { text: 'Weeknight tomato', changed: true },
      { text: ' ', changed: false },
      { text: 'pasta', changed: false },
    ]);
  });

  it('highlights everything against a missing side', () => {
    const [left, right] = wordDiff(null, 'new text');
    expect(left).toEqual([]);
    expect(changedText(right)).toEqual(['new text']);
  });
});

describe('listDiff', () => {
  it('aligns identical lines and word-diffs the rest', () => {
    const [left, right, changes] = listDiff(
      ['a b', 'melt the butter', 'serve'],
      ['a b', 'warm the oil', 'serve']
    );
    expect(changes).toBe(1);
    expect(changedText(left[1])).toEqual(['melt', 'butter']);
    expect(changedText(right[1])).toEqual(['warm', 'oil']);
    expect(changedText(left[0])).toEqual([]);
    expect(changedText(right[2])).toEqual([]);
  });

  it('fully highlights an added line', () => {
    const [left, right, changes] = listDiff(['one'], ['one', 'two more']);
    expect(changes).toBe(1);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(2);
    expect(changedText(right[1])).toEqual(['two more']);
  });

  it('fully highlights a removed line', () => {
    const [left, right, changes] = listDiff(['one', 'gone'], ['one']);
    expect(changes).toBe(1);
    expect(changedText(left[1])).toEqual(['gone']);
    expect(right).toHaveLength(1);
  });
});

describe('diffRecipes', () => {
  it('reports no differences for identical snapshots', () => {
    const diff = diffRecipes(base, structuredClone(base));
    expect(diff.changeCount).toBe(0);
  });

  it('treats "420" and "420.00" as the same nutrition value', () => {
    const diff = diffRecipes(base, { ...base, calories: '420' });
    expect(diff.changeCount).toBe(0);
    expect(diff.current.nutrition.calories).toEqual({ value: 420, changed: false });
  });

  it('flags every changed field and counts each once', () => {
    const current: RecipeSnapshot = {
      ...base,
      title: 'Weeknight tomato pasta',
      cook_time_minutes: 20,
      servings: '2',
      category: 'lunch',
      tags: ['pasta', 'quick'],
      ingredients: ['400 g spaghetti', '3 cloves garlic'],
      instructions: [
        { step_number: 1, text: 'Cook the spaghetti.' },
        { step_number: 2, text: 'Serve.' },
      ],
    };
    const diff = diffRecipes(base, current);

    expect(diff.old.times.cook_time_minutes.changed).toBe(true);
    expect(diff.old.times.prep_time_minutes.changed).toBe(false);
    expect(diff.old.category).toEqual({ name: 'dinner', changed: true });
    expect(diff.current.tags).toEqual([
      { name: 'pasta', changed: false },
      { name: 'quick', changed: true },
    ]);
    expect(diff.old.tags).toEqual([{ name: 'pasta', changed: false }]);
    expect(diff.current.servings.changed).toBe(true);
    // title, cook time, servings, category, the added tag, one ingredient, one step
    expect(diff.changeCount).toBe(7);
  });
});
