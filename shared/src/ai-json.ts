/**
 * Salvaging JSON out of whatever a model actually sent.
 *
 * Shared by every AI feature rather than owned by one, because the provider's downgrade ladder can
 * end up asking only for "valid JSON" with no schema at all — at which point the response is as
 * likely to be fenced, prefixed with reasoning, or wrapped in a sentence of commentary as it is to
 * be the bare object the prompt asked for.
 */

/**
 * Returns the first balanced `{ ... }` span, tracking string literals and escapes so braces inside
 * recipe text don't throw off the depth count. Covers models that wrap their JSON in a sentence of
 * commentary — still a live case, because the provider's downgrade ladder can end up asking only
 * for "valid JSON" with no schema at all.
 */
export function firstBalancedObject(text: string): string | null {
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

// Some models emit <think> blocks before the answer; markdown-fenced JSON is also common despite
// being told not to. Both are cheap to strip and a no-op when they don't occur.
export function extractJsonText(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(withoutThinking);
  return (fenced ? fenced[1] : withoutThinking).trim();
}

export function parseJsonLoosely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const balanced = firstBalancedObject(text);
    if (balanced === null) throw new Error('no JSON object found');
    return JSON.parse(balanced);
  }
}
