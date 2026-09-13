import { describe, expect, it } from 'vitest';
import { stripHtml } from '../src/utils/strip-html.js';

describe('stripHtml', () => {
  it('leaves plain text untouched', () => {
    expect(stripHtml('Mix dry ingredients.')).toBe('Mix dry ingredients.');
  });

  it('turns list items into bullet lines', () => {
    const input = '<ul>\n<li>Preheat the oven.</li>\n<li>Roll out the dough.</li>\n</ul>';
    expect(stripHtml(input)).toBe('- Preheat the oven.\n- Roll out the dough.');
  });

  it('turns paragraph and br tags into line breaks', () => {
    expect(stripHtml('<p>First line.</p><p>Second line.</p>')).toBe('First line.\nSecond line.');
    expect(stripHtml('First line.<br>Second line.<br/>Third line.')).toBe(
      'First line.\nSecond line.\nThird line.'
    );
  });

  it('drops inline tags but keeps their text content', () => {
    expect(stripHtml('<strong>Important:</strong> use <em>convection</em> mode.')).toBe(
      'Important: use convection mode.'
    );
  });

  it('drops tags with attributes, e.g. links and spans', () => {
    expect(
      stripHtml('<a href="https://example.com">a link</a> and <span class="x">text</span>')
    ).toBe('a link and text');
  });

  it('decodes common HTML entities', () => {
    expect(stripHtml('Salt &amp; pepper &mdash; to taste')).toBe('Salt & pepper &mdash; to taste');
    expect(stripHtml('&lt;tag&gt; &quot;quoted&quot; &#39;single&#39;')).toBe(
      `<tag> "quoted" 'single'`
    );
    expect(stripHtml('caf&#233;')).toBe('café');
  });

  it('collapses whitespace produced by removed tags', () => {
    const input =
      '<ul>\n<li>Bereid de bouillon.</li>\n<li>Snijd de tomaat.</li>\n</ul>\n<p><strong>Tip:</strong> <em>doe dit rustig.</em></p>';
    expect(stripHtml(input)).toBe(
      '- Bereid de bouillon.\n- Snijd de tomaat.\nTip: doe dit rustig.'
    );
  });
});
