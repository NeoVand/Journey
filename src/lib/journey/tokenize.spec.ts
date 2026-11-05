import { describe, expect, it } from 'vitest';
import { PROMPT } from './content';
import { cut, loadTokenizer } from './tokenize';

describe('the tokenizer', async () => {
	const tokenizer = await loadTokenizer();
	const texts = (s: string) => cut(tokenizer, s).map((p) => p.text);

	it('cuts text into pieces that add back up to it', () => {
		expect(texts(PROMPT).join('')).toBe(PROMPT);
	});

	it('keeps the space with the word after it', () => {
		expect(texts('the job')).toEqual(['the', ' job']);
	});

	it('gives the same piece the same number', () => {
		const [a, , b] = cut(tokenizer, ' the race the');
		expect(a.id).toBe(b.id);
	});

	it('does what the book says about rare words and code', () => {
		expect(texts('job').length).toBe(1);
		expect(texts('job_scheduler.py').length).toBeGreaterThan(2);
		expect(texts('antidisestablishmentarianism').length).toBeGreaterThan(2);
	});

	it('cuts text that looks like a control marker, rather than failing on it', () => {
		expect(texts('<|endoftext|>').length).toBeGreaterThan(1);
	});
});
