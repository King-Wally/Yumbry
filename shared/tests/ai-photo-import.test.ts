import { describe, expect, it } from 'vitest';
import { buildPhotoImportMessages } from '../src/ai-photo-import.js';
import { buildChatMessages, type AiContentPart } from '../src/ai-recipe-draft.js';
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '../src/locale.js';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function systemText(locale: SupportedLocale = 'en'): string {
  const [system] = buildPhotoImportMessages(DATA_URL, locale);
  if (typeof system.content !== 'string') throw new Error('system message should be plain text');
  return system.content;
}

function userParts(locale: SupportedLocale = 'en'): AiContentPart[] {
  const [, user] = buildPhotoImportMessages(DATA_URL, locale);
  if (typeof user.content === 'string') throw new Error('user message should carry content parts');
  return user.content;
}

describe('buildPhotoImportMessages', () => {
  it('returns exactly one system message and one user message', () => {
    const messages = buildPhotoImportMessages(DATA_URL);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('carries the image as an image_url part alongside a text part', () => {
    const parts = userParts();

    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: DATA_URL } });
  });

  // The text has to precede the image: the instruction is what the image is being read *for*, and
  // a model that meets the picture first has already started describing it.
  it('puts the instruction before the image', () => {
    const parts = userParts();

    expect(parts.findIndex((part) => part.type === 'text')).toBeLessThan(
      parts.findIndex((part) => part.type === 'image_url')
    );
  });

  it.each(SUPPORTED_LOCALES)('names the target language for %s', (locale) => {
    expect(systemText(locale)).toContain(LANGUAGE_NAMES[locale]);
  });

  // The whole point of the separate prompt: transcription, not drafting. Sharing the field contract
  // with the chat prompt must not drag the chat prompt's "never refuse, always produce a recipe"
  // instruction along with it — that one turns an unreadable photo into a plausible invention.
  it('forbids inventing, where the chat prompt requires always producing a recipe', () => {
    const photo = systemText();

    expect(photo).toContain('Transcribe, never invent.');
    expect(photo).not.toContain('Never\n   refuse and never wait for more detail');
  });

  it('allows a null recipe for a photo that holds none', () => {
    expect(systemText()).toMatch(/null\s+When the photo holds no recipe at all/);
  });

  // Everywhere else the model writes canonical metric and parseChatEnvelope converts for the
  // reader. A photo is the one input that can arrive in cups, so the conversion instruction has to
  // be explicit rather than implied by the general metric requirement.
  it('spells out converting the source units, not just writing metric', () => {
    const photo = systemText();

    expect(photo).toContain('Convert');
    expect(photo).toContain('1 cup of flour is about 120 g');
  });

  it('shares the ingredient field contract with the chat prompt', () => {
    const [chatSystem] = buildChatMessages([{ role: 'user', content: 'pasta' }], null, 'en');
    if (typeof chatSystem.content !== 'string') throw new Error('expected text');

    const shared =
      '"recipe.ingredients"         One object per ingredient, in the order they are used.';
    expect(chatSystem.content).toContain(shared);
    expect(systemText()).toContain(shared);
  });

  it('numbers every hard requirement uniquely', () => {
    const numbers = systemText()
      .split('# HARD REQUIREMENTS')[1]
      .split('\n# ')[0]
      .split('\n')
      .flatMap((line) => line.match(/^(\d+)\. /)?.[1] ?? []);

    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
});
