import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, RUN_WITH_CACHE, RUN_WITHOUT_CACHE, TEN_TURNS, wheelOdds } from './content';

const copy = ['./Journey.svelte', './content.ts'].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
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

describe('the ten turns', () => {
	it('sends everything before it again, every turn', () => {
		TEN_TURNS.slice(1).forEach((t, i) => expect(t.cached).toBe(TEN_TURNS[i].cached + TEN_TURNS[i].fresh));
	});

	it('adds up to what the card says', () => {
		expect(RUN_WITH_CACHE).toBe(27350);
		expect(RUN_WITHOUT_CACHE).toBe(254250);
		expect(Math.round(RUN_WITHOUT_CACHE / RUN_WITH_CACHE)).toBe(9);
		// Reads at a tenth of the price, ignoring the small surcharge for writing to the cache.
		expect(Math.round(RUN_WITHOUT_CACHE / (RUN_WITH_CACHE + (RUN_WITHOUT_CACHE - RUN_WITH_CACHE) * 0.1))).toBe(5);
	});

	it('stays above 90 percent cached after turn one', () => {
		TEN_TURNS.slice(1).forEach((t) => expect(t.cached / (t.cached + t.fresh)).toBeGreaterThan(0.9));
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
