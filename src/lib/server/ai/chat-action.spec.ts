import { describe, expect, it } from 'vitest';
import { chatTier } from './chat-action.ts';

describe('chatTier', () => {
	it('uses the big model only for the first turn of a new recipe', () => {
		expect(chatTier('create', 1)).toBe('big');
		expect(chatTier('create', 3)).toBe('medium');
		expect(chatTier('improve', 1)).toBe('medium');
	});
});
