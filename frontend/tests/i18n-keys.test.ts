import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from 'yumbry-shared';
import en from '../src/i18n/locales/en.json';
import nl from '../src/i18n/locales/nl.json';
import fr from '../src/i18n/locales/fr.json';
import es from '../src/i18n/locales/es.json';

const bundles: Record<string, unknown> = { en, nl, fr, es };

function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key)
  );
}

/**
 * i18next falls back to English for a missing key rather than failing, so a locale file that fell
 * behind looks fine until someone reads it. Adding a block by hand across four files — as the
 * units setting did — is exactly when one gets missed.
 */
describe('translation key parity', () => {
  const reference = flatten(en).sort();

  it('ships a bundle for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) expect(bundles[locale]).toBeDefined();
  });

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== 'en'))(
    '%s has exactly the same keys as en',
    (locale) => {
      const keys = flatten(bundles[locale]).sort();
      expect(keys.filter((key) => !reference.includes(key))).toEqual([]);
      expect(reference.filter((key) => !keys.includes(key))).toEqual([]);
    }
  );

  // The measurement controls live on the AI chat page, beside the preview they change.
  it('has the measurement controls in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const keys = flatten(bundles[locale]);
      expect(keys).toContain('aiChat.units.label');
      expect(keys).toContain('aiChat.units.options.metric');
      expect(keys).toContain('aiChat.units.options.imperial');
      expect(keys).toContain('aiChat.smallVolumes.label');
      expect(keys).toContain('aiChat.smallVolumes.options.spoons');
      expect(keys).toContain('aiChat.smallVolumes.options.millilitres');
    }
  });
});
