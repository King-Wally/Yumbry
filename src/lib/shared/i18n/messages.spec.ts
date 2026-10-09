import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import es from '../../../../messages/es.json';
import fr from '../../../../messages/fr.json';
import nl from '../../../../messages/nl.json';
import settings from '../../../../project.inlang/settings.json';
import * as m from '#lib/paraglide/messages.js';
import { SUPPORTED_LOCALES } from '#lib/shared/i18n/locale.ts';

const bundles: Record<string, Record<string, unknown>> = { en, nl, fr, es };

function keys(bundle: Record<string, unknown>): string[] {
	return Object.keys(bundle)
		.filter((key) => key !== '$schema')
		.sort();
}

/** The `{name}` placeholders a message uses, across all of its plural variants. */
function variables(message: unknown): string[] {
	const texts =
		typeof message === 'string'
			? [message]
			: (message as { match: Record<string, string> }[]).flatMap((v) => Object.values(v.match));
	return [
		...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((x) => x[1])))
	].sort();
}

/**
 * A message missing from one locale falls back to English instead of failing, so a locale file
 * that fell behind looks fine until someone reads it. Adding a block by hand across four files is
 * exactly when one gets missed.
 */
describe('translation key parity', () => {
	const reference = keys(en);

	it('ships a bundle for every supported locale, and Paraglide compiles exactly those', () => {
		for (const locale of SUPPORTED_LOCALES) expect(bundles[locale]).toBeDefined();
		expect([...settings.locales].sort()).toEqual([...SUPPORTED_LOCALES].sort());
		expect(settings.baseLocale).toBe('en');
	});

	it.each(SUPPORTED_LOCALES.filter((locale) => locale !== 'en'))(
		'%s has exactly the same keys as en',
		(locale) => {
			const own = keys(bundles[locale]);
			expect(own.filter((key) => !reference.includes(key))).toEqual([]);
			expect(reference.filter((key) => !own.includes(key))).toEqual([]);
		}
	);

	it.each(SUPPORTED_LOCALES.filter((locale) => locale !== 'en'))(
		'%s uses the same placeholders as en in every message',
		(locale) => {
			const mismatched = reference.filter(
				(key) =>
					variables(bundles[locale][key]).join() !== variables(en[key as keyof typeof en]).join()
			);
			expect(mismatched).toEqual([]);
		}
	);

	// The measurement controls live on the AI chat page, beside the preview they change.
	it('has the measurement controls in every locale', () => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(keys(bundles[locale])).toEqual(
				expect.arrayContaining([
					'ai_chat_units_label',
					'ai_chat_units_options_metric',
					'ai_chat_units_options_imperial',
					'ai_chat_small_volumes_label',
					'ai_chat_small_volumes_options_spoons',
					'ai_chat_small_volumes_options_millilitres'
				])
			);
		}
	});
});

describe('plural messages', () => {
	it('picks the variant by count', () => {
		expect(m.recipe_versions_differences({ count: 1 }, { locale: 'en' })).toBe(
			'1 difference highlighted'
		);
		expect(m.recipe_versions_differences({ count: 3 }, { locale: 'en' })).toBe(
			'3 differences highlighted'
		);
	});

	it('follows each language’s own rules', () => {
		// French counts 0 as singular; English doesn't.
		expect(m.recipe_versions_servings({ count: 0 }, { locale: 'fr' })).toBe('0 portion');
		expect(m.recipe_versions_servings({ count: 0 }, { locale: 'en' })).toBe('0 servings');
	});
});
