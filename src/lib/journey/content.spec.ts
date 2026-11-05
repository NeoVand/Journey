import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, wheelOdds } from './content';

const copy = readFileSync(new URL('./Journey.svelte', import.meta.url), 'utf8');
const marked = [...copy.matchAll(/\[\[([^|\]^]+)(?:\|([^\]]+))?\]\]/g)]
	.map((m) => (m[2] ?? m[1]).toLowerCase())
	.filter((key) => key !== 'key' && key !== 'term'); // the two in the comment that explains the markup

describe('the glossary', () => {
	it('defines every term the copy marks', () => {
		expect(marked.length).toBeGreaterThan(20);
		expect(marked.filter((key) => !(key in GLOSSARY))).toEqual([]);
	});

	it('has no definition nothing uses', () => {
		expect(Object.keys(GLOSSARY).filter((key) => !marked.includes(key))).toEqual([]);
	});
});

describe('the wheel', () => {
	it('gives real probabilities', () => {
		for (const t of [0.1, 0.5, 1, 2]) expect(wheelOdds(t).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
	});

	it('makes the favorite surer as the temperature falls', () => {
		expect(wheelOdds(0.2)[0]).toBeGreaterThan(0.99);
		expect(wheelOdds(1)[0]).toBeCloseTo(0.61, 1);
		expect(wheelOdds(2)[0]).toBeLessThan(0.45);
	});
});
