import { describe, expect, it } from 'vitest';
import { extractJsonText, parseJsonLoosely } from './json.ts';

describe('extractJsonText', () => {
	it('strips <think> blocks and markdown fences', () => {
		expect(extractJsonText('<think>hmm {no}</think>\n```json\n{"a": 1}\n```')).toBe('{"a": 1}');
	});

	it('leaves bare JSON alone', () => {
		expect(extractJsonText('  {"a": 1}  ')).toBe('{"a": 1}');
	});
});

describe('parseJsonLoosely', () => {
	it('parses plain JSON', () => {
		expect(parseJsonLoosely('{"a": [1, 2]}')).toEqual({ a: [1, 2] });
	});

	it('finds the object inside a sentence of commentary', () => {
		expect(parseJsonLoosely('Here you go: {"a": {"b": 1}} Enjoy!')).toEqual({ a: { b: 1 } });
	});

	it('ignores braces and escaped quotes inside strings', () => {
		const text = 'Sure. {"note": "use a {small} pan, \\"really\\"}", "n": 2} and {"x": 1}';
		expect(parseJsonLoosely(text)).toEqual({ note: 'use a {small} pan, "really"}', n: 2 });
	});

	it('throws when there is no object to find', () => {
		expect(() => parseJsonLoosely('no json here')).toThrow();
	});

	it('throws on an object that never closes', () => {
		expect(() => parseJsonLoosely('{"a": {"b": 1}')).toThrow();
	});
});
