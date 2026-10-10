import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	headlessFetchHtml,
	isHeadlessFetchConfigured
} from '#lib/server/url-import/headless-fetch.ts';
import { safeFetchHtml } from '#lib/server/url-import/safe-fetch.ts';
import { UrlImportError, type ImportMethod } from '#lib/server/url-import/errors.ts';
import { extractRecipeFromHtml, scrapeRecipeFromUrl } from './scrape.ts';

vi.mock('#lib/server/url-import/safe-fetch.ts', () => ({
	safeFetchHtml: vi.fn()
}));

vi.mock('#lib/server/url-import/headless-fetch.ts', () => ({
	headlessFetchHtml: vi.fn(),
	isHeadlessFetchConfigured: vi.fn(() => false)
}));

const bareRecipe = {
	'@context': 'https://schema.org',
	'@type': 'Recipe',
	name: 'Simple Pancakes',
	description: 'Fluffy weekend pancakes.',
	image: 'https://example.com/pancakes.jpg',
	prepTime: 'PT10M',
	cookTime: 'PT15M',
	recipeYield: '4 servings',
	recipeCategory: 'Breakfast',
	keywords: 'pancakes, breakfast, easy',
	recipeIngredient: ['1 1/2 cups flour', '2 eggs', 'salt to taste'],
	recipeInstructions: 'Mix dry ingredients.\nWhisk in eggs.\nCook on a griddle.'
};

const graphWrapped = {
	'@context': 'https://schema.org',
	'@graph': [
		{ '@type': 'WebPage', name: 'A page' },
		{ ...bareRecipe, name: 'Graph Recipe' }
	]
};

function htmlWithScripts(...blocks: string[]): string {
	const scripts = blocks
		.map((block) => `<script type="application/ld+json">${block}</script>`)
		.join('\n');
	return `<html><head>${scripts}</head><body></body></html>`;
}

describe('extractRecipeFromHtml', () => {
	it('carries nutrition through into the draft', () => {
		const node = {
			...bareRecipe,
			nutrition: {
				'@type': 'NutritionInformation',
				calories: '512 kcal',
				fatContent: '24 g',
				carbohydrateContent: '40 g',
				proteinContent: '31 g'
			}
		};
		const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(node)));

		expect(recipe.calories).toBe(512);
		expect(recipe.fat_content).toBe(24);
		expect(recipe.carbohydrate_content).toBe(40);
		expect(recipe.protein_content).toBe(31);
	});

	it('extracts a Recipe from a single JSON-LD block', () => {
		const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(bareRecipe)));

		expect(recipe.title).toBe('Simple Pancakes');
		expect(recipe.servings).toBe(4);
		expect(recipe.category).toBe('Breakfast');
		// The draft's ingredients are raw text lines, not structured objects.
		expect(recipe.ingredients).toEqual(['1 1/2 cups flour', '2 eggs', 'salt to taste']);
		expect(recipe.instructions).toEqual([
			{ step_number: 1, text: 'Mix dry ingredients.' },
			{ step_number: 2, text: 'Whisk in eggs.' },
			{ step_number: 3, text: 'Cook on a griddle.' }
		]);
	});

	it('finds the Recipe when it is the second of several script blocks', () => {
		const html = htmlWithScripts(
			JSON.stringify({ '@type': 'WebSite', name: 'Some Site' }),
			JSON.stringify(bareRecipe)
		);
		const recipe = extractRecipeFromHtml(html);
		expect(recipe.title).toBe('Simple Pancakes');
	});

	it('handles a Recipe nested inside @graph', () => {
		const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(graphWrapped)));
		expect(recipe.title).toBe('Graph Recipe');
	});

	it('skips a malformed JSON block and still finds a later valid Recipe', () => {
		const html = htmlWithScripts('{ this is not valid json', JSON.stringify(bareRecipe));
		const recipe = extractRecipeFromHtml(html);
		expect(recipe.title).toBe('Simple Pancakes');
	});

	it('reads script text raw, without decoding entities or stopping at markup', () => {
		const node = { ...bareRecipe, name: 'Mac &amp; <b>Cheese</b>' };
		const recipe = extractRecipeFromHtml(htmlWithScripts(JSON.stringify(node)));
		// strip-html cleans the text the way it does for pasted JSON-LD.
		expect(recipe.title).toBe('Mac & Cheese');
	});

	it('ignores scripts of other types', () => {
		const html =
			'<html><head><script>var recipe = {"@type":"Recipe"};</script></head><body></body></html>';
		expect(() => extractRecipeFromHtml(html)).toThrow(
			expect.objectContaining({ kind: 'no_jsonld' })
		);
	});

	it('throws no_jsonld when the page has no JSON-LD script tags at all', () => {
		expect(() =>
			extractRecipeFromHtml('<html><body>No structured data here.</body></html>')
		).toThrow(expect.objectContaining({ kind: 'no_jsonld' }));
	});

	it('throws no_recipe_found when JSON-LD blocks exist but none is a Recipe', () => {
		const html = htmlWithScripts(JSON.stringify({ '@type': 'WebPage', name: 'Not a recipe' }));
		expect(() => extractRecipeFromHtml(html)).toThrow(
			expect.objectContaining({ kind: 'no_recipe_found' })
		);
	});
});

describe('scrapeRecipeFromUrl', () => {
	beforeEach(() => {
		vi.mocked(safeFetchHtml).mockResolvedValue({
			html: htmlWithScripts(JSON.stringify(bareRecipe)),
			contentType: 'text/html',
			finalUrl: 'https://example.com/pancakes'
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('fetches the URL and returns a draft with plain ingredient lines', async () => {
		const draft = await scrapeRecipeFromUrl('https://example.com/pancakes');
		expect(draft.title).toBe('Simple Pancakes');
		expect(typeof draft.ingredients[0]).toBe('string');
	});

	it("sends the user's locale as Accept-Language and traces the method", async () => {
		const trace: { method?: ImportMethod } = {};
		await scrapeRecipeFromUrl('https://example.com/pancakes', 'nl', trace);
		expect(safeFetchHtml).toHaveBeenCalledWith('https://example.com/pancakes', {
			acceptLanguage: 'nl,en;q=0.8'
		});
		expect(trace.method).toBe('server');
	});

	describe('headless fallback', () => {
		const recipePage = {
			html: htmlWithScripts(JSON.stringify(bareRecipe)),
			contentType: 'text/html',
			finalUrl: 'https://example.com/pancakes'
		};

		beforeEach(() => {
			vi.mocked(isHeadlessFetchConfigured).mockReturnValue(true);
			vi.mocked(headlessFetchHtml).mockResolvedValue(recipePage);
		});

		it.each([
			[
				'bot_challenge',
				new UrlImportError('blocked', 'bot_challenge', undefined, { httpStatus: 403 })
			],
			[
				'a 403 page',
				new UrlImportError('HTTP 403', 'network_error', undefined, { httpStatus: 403 })
			],
			[
				'a 402 page',
				new UrlImportError('HTTP 402', 'network_error', undefined, { httpStatus: 402 })
			],
			[
				'a 503 page',
				new UrlImportError('HTTP 503', 'network_error', undefined, { httpStatus: 503 })
			]
		])('retries in the browser after %s', async (_label, error) => {
			vi.mocked(safeFetchHtml).mockRejectedValue(error);
			const trace: { method?: ImportMethod } = {};

			const draft = await scrapeRecipeFromUrl('https://example.com/pancakes', 'nl', trace);

			expect(draft.title).toBe('Simple Pancakes');
			expect(headlessFetchHtml).toHaveBeenCalledWith('https://example.com/pancakes');
			expect(trace.method).toBe('browser');
		});

		it('retries in the browser when the fetched page has no JSON-LD', async () => {
			vi.mocked(safeFetchHtml).mockResolvedValue({ ...recipePage, html: '<html></html>' });

			const draft = await scrapeRecipeFromUrl('https://example.com/pancakes');

			expect(draft.title).toBe('Simple Pancakes');
			expect(headlessFetchHtml).toHaveBeenCalledOnce();
		});

		it.each([
			new UrlImportError('private', 'blocked_url'),
			new UrlImportError('slow', 'timeout'),
			new UrlImportError('HTTP 404', 'network_error', undefined, { httpStatus: 404 }),
			new UrlImportError('DNS', 'network_error')
		])('does not retry after $kind ($message)', async (error) => {
			vi.mocked(safeFetchHtml).mockRejectedValue(error);

			await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(error);
			expect(headlessFetchHtml).not.toHaveBeenCalled();
		});

		it('does not retry when no browser is configured', async () => {
			vi.mocked(isHeadlessFetchConfigured).mockReturnValue(false);
			const error = new UrlImportError('blocked', 'bot_challenge');
			vi.mocked(safeFetchHtml).mockRejectedValue(error);

			await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(error);
			expect(headlessFetchHtml).not.toHaveBeenCalled();
		});

		it('reports the original error when the browser is unreachable', async () => {
			const error = new UrlImportError('blocked', 'bot_challenge');
			vi.mocked(safeFetchHtml).mockRejectedValue(error);
			vi.mocked(headlessFetchHtml).mockRejectedValue(new Error('ECONNREFUSED'));
			vi.spyOn(console, 'warn').mockImplementation(() => {});

			await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(error);
		});

		it("reports the browser's own import error when it has one", async () => {
			vi.mocked(safeFetchHtml).mockRejectedValue(new UrlImportError('blocked', 'bot_challenge'));
			const browserError = new UrlImportError('still blocked', 'bot_challenge');
			vi.mocked(headlessFetchHtml).mockRejectedValue(browserError);

			await expect(scrapeRecipeFromUrl('https://example.com/pancakes')).rejects.toBe(browserError);
		});
	});
});
