import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CUE_LETTERS, cuesOf, runs, type Line } from './cues';

const dir = new URL('../../../static/narration/', import.meta.url);
const talks = readdirSync(dir)
	.filter((f) => f.endsWith('.json'))
	.map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { id: string; lines: Line[] });

describe('subtitles', () => {
	it('leaves a short sentence whole, and cuts a long one into runs that keep every word', () => {
		expect(runs('Twelve shapes, by our count.')).toEqual(['Twelve shapes, by our count.']);
		const long =
			'The transcript, the full record of the session, goes back to the model on every turn, every round trip, so it only grows, and a long afternoon of work can creep right up to the edge.';
		const cut = runs(long);
		expect(cut.length).toBeGreaterThan(1);
		expect(cut.join(' ')).toBe(long);
		for (const run of cut) expect(run.length).toBeLessThanOrEqual(CUE_LETTERS);
	});

	it('times every conversation in order, short enough to read, saying every word of every turn', () => {
		expect(talks.length).toBeGreaterThan(50);
		for (const talk of talks) {
			const lines = talk.lines.filter((l) => l.start !== null && l.end !== null);
			const cues = cuesOf(lines);
			for (const [i, cue] of cues.entries()) {
				expect(cue.end, `${talk.id}: ${cue.text}`).toBeGreaterThan(cue.start);
				expect(cue.text.length, `${talk.id}: ${cue.text}`).toBeLessThanOrEqual(CUE_LETTERS);
				if (i) expect(cue.start, `${talk.id}: ${cue.text}`).toBeGreaterThanOrEqual(cues[i - 1].start);
			}
			const said = cues.map((c) => c.text).join(' ');
			expect(said.replace(/\s+/g, ' ')).toBe(lines.map((l) => l.text).join(' ').replace(/\s+/g, ' '));
		}
	});
});
