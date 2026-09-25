import type { RecipeSnapshot } from 'yumbry-shared';
import { toNullableNumber } from './numeric';

/** A run of text on one side of a comparison; `changed` runs get highlighted. */
export interface Segment {
  text: string;
  changed: boolean;
}

export type TimeKey = 'prep_time_minutes' | 'cook_time_minutes' | 'total_time_minutes';
export type NutritionKey = 'calories' | 'fat_content' | 'carbohydrate_content' | 'protein_content';

export const TIME_KEYS: TimeKey[] = [
  'prep_time_minutes',
  'cook_time_minutes',
  'total_time_minutes',
];
export const NUTRITION_KEYS: NutritionKey[] = [
  'calories',
  'fat_content',
  'carbohydrate_content',
  'protein_content',
];

/** One side of the comparison, everything already flagged — the page only renders it. */
export interface DiffPane {
  title: Segment[];
  description: Segment[];
  category: { name: string | null; changed: boolean };
  tags: { name: string; changed: boolean }[];
  times: Record<TimeKey, { value: number | null; changed: boolean }>;
  nutrition: Record<NutritionKey, { value: number | null; changed: boolean }>;
  servings: { value: string; changed: boolean };
  ingredients: Segment[][];
  instructions: Segment[][];
}

export interface RecipeDiff {
  old: DiffPane;
  current: DiffPane;
  /** Changed fields, plus one per added/removed tag and per differing ingredient/step row. */
  changeCount: number;
}

/** Index pairs of a longest common subsequence of `a` and `b`, in order. */
export function lcs<T>(a: T[], b: T[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

function tokenize(text: string | null | undefined): string[] {
  return (text ?? '').split(/\s+/).filter(Boolean);
}

/** Groups tokens into runs of equal `changed`. The space between two runs is its own unchanged
 * segment, so a highlight never bleeds into the gap next to it. */
function toSegments(tokens: string[], kept: Set<number>): Segment[] {
  const segments: Segment[] = [];
  tokens.forEach((token, index) => {
    const changed = !kept.has(index);
    const last = segments[segments.length - 1];
    if (last && last.changed === changed) {
      last.text += ` ${token}`;
    } else {
      if (last) segments.push({ text: ' ', changed: false });
      segments.push({ text: token, changed });
    }
  });
  return segments;
}

/** Word-level diff: the words of each side that are not part of the common subsequence. */
export function wordDiff(
  a: string | null | undefined,
  b: string | null | undefined
): [Segment[], Segment[]] {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const pairs = lcs(ta, tb);
  return [
    toSegments(ta, new Set(pairs.map(([i]) => i))),
    toSegments(tb, new Set(pairs.map(([, j]) => j))),
  ];
}

function hasChange(segments: Segment[]): boolean {
  return segments.some((segment) => segment.changed);
}

/** Line-level diff: identical lines are aligned first, then the lines between two anchors are
 * paired up by position and word-diffed. A line with no partner is highlighted whole. */
export function listDiff(a: string[], b: string[]): [Segment[][], Segment[][], number] {
  const left: Segment[][] = [];
  const right: Segment[][] = [];
  let changes = 0;
  let i = 0;
  let j = 0;

  for (const [ai, bj] of [...lcs(a, b), [a.length, b.length] as [number, number]]) {
    const gapA = a.slice(i, ai);
    const gapB = b.slice(j, bj);
    for (let x = 0; x < Math.max(gapA.length, gapB.length); x++) {
      const [sa, sb] = wordDiff(gapA[x], gapB[x]);
      if (gapA[x] !== undefined) left.push(sa);
      if (gapB[x] !== undefined) right.push(sb);
      if (hasChange(sa) || hasChange(sb)) changes++;
    }
    if (ai < a.length) {
      left.push([{ text: a[ai], changed: false }]);
      right.push([{ text: b[bj], changed: false }]);
    }
    i = ai + 1;
    j = bj + 1;
  }

  return [left, right, changes];
}

export function diffRecipes(old: RecipeSnapshot, current: RecipeSnapshot): RecipeDiff {
  let changeCount = 0;
  const flag = (changed: boolean) => {
    if (changed) changeCount++;
    return changed;
  };

  const [titleOld, titleCur] = wordDiff(old.title, current.title);
  flag(hasChange(titleOld) || hasChange(titleCur));
  const [descOld, descCur] = wordDiff(old.description, current.description);
  flag(hasChange(descOld) || hasChange(descCur));

  const categoryChanged = flag(old.category !== current.category);

  const tagSide = (mine: string[], other: string[]) =>
    mine.map((name) => ({ name, changed: flag(!other.includes(name)) }));
  const tagsOld = tagSide(old.tags, current.tags);
  const tagsCur = tagSide(current.tags, old.tags);

  const timesOld = {} as DiffPane['times'];
  const timesCur = {} as DiffPane['times'];
  for (const key of TIME_KEYS) {
    const changed = flag(old[key] !== current[key]);
    timesOld[key] = { value: old[key], changed };
    timesCur[key] = { value: current[key], changed };
  }

  // Compared as numbers: a Decimal column can come back as "420" or "420.00".
  const nutritionOld = {} as DiffPane['nutrition'];
  const nutritionCur = {} as DiffPane['nutrition'];
  for (const key of NUTRITION_KEYS) {
    const a = toNullableNumber(old[key]);
    const b = toNullableNumber(current[key]);
    const changed = flag(a !== b);
    nutritionOld[key] = { value: a, changed };
    nutritionCur[key] = { value: b, changed };
  }

  const servingsChanged = flag(
    toNullableNumber(old.servings) !== toNullableNumber(current.servings)
  );

  const [ingredientsOld, ingredientsCur, ingredientChanges] = listDiff(
    old.ingredients,
    current.ingredients
  );
  const [stepsOld, stepsCur, stepChanges] = listDiff(
    old.instructions.map((step) => step.text),
    current.instructions.map((step) => step.text)
  );
  changeCount += ingredientChanges + stepChanges;

  return {
    old: {
      title: titleOld,
      description: descOld,
      category: { name: old.category, changed: categoryChanged },
      tags: tagsOld,
      times: timesOld,
      nutrition: nutritionOld,
      servings: { value: old.servings, changed: servingsChanged },
      ingredients: ingredientsOld,
      instructions: stepsOld,
    },
    current: {
      title: titleCur,
      description: descCur,
      category: { name: current.category, changed: categoryChanged },
      tags: tagsCur,
      times: timesCur,
      nutrition: nutritionCur,
      servings: { value: current.servings, changed: servingsChanged },
      ingredients: ingredientsCur,
      instructions: stepsCur,
    },
    changeCount,
  };
}
