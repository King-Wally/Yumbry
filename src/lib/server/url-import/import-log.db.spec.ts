import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { recipeImportAttempts } from '#lib/server/db/schema.ts';
import {
	closeTestDatabase,
	describeDb,
	resetTestDatabase,
	testDb
} from '#lib/server/db/testing.ts';

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/db/testing.ts');
	return {
		get db() {
			return testDb();
		}
	};
});

const { logImportAttempt } = await import('#lib/server/url-import/import-log.ts');

async function loggedRows() {
	return testDb()
		.select({
			url: recipeImportAttempts.url,
			hostname: recipeImportAttempts.hostname,
			success: recipeImportAttempts.success,
			method: recipeImportAttempts.method,
			errorKind: recipeImportAttempts.errorKind,
			errorMessage: recipeImportAttempts.errorMessage
		})
		.from(recipeImportAttempts);
}

describeDb('logImportAttempt', () => {
	beforeEach(resetTestDatabase);
	afterAll(closeTestDatabase);

	it('records a successful attempt with the hostname parsed from the url', async () => {
		await logImportAttempt({
			url: 'https://www.allrecipes.com/recipe/123',
			success: true,
			method: 'browser'
		});

		expect(await loggedRows()).toEqual([
			{
				url: 'https://www.allrecipes.com/recipe/123',
				hostname: 'www.allrecipes.com',
				success: true,
				method: 'browser',
				errorKind: null,
				errorMessage: null
			}
		]);
	});

	it('records a failed attempt with the error kind and message', async () => {
		await logImportAttempt({
			url: 'https://example.com/recipe',
			success: false,
			method: 'server',
			errorKind: 'no_recipe_found',
			errorMessage: 'No schema.org Recipe was found on that page.'
		});

		expect(await loggedRows()).toEqual([
			{
				url: 'https://example.com/recipe',
				hostname: 'example.com',
				success: false,
				method: 'server',
				errorKind: 'no_recipe_found',
				errorMessage: 'No schema.org Recipe was found on that page.'
			}
		]);
	});

	it('truncates an overly long error message', async () => {
		await logImportAttempt({
			url: 'https://example.com/recipe',
			success: false,
			errorKind: 'unknown',
			errorMessage: 'x'.repeat(1000)
		});

		const [row] = await loggedRows();
		expect(row.errorMessage).toBe('x'.repeat(500));
		expect(row.method).toBeNull();
	});

	it('falls back to the raw string as hostname when the url is not parseable', async () => {
		await logImportAttempt({
			url: 'not-a-url',
			success: false,
			errorKind: 'validation_error',
			errorMessage: 'Provide a valid recipe page URL.'
		});

		expect(await loggedRows()).toMatchObject([{ url: 'not-a-url', hostname: 'not-a-url' }]);
	});

	it('swallows a failed write and logs it instead of throwing', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const insert = vi.spyOn(testDb(), 'insert').mockImplementationOnce(() => {
			throw new Error('connection refused');
		});

		await expect(
			logImportAttempt({ url: 'https://example.com/recipe', success: true })
		).resolves.toBeUndefined();

		expect(consoleError).toHaveBeenCalled();
		insert.mockRestore();
		consoleError.mockRestore();
	});
});
