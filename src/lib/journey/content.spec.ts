import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from './content';

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
