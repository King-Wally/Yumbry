import { isActionFailure } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { AiProviderError, AiQuotaExceededError } from '#lib/server/ai/errors.ts';
import { FamilyError } from '#lib/server/family/errors.ts';
import { failKinded, kindedError } from '#lib/server/http/kinded-errors.ts';
import { JsonLdImportError } from '#lib/server/recipes/jsonld-import.ts';
import { UrlImportError } from '#lib/server/url-import/errors.ts';

describe('kindedError', () => {
	it.each([
		[new AiProviderError('down', 'unreachable'), 503],
		[new AiProviderError('bad', 'bad_status'), 503],
		[new AiProviderError('odd', 'malformed_response'), 503],
		[new AiProviderError('off', 'not_configured'), 503],
		[new UrlImportError('nope', 'invalid_url'), 400],
		[new UrlImportError('private', 'blocked_url'), 400],
		[new UrlImportError('slow', 'timeout'), 422],
		[new UrlImportError('net', 'network_error'), 422],
		[new UrlImportError('bot', 'bot_challenge'), 422],
		[new UrlImportError('none', 'no_recipe_found'), 400],
		[new JsonLdImportError('not json', 'invalid_json'), 400],
		[new FamilyError('bad link', 'invalid_invite'), 404],
		[new FamilyError('same', 'already_member'), 409],
		[new FamilyError('alone', 'nothing_to_leave'), 409]
	])('maps %o to %d', (err, status) => {
		expect(kindedError(err)).toMatchObject({ status, kind: err.kind });
	});

	it('gives the user a translated message rather than the log message', () => {
		expect(kindedError(new FamilyError('log text', 'invalid_invite'))?.message).toBe(
			'That invite link is not valid.'
		);
	});

	it('carries a spent budget’s scope and retry time', () => {
		const err = new AiQuotaExceededError('user', '2026-09-11T00:00:00.000Z');
		expect(kindedError(err)).toMatchObject({
			status: 429,
			kind: 'quota_exceeded',
			scope: 'user',
			retryAt: '2026-09-11T00:00:00.000Z'
		});
	});

	it('returns null for an unrelated error', () => {
		expect(kindedError(new Error('unrelated'))).toBeNull();
	});
});

describe('failKinded', () => {
	it('turns a domain error into an action failure with message and kind', () => {
		const result = failKinded(new UrlImportError('Blocked by bot protection.', 'bot_challenge'));
		expect(isActionFailure(result)).toBe(true);
		expect(result.status).toBe(422);
		expect(result.data).toEqual({
			message: "That site's bot protection blocked automatic import.",
			kind: 'bot_challenge'
		});
	});

	it('passes a spent budget’s scope and retry time on to the page', () => {
		const result = failKinded(new AiQuotaExceededError('shared', null));
		expect(result.status).toBe(429);
		expect(result.data).toMatchObject({ kind: 'quota_exceeded', scope: 'shared', retryAt: null });
	});

	it('rethrows an unrelated error unchanged', () => {
		const other = new Error('unrelated');
		expect(() => failKinded(other)).toThrow(other);
	});
});
