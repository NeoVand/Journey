/**
 * Subtitles from a conversation's timed words, as scripts/narration/say.mjs writes them: each turn's span, and the start
 * of each sentence where the timing caught it.
 */
import type { Turn } from './narrator.svelte';

/** One subtitle: a short run of one voice's words, and when it's said. */
export type Cue = { who: 'NORA' | 'THEO'; text: string; start: number; end: number };
/** A turn as say.mjs writes it: its words, its span, and when each sentence starts, where the timing caught it. */
export type Line = Turn & { text: string; parts?: { text: string; start: number | null }[] };

/** The longest a subtitle runs, in letters: two short lines at most. */
export const CUE_LETTERS = 84;

/**
 * A long sentence in runs short enough to read at a glance: as few as fit, as even as can be, and broken after a comma,
 * a colon or a dash where one falls near enough.
 */
export function runs(text: string) {
	if (text.length <= CUE_LETTERS) return [text];
	const words = text.split(' ');
	const n = words.length;
	const upTo = [0];
	for (const word of words) upTo.push(upTo[upTo.length - 1] + word.length + 1);
	const letters = (i: number, j: number) => upTo[j] - upTo[i] - 1;
	for (let k = Math.ceil(text.length / CUE_LETTERS); k <= n; k++) {
		const aim = text.length / k;
		// cost[p][j]: the best way to say the first j words in p runs.
		const cost = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
		const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
		cost[0][0] = 0;
		for (let p = 1; p <= k; p++) {
			for (let j = p; j <= n; j++) {
				for (let i = p - 1; i < j; i++) {
					const size = letters(i, j);
					if (size > CUE_LETTERS || cost[p - 1][i] === Infinity) continue;
					const c = cost[p - 1][i] + ((size - aim) / aim) ** 2 - (j < n && /[,;:—]$/.test(words[j - 1]) ? 0.15 : 0);
					if (c < cost[p][j]) {
						cost[p][j] = c;
						cut[p][j] = i;
					}
				}
			}
		}
		if (cost[k][n] === Infinity) continue;
		const out: string[] = [];
		for (let p = k, j = n; p > 0; p--) {
			const i = cut[p][j];
			out.unshift(words.slice(i, j).join(' '));
			j = i;
		}
		return out;
	}
	return [text];
}

/** A conversation's subtitles: each sentence from when it starts to when the next does, long ones cut into runs. */
export function cuesOf(lines: Line[]) {
	const cues: Cue[] = [];
	for (const line of lines) {
		const parts = line.parts?.length ? line.parts : [{ text: line.text, start: line.start }];
		// Where the timing missed a sentence's start, it's put between its neighbours by how far through the letters it is.
		const from: number[] = [];
		let letters = 0;
		for (const part of parts) {
			from.push(letters);
			letters += part.text.length + 1;
		}
		const known = parts.map((part, i) => (i === 0 ? (part.start ?? line.start) : part.start));
		const starts = parts.map((_, i) => {
			const at = known[i];
			if (at !== null) return at;
			let a = i - 1;
			while (known[a] === null) a--;
			let b = i + 1;
			while (b < parts.length && known[b] === null) b++;
			const [tb, lb] = b < parts.length ? [known[b] as number, from[b]] : [line.end, letters];
			return (known[a] as number) + ((tb - (known[a] as number)) * (from[i] - from[a])) / (lb - from[a]);
		});
		parts.forEach((part, i) => {
			const start = starts[i];
			const end = Math.max(start + 0.4, i + 1 < parts.length ? starts[i + 1] : line.end);
			const pieces = runs(part.text);
			const total = pieces.reduce((n, piece) => n + piece.length, 0);
			let done = 0;
			for (const piece of pieces) {
				const a = start + ((end - start) * done) / total;
				done += piece.length;
				cues.push({ who: line.who, text: piece, start: a, end: start + ((end - start) * done) / total });
			}
		});
	}
	return cues;
}
