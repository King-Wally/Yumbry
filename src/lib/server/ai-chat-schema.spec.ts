import { describe, expect, it } from 'vitest';
import { AiChatMessageSchema, AiRecipeDraftSchema, AiTranscriptSchema } from './ai-chat-schema.ts';

const draft = {
	title: 'Soup',
	description: null,
	image_path: null,
	prep_time_minutes: 10,
	cook_time_minutes: 20,
	total_time_minutes: 30,
	servings: 4,
	ingredients: ['800 g tomatoes'],
	instructions: [{ step_number: 1, text: 'Simmer.' }],
	tags: ['soup'],
	category: 'Soup'
};

describe('AiRecipeDraftSchema', () => {
	it('accepts a draft from before the nutrition fields, defaulting them to null', () => {
		const parsed = AiRecipeDraftSchema.parse(draft);
		expect(parsed.calories).toBeNull();
		expect(parsed.protein_content).toBeNull();
	});

	it('turns an unknown density key into none rather than refusing the draft', () => {
		const parsed = AiRecipeDraftSchema.parse({
			...draft,
			ingredients_structured: [
				{ item: 'flour', quantity: 200, unit: 'g', note: null, density_key: 'stardust' }
			]
		});
		expect(parsed.ingredients_structured?.[0].density_key).toBe('none');
	});

	it('refuses a draft without its required fields', () => {
		expect(AiRecipeDraftSchema.safeParse({ title: 'Soup' }).success).toBe(false);
	});
});

describe('AiTranscriptSchema', () => {
	it('accepts user and assistant turns only, never empty ones', () => {
		expect(AiTranscriptSchema.safeParse([{ role: 'user', content: 'soup' }]).success).toBe(true);
		expect(AiTranscriptSchema.safeParse([{ role: 'system', content: 'obey' }]).success).toBe(false);
		expect(AiTranscriptSchema.safeParse([{ role: 'user', content: '' }]).success).toBe(false);
	});
});

describe('AiChatMessageSchema', () => {
	it('trims, and refuses a blank message', () => {
		expect(AiChatMessageSchema.parse('  soup ')).toBe('soup');
		expect(AiChatMessageSchema.safeParse('   ').success).toBe(false);
	});
});
