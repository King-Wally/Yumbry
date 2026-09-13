const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  deg: '°',
};

/**
 * Decodes the small set of HTML entities that commonly show up in JSON-LD text fields
 * (`&amp;`, `&lt;`, numeric refs, etc.). Not a full HTML entity table — just enough to clean
 * up text scraped from recipe sites.
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    const replacement = NAMED_ENTITIES[entity.toLowerCase()];
    return replacement ?? match;
  });
}

/**
 * Some sites (e.g. HelloFresh) emit JSON-LD whose text fields — most often
 * `recipeInstructions[].text` and `description` — contain raw HTML markup instead of plain
 * text (`<ul><li>...</li></ul>`, `<p><strong>...</strong></p>`). This strips that markup down
 * to clean, readable plain text: list items and block boundaries become line breaks, inline
 * tags are dropped (their text content kept), and HTML entities are decoded.
 */
export function stripHtml(text: string): string {
  let result = text;

  // List items become bullet lines.
  result = result.replace(/<li[^>]*>/gi, '\n- ');

  // Explicit line breaks.
  result = result.replace(/<br\s*\/?>/gi, '\n');

  // Other structural/block tags (opening or closing) become line breaks.
  result = result.replace(/<\/?(p|div|ul|ol|table|tr|td|th|h[1-6])[^>]*>/gi, '\n');

  // Any remaining tag is removed, keeping its text content.
  result = result.replace(/<[^>]+>/g, '');

  result = decodeHtmlEntities(result);

  // Collapse whitespace: trim each line, drop empty lines produced by removed tags.
  result = result
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return result;
}
