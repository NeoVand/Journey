/**
 * The score: which sound plays when, and which ambience fills which stretch of the story. Times are story time T,
 * or a side trip's own time, one unit per card.
 *
 * Recorded sounds (by name, files in static/sound) carry the physical world: drawers, paper, motors, rooms.
 * Synthesized ones carry what has to follow the picture exactly: notes, ticks, the air of a flight.
 */
import type { World } from '../world';
import type { TrackId } from '../content';
import type { Bed, Cue, Where } from './conductor';
import { chime, harp, key, low, note, porcelain, sweep, tick, whoosh } from './synth';
import { PUCK_MOVES, puckPoint, roomPoint } from '../tracks/harness';
import { STAGE_AT } from '../tracks/sandbox';
import { MEMORY_AT } from '../tracks/memory';
import { TOKEN_PATHS } from '../chapters/transformer';

/* ---------- the story ---------- */

/**
 * The sentence's own tune: whenever its eleven tokens are cut, turned over or lifted into the model, they play these
 * notes in order, so the ear knows them again. Thinking tokens get a lower phrase, and the tool call a brighter one.
 */
const SENTENCE = [0, 2, 4, 2, 5, 4, 7, 5, 4, 2, 0];
const THINKING = [-3, -1, 0, -1, -3, -2, 0, 1, 0, -1, -3, -2];
const CALL = [5, 7, 9, 7, 10, 9, 7, 9, 10, 12, 10, 9, 7, 9, 12];
/** One note per turn of the whole fix: the red one, turn seven, low; the last two bright. Its buttons play them too. */
export const TURN_NOTES = [0, 2, 4, 2, 5, 4, -2, 5, 7, 9];

/** Places along the way, in the story's coordinates, for left and right and distance. */
const P = {
	laptop: [-3.3, 0.8, 0.5],
	harness: [1.1, 1.6, -0.65],
	server: [7.2, 0.8, -0.72],
	easel: [5.75, 1.75, 0.9],
	tunnel: [12, -6, 0.9],
	gateway: [15.94, -8.4, 0.9],
	template: [-3.4, -17, 0.9],
	belt: [4, -16.5, 0.9],
	arch: [11.45, -16.5, 0.9],
	brain: [1.4, -31, 1.2],
	gates: [-51, -13, 0],
	sandbox: [-24.5, -15, 0],
	compaction: [-20, 6, -4],
	memory: [-48, 9, -4],
	turns: [-110, 15, -4],
	finish: [-144, 18, -4]
} satisfies Record<string, Where>;
/** Somewhere inside the cluster, by how far along its hall it is. */
const hall = (x: number, y = 0): Where => [1.4 + x, -46 + y, 1.2];

export function score(w: World): { cues: Cue[]; beds: Bed[] } {
	void w;
	const cues: Cue[] = [];
	const at = (T: number, sound: Cue['sound'], where?: Where, more: Partial<Cue> = {}) => cues.push({ T, sound, at: where, ...more });
	const tone = (T: number, i: number, where?: Where, gain = 0.4, ring = 1) => at(T, porcelain(note(i), ring), where, { gain, minor: true });

	/* 1. It starts as a sentence: Return, the slip flies to the harness, which wakes up; the server connects. */
	at(1.56, key(1.6), P.laptop, { gain: 0.8 });
	at(1.585, low(note(-10), 0.35), P.laptop, { gain: 0.35 });
	at(1.62, 'paper-slide', P.laptop, { gain: 0.6, rate: 1.1 });
	at(1.64, whoosh(0.9, 1600), P.harness, { gain: 0.22 });
	at(1.7, 'drawer-out', P.harness, { gain: 0.8 });
	at(1.86, 'paper-land', P.harness, { gain: 0.6 });
	[1.82, 1.85, 1.88, 1.91, 1.94].forEach((T, i) => tone(T, i, P.harness, 0.32));
	at(1.9, 'drawer-in', P.harness, { gain: 0.7 });
	at(1.97, 'paper-roll', P.easel, { gain: 0.5 });
	at(2.0, chime([0, 4]), P.server, { gain: 0.3 });
	at(2.02, 'servo', P.easel, { gain: 0.35, rate: 1.2 });

	/* 2. The harness wakes up: four drawers, four slips onto the page. */
	[2.04, 2.2, 2.36, 2.52].forEach((a, i) => {
		at(a, 'drawer-out', P.harness, { gain: 0.85, rate: 1 + i * 0.02 });
		at(a + 0.05, 'paper-slide', P.harness, { gain: 0.5, rate: 1.05 + i * 0.03 });
		tone(a + 0.08, i + 2, P.harness, 0.35);
		at(a + 0.11, 'drawer-in', P.harness, { gain: 0.65 });
		at(a + 0.16, 'paper-land', P.easel, { gain: 0.55, rate: 0.95 + i * 0.03 });
	});
	at(2.41, 'paper-slide', [3.05, 0.5, 2.5], { gain: 0.3, rate: 1.3, minor: true });

	/* 3. One JSON request: the tabs, the page rolls up and drops to the tunnel, which locks. */
	at(3.04, 'paper-slide', P.easel, { gain: 0.35, rate: 1.2, minor: true });
	at(3.105, 'paper-slide', P.easel, { gain: 0.35, rate: 1.3, minor: true });
	at(3.6, 'paper-slide', P.easel, { gain: 0.3, rate: 0.9, minor: true });
	at(3.66, 'paper-roll', P.easel, { gain: 0.6 });
	at(3.72, whoosh(1.4, 1300), P.tunnel, { gain: 0.3 });
	at(3.64, 'servo', P.easel, { gain: 0.3, rate: 1.1, minor: true });
	at(3.985, 'latch', P.tunnel, { gain: 0.8, rate: 0.8 });

	/* 4. Across the wire. */
	at(4.0, 'tube', P.tunnel, { gain: 0.6 });
	at(4.08, 'tunnel', P.tunnel, { gain: 0.8, dip: 0.3 });
	at(4.47, 'tunnel', P.tunnel, { gain: 0.45, rate: 0.9 });

	/* 5. The front door: five checks, each a blade out, a green lamp and back. Then down the pipe to the template. */
	for (let i = 0; i < 5; i++) {
		const a = 5.04 + 0.116 * i;
		at(a, 'latch', P.gateway, { gain: 0.6, rate: 1.05 + i * 0.03 });
		tone(a + 0.058, i + 1, P.gateway, 0.4);
		at(a + 0.1, 'block', P.gateway, { gain: 0.35, rate: 1.2, minor: true });
	}
	at(5.62, chime([2, 4, 7]), P.gateway, { gain: 0.3 });
	at(5.62, 'tube', P.gateway, { gain: 0.5 });
	at(5.7, whoosh(1.6, 1100), P.template, { gain: 0.25 });

	/* 6. Now it is a token: the strip feeds out, the cutter comes down eleven times, each piece rings as it turns to a token. */
	at(6.02, 'paper-slide', P.template, { gain: 0.6, rate: 0.9 });
	// The little robot on its gantry: a whirr as it walks to the next cut, the ka-chunk as it stamps down,
	// and the piece pops up as a token with its note.
	SENTENCE.forEach((n, i) => {
		const step = 6.16 + 0.036364 * i;
		at(step + 0.036364 * 0.05, 'stomp', P.belt, { gain: 0.45, length: 0.3, rate: 1.05 + (i % 2) * 0.05, minor: true });
		at(step + 0.036364 * 0.71, 'stomp', P.belt, { gain: 0.85, offset: 0.62, length: 0.24, rate: 0.98 + (i % 3) * 0.03 });
		at(step + 0.036364 * 0.8, 'pop', P.belt, { gain: 0.4, rate: 1 + n * 0.04, minor: true });
		tone(step + 0.036364 * 0.82, n, P.belt, 0.38, 0.9);
	});
	at(6.56, 'servo', P.belt, { gain: 0.4 });
	// The flip wave: the same tune again, quicker, as each one turns over to show its number.
	SENTENCE.forEach((n, i) => tone(6.68 + 0.01 * i, n + 5, P.belt, 0.28, 0.6));
	// The safety arch drops in and lands.
	at(6.84, whoosh(0.5, 900), P.arch, { gain: 0.25 });
	at(6.895, 'press', P.arch, { gain: 0.9, dip: 0.3 });

	/* 7. Thousands more: the row departs, under the safety light, and pours into the model. */
	at(6.94, 'scanner', P.arch, { gain: 0.7 });
	at(7.32, whoosh(1.8, 800), P.brain, { gain: 0.3 });
	at(7.93, whoosh(1.4, 600), P.brain, { gain: 0.45, dip: 0.6 });

	/* 8. One model, many chips: the weights drop, split, and land on the chips. */
	at(8.06, whoosh(1.0, 700), hall(0, 6), { gain: 0.35 });
	at(8.21, 'press', hall(0, 2), { gain: 0.9, rate: 0.8, dip: 0.4 });
	at(8.28, 'relay', hall(0, 2), { gain: 0.6 });
	[8.573, 8.579, 8.585, 8.592, 8.6, 8.609, 8.62, 8.637].forEach((T, i) => at(T, 'block', hall(-4.8 + i * 1.37, 1), { gain: 0.45, rate: 0.9 + i * 0.03, minor: true }));
	at(8.66, chime([0, 2, 4, 7]), hall(0, 1), { gain: 0.28 });

	/* 9. Its working memory: a key and a value for each word slide into the cache, then a read sweeps them. */
	[9.1598, 9.2242, 9.2886, 9.353, 9.4174, 9.4818].forEach((K, i) => {
		at(K, 'block', hall(30, 1), { gain: 0.5, rate: 1.05, minor: true });
		at(K + 0.0322, 'block', hall(30, 1), { gain: 0.5, rate: 0.95 });
		tone(K + 0.034, SENTENCE[i], hall(30, 1), 0.25, 0.6);
	});
	[9.628, 9.665, 9.703, 9.74, 9.777, 9.815].forEach((T, i) => tone(T, SENTENCE[i] + 5, hall(30, 1), 0.22, 0.5));

	/* 10. Blocks that can sit anywhere. */
	[10.35, 10.435, 10.52, 10.605].forEach((T, i) => {
		at(T - 0.23, 'servo', hall(60, 1), { gain: 0.25, rate: 1.3, minor: true });
		at(T, 'block', hall(60, 1), { gain: 0.6, rate: 1 + i * 0.04 });
	});
	[10.245, 10.37, 10.495, 10.62].forEach((T) => at(T, tick(1.2), hall(60, 2), { gain: 0.3, minor: true }));

	/* 11. Turn two starts ahead: the router asks the copies, the gate recognises four blocks, and computes one. */
	at(11.12, 'scanner', hall(43.75, 2), { gain: 0.5, rate: 1.1 });
	at(11.2003, low(note(-4), 0.5), hall(43.75, 1), { gain: 0.35 });
	at(11.2437, low(note(-4), 0.5), hall(43.75, 1), { gain: 0.35 });
	at(11.287, chime([2, 4]), hall(43.75, 1), { gain: 0.35 });
	at(11.3, 'servo', hall(45, 1), { gain: 0.5, rate: 0.9 });
	[11.4535, 11.5115, 11.5695, 11.6275].forEach((T, i) => tone(T, i + 2, hall(45, 1), 0.4));
	// E isn't recognised: a hollow knock and two falling notes. Then it's computed, and pops out new.
	at(11.6855, 'clonk', hall(45, 1), { gain: 0.6 });
	at(11.6855, porcelain(note(2)), hall(45, 1), { gain: 0.3, delay: 0.04 });
	at(11.6855, porcelain(note(0)), hall(45, 1), { gain: 0.3, delay: 0.2 });
	at(11.7, 'servo', hall(46, 1), { gain: 0.35, rate: 1.2 });
	at(11.745, 'tube', hall(46, 1), { gain: 0.45, rate: 1.2 });
	at(11.75, 'relay', hall(46, 1), { gain: 0.45 });
	at(11.806, 'pop', hall(46, 1), { gain: 0.6, rate: 1.1 });
	at(11.806, porcelain(note(4)), hall(46, 1), { gain: 0.35, delay: 0.05 });
	at(11.86, 'block', hall(60, 1), { gain: 0.6 });
	at(11.86, porcelain(note(7)), hall(60, 1), { gain: 0.3, delay: 0.03 });

	/*
	 * 12. Sharing the chips: the shuttle sweeps across the lanes once per step, left then right, and every request
	 * it passes grows by one cell, a pop pitched to its lane. Newcomers roll in, finishers slide out with a note,
	 * and the board flips to say what's happening.
	 */
	const running = [
		(k: number) => k <= 5 || k >= 7,
		(k: number) => k <= 2 || (k >= 4 && k <= 11) || k === 13,
		() => true,
		(k: number) => k <= 8 || k >= 11,
		(k: number) => k <= 3 || (k >= 5 && k <= 7) || k >= 10
	];
	const lanePass = [0.0154, 0.0218, 0.0258, 0.0298, 0.0362];
	for (let k = 0; k < 14; k++) {
		const start = 12.08 + 0.06 * k;
		const rightward = k % 2 === 0;
		at(start + 0.004, 'shuttle', hall(90, 1), { gain: 0.35, rate: 1.05 + (k % 3) * 0.04, minor: k % 2 === 1 });
		for (let lane = 0; lane < 5; lane++) {
			if (!running[lane](k)) continue;
			const pass = rightward ? lanePass[lane] : 0.0516 - lanePass[lane] + 0.0154;
			at(start + pass, 'pop', hall(86 + lane * 2, 1), { gain: lane === 2 ? 0.5 : 0.3, rate: 0.85 + lane * 0.1, minor: lane !== 2 });
		}
	}
	// Your own request's cell gets a note too, each one a step up: the reply growing.
	for (let k = 0; k < 14; k++) tone(12.08 + 0.06 * k + (k % 2 === 0 ? 0.0258 : 0.0412), [0, 2, 4, 5, 4, 2, 4, 5, 7, 5, 4, 5, 7, 9][k], hall(90, 1), 0.22, 0.6);
	[12.3224, 12.3824, 12.5024, 12.7424, 12.8624].forEach((T) => {
		at(T - 0.05, 'servo', hall(90, 1), { gain: 0.3, rate: 1.15, minor: true });
		at(T, 'block', hall(90, 1), { gain: 0.5 });
	});
	[12.3185, 12.3785, 12.4985, 12.6785, 12.8585].forEach((T, i) => {
		at(T - 0.03, 'drawer-out', hall(92, 1), { gain: 0.35, rate: 1.35 });
		at(T, chime(i % 2 ? [4, 7] : [2, 4]), hall(92, 1), { gain: 0.3 });
	});
	[12.08, 12.278, 12.338, 12.398, 12.458, 12.518, 12.578, 12.638, 12.698, 12.758, 12.818].forEach((T) => at(T, 'flap', hall(90, 3), { gain: 0.45, length: 0.5 }));
	at(12.518, 'clonk', hall(90, 2), { gain: 0.5 });
	at(12.518, porcelain(note(-2)), hall(90, 2), { gain: 0.3, delay: 0.05 });
	at(12.542, 'clonk', hall(90, 1), { gain: 0.35, rate: 1.2, minor: true });
	at(12.662, porcelain(note(5)), hall(90, 1), { gain: 0.3 });

	/* 13. Reading and writing: the prompt goes in, every chip fires, the memory crosses, and the words come out one by one. */
	at(13.19, 'tube', hall(120, 1), { gain: 0.5 });
	at(13.22, 'relay', hall(120, 1), { gain: 0.8, dip: 0.3 });
	at(13.25, whoosh(0.6, 2400), hall(120, 1), { gain: 0.3 });
	[13.28, 13.315, 13.35].forEach((T) => at(T, 'servo', hall(124, 1), { gain: 0.3, minor: true }));
	for (let i = 0; i < 8; i++) at(13.4 + 0.0425 * i, porcelain(note([0, 2, 4, 7, 4, 2, 4, 0][i] + 2), 0.8), hall(128, 1), { gain: 0.35 });
	at(13.46, whoosh(1.0, 1400), hall(120, 1), { gain: 0.2, minor: true });
	at(13.6, 'relay', hall(120, 1), { gain: 0.5, minor: true });
	at(13.7, 'paper-slide', hall(120, 2), { gain: 0.35, minor: true });
	at(13.9, whoosh(1.2, 700), hall(120, 0), { gain: 0.4, dip: 0.5 });

	/* 14. The transformer. */
	[14.055, 14.067, 14.079, 14.091, 14.103].forEach((T, i) => tone(T, i * 2, hall(168, 2), 0.3));
	// The tiles hop off the belt onto the embedding floor one by one, and each lands like a domino set down, where
	// it lands. The second "the" lands on the first, a little higher and harder, and slides off it onto the map.
	TOKEN_PATHS[0].forEach(([x], i) => {
		const onTop = i === 6;
		at(14.1826 + 0.005673 * i, 'domino', hall(168 + x, 0), { gain: onTop ? 0.6 : 0.5, rate: onTop ? 1.18 : 0.94 + ((i * 0.37) % 1) * 0.14, minor: i > 0 });
	});
	at(14.268, 'domino', hall(168 + TOKEN_PATHS[1][6][0], 0), { gain: 0.3, rate: 0.9 });
	// Wherever something grows through the stack, threads and the branches of the feed-forward network, it grows
	// audibly too: a soft rising shimmer, a little higher each time it climbs.
	at(14.278, 'grow', hall(168, 2), { gain: 0.5, rate: 0.9 });
	at(14.33, porcelain(note(7), 1.4), hall(168, 2), { gain: 0.4 });
	// Attention is strings, not growth: each line from "job" back to an earlier token is plucked as it reaches it,
	// the thick ones low and loud, the thin ones high and faint. Then the webs, every token at once, are a sweep
	// across all the strings, one per layer.
	[0.02, 0.11, 0.01, 0.32, 0.46, 0.05, 0.03].forEach((share, i) => {
		const reach = 14.362 + ((6 - i) / 7) * 0.014 + 0.012;
		at(reach, harp(note(Math.round(7 - 12 * Math.sqrt(share)))), hall(168 + TOKEN_PATHS[2][i][0], 2), { gain: 0.2 + share * 0.7, minor: share < 0.1 });
	});
	at(14.402, chime([0, 2, 4]), hall(168, 2), { gain: 0.25, minor: true });
	at(14.432, whoosh(0.9, 2600), hall(168, 2), { gain: 0.15 });
	at(14.495, porcelain(note(9), 1.2), hall(168, 2), { gain: 0.35 });
	at(14.556, 'strum', hall(168, 2), { gain: 0.55 });
	[14.752, 14.794, 14.848].forEach((T, i) => at(T, 'strum', hall(168, 4 + i * 2), { gain: 0.35, rate: 1.06 + i * 0.06, minor: true }));
	at(14.628, 'pop', hall(168, 2), { gain: 0.4 });
	at(14.644, 'grow', hall(168, 2), { gain: 0.45, rate: 1.05 });
	[14.648, 14.653, 14.658].forEach((T, i) => tone(T, 4 + i * 2, hall(168, 2), 0.3));
	for (let i = 0; i < 10; i++) at(14.664 + 0.0022 * i, 'pop', hall(168, 2), { gain: 0.16, rate: 1.2 + (i % 4) * 0.08, minor: true });
	[14.716, 14.762, 14.802].forEach((T, i) => at(T, 'grow', hall(168, 4 + i * 2), { gain: 0.45, rate: 0.95 + i * 0.12 }));
	at(14.874, porcelain(note(12), 1.6), hall(168, 6), { gain: 0.4 });
	at(14.888, 'grow', hall(168, 6), { gain: 0.5, rate: 0.8 });
	for (let i = 0; i < 7; i++) tone(14.94 + 0.003 * i, [7, 5, 4, 2, 4, 0, -1][i], hall(168, 6), 0.28, 0.8);
	at(15.014, whoosh(1.0, 1500), hall(193, 2), { gain: 0.3 });

	/* 15. One token is chosen: two bars sink, the wheel spins and slows, peg by peg, and lands on "The". */
	at(15.3, 'drawer-in', hall(193, 2), { gain: 0.4, rate: 0.8 });
	for (let k = 1; k <= 120; k++) {
		const f = 1 - Math.pow(1 - k / 120, 1 / 3);
		// Loud while it whirls, fainter as it slows: the flapper hits each peg less hard.
		const speed = Math.pow(1 - f, 2);
		at(15.42 + 0.36 * f, tick(1.1 + speed * 0.4), hall(193, 1), { gain: 0.15 + 0.35 * speed, minor: k % 4 !== 0 });
	}
	at(15.78, chime([0, 2, 4, 7]), hall(193, 1), { gain: 0.45, dip: 0.3 });
	at(15.81, 'latch', hall(193, 1), { gain: 0.5 });
	at(15.897, 'block', hall(200, 0), { gain: 0.55 });

	/* 16. One at a time: twelve thinking tokens, each a low note as it lands. */
	THINKING.forEach((n, i) => {
		const k = i + 1;
		at(16.06 + 0.07 * (k - 0.45), whoosh(0.4, 1800), hall(233, 2), { gain: 0.1, minor: true });
		tone(16.06 + 0.07 * (k - 0.015), n, hall(233, 0), 0.32, 0.9);
	});
	at(16.44, 'servo', hall(233, 1), { gain: 0.35, rate: 0.85 });

	/* 17. A tool call is born: bright notes, the ticket prints, the lamp, and the red stamp. */
	CALL.forEach((n, j) => {
		tone(17.06 + 0.044 * (j + 0.985), n, hall(233, 0), 0.32, 0.8);
		if (j > 0) at(17.06 + 0.044 * j + 0.02, tick(1.5), hall(240, 1), { gain: 0.18, minor: true });
	});
	at(17.72, chime([4, 7, 9]), hall(240, 1), { gain: 0.4 });
	at(17.785, 'stamp', hall(240, 1), { gain: 1, dip: 0.5 });

	/*
	 * 18. Text comes back: the row rides left into the detokenizer, oldest first, and only then do the slips flutter
	 * up the tube, each as the tiles it's made from have gone in: the thinking, then the tool call. The times are
	 * Claude Code's row; the thinking's are the same for all three, and the call's differ by a few hundredths.
	 */
	at(18.289, porcelain(note(4), 1.2), hall(210, 1), { gain: 0.35 });
	at(18.31, 'tube', hall(210, 1), { gain: 0.45 });
	[18.323, 18.3549, 18.3785, 18.3966, 18.4188, 18.4473, 18.4784, 18.5209].forEach((T, i) => at(T, 'paper-slide', hall(210, 3), { gain: 0.25, rate: 1.1 + i * 0.03, minor: true }));
	at(18.88, whoosh(1.4, 2000), hall(210, 6), { gain: 0.4, dip: 0.5 });

	/* 19. The model has no hands: slips rain on the harness, the call card pops up and leaves along the pipe. */
	for (let i = 0; i < 8; i++) at(19.26 + 0.03 * i, 'paper-land', P.harness, { gain: 0.4, rate: 0.95 + i * 0.03, minor: true });
	at(19.3, 'paper-slide', P.harness, { gain: 0.5 });
	at(19.68, whoosh(1.2, 1500), P.harness, { gain: 0.25 });

	/* 20. Intent is not authority: the bad call is refused and binned; the good one passes four gates. */
	at(20.04, 'servo', P.gates, { gain: 0.4, rate: 0.8 });
	at(20.09, 'servo', P.gates, { gain: 0.5 });
	// No: the red light comes on with a short double buzz, bzzt bzzt.
	at(20.2, 'nogo', P.gates, { gain: 0.7, length: 0.16, dip: 0.4 });
	at(20.2, 'nogo', P.gates, { gain: 0.7, length: 0.16, delay: 0.22 });
	at(20.2, 'relay', P.gates, { gain: 0.45, rate: 0.8 });
	at(20.24, 'latch', P.gates, { gain: 0.6, rate: 0.7 });
	at(20.37, 'press', P.gates, { gain: 0.6, rate: 1.2 });
	at(20.4, 'servo', P.gates, { gain: 0.35, rate: 0.85, minor: true });
	[20.516, 20.632, 20.748, 20.864].forEach((T, i) => {
		at(T, 'servo', P.gates, { gain: 0.45, rate: 1 + i * 0.04 });
		tone(T + 0.03, 2 + i, P.gates, 0.38);
	});
	at(20.688, 'latch', P.gates, { gain: 0.4, rate: 1.2 });
	at(20.98, chime([2, 4, 7]), P.gates, { gain: 0.3 });

	/* 21. When the page lies: the docs land, glow red, the process fires, and the fence holds. */
	at(21.2, 'paper-land', P.sandbox, { gain: 0.6 });
	at(21.3, low(note(-7), 1.1), P.sandbox, { gain: 0.4 });
	at(21.34, 'paper-slide', P.sandbox, { gain: 0.5 });
	at(21.52, 'block', P.sandbox, { gain: 0.5, rate: 0.7 });
	at(21.53, 'relay', P.sandbox, { gain: 0.5, rate: 0.85 });
	at(21.6, whoosh(0.5, 2800), P.sandbox, { gain: 0.35 });
	at(21.72, 'stamp', P.sandbox, { gain: 0.8, rate: 1.1, dip: 0.4 });
	at(21.72, porcelain(note(12), 1.8), P.sandbox, { gain: 0.3 });
	at(21.88, 'paper-land', P.sandbox, { gain: 0.45 });

	/* 22. Finding the code: the lens sweeps the shelf, three folders slide out, the file goes to the easel. */
	at(22.0, 'servo', P.sandbox, { gain: 0.4, rate: 0.9 });
	[22.12, 22.267, 22.413].forEach((T) => at(T, 'scanner', P.sandbox, { gain: 0.4, rate: 0.9 }));
	for (let i = 0; i < 3; i++) at(22.2 + i * 0.03, 'drawer-out', P.sandbox, { gain: 0.5, rate: 1.3 });
	at(22.53, 'servo', P.sandbox, { gain: 0.35, rate: 1.1, minor: true });
	at(22.55, 'paper-slide', P.sandbox, { gain: 0.5 });
	at(22.69, 'paper-land', P.sandbox, { gain: 0.55 });

	/* 23. Three ways to edit. */
	at(23.06, 'paper-slide', P.sandbox, { gain: 0.35, minor: true });
	at(23.26, tick(1.3), P.sandbox, { gain: 0.3 });
	at(23.46, 'paper-slide', P.sandbox, { gain: 0.45, rate: 1.1 });
	at(23.7, chime([0, 4, 7]), P.sandbox, { gain: 0.35 });
	at(23.92, 'paper-slide', P.sandbox, { gain: 0.4, rate: 0.9 });
	at(24.0, 'servo', P.sandbox, { gain: 0.45 });
	at(24.07, 'latch', P.sandbox, { gain: 0.5, rate: 0.85 });

	/* 24. Evidence, not opinion: the terminal prints, the test fails, and the result goes back. */
	[24.1766, 24.2331, 24.2897, 24.3463, 24.4029, 24.4594].forEach((T) => {
		for (let k = 0; k < 3; k++) at(T - 0.012 + k * 0.006, key(0.5), P.sandbox, { gain: 0.3, minor: true });
	});
	at(24.4594, low(note(-5), 0.8), P.sandbox, { gain: 0.45 });
	at(24.5, 'paper-slide', P.sandbox, { gain: 0.5 });
	at(24.76, 'paper-slide', P.sandbox, { gain: 0.4, rate: 0.9 });
	at(25.0, 'tube', P.sandbox, { gain: 0.5 });

	/* 25. Around the loop: back up the green pipe and into the Conversation drawer. Turn two. */
	at(25.04, whoosh(2.2, 1300), P.harness, { gain: 0.3 });
	at(25.32, 'drawer-out', P.harness, { gain: 0.8 });
	at(25.43, 'paper-land', P.harness, { gain: 0.5 });
	at(25.38, 'servo', P.easel, { gain: 0.3, rate: 1.2, minor: true });
	at(25.5, 'paper-land', P.easel, { gain: 0.5 });
	at(25.6, 'drawer-in', P.harness, { gain: 0.7 });

	/* 26. When the context fills up: thirty sheets, the gauge rising, the press, and a summary. */
	for (let i = 0; i < 30; i++) at(26.08 + 0.012667 * (i + 1), 'paper-land', P.compaction, { gain: 0.32, rate: 0.9 + i * 0.008, minor: i % 3 !== 0 });
	at(26.08, sweep(note(-5), note(5), 5.5), P.compaction, { gain: 0.5 });
	at(26.48, 'servo', P.compaction, { gain: 0.45, rate: 0.85 });
	at(26.58, 'press', P.compaction, { gain: 1, dip: 0.5 });
	at(26.64, 'servo', P.compaction, { gain: 0.4, rate: 1.05 });
	at(26.72, chime([0, 2, 4]), P.compaction, { gain: 0.35 });

	/* 27. Seven things called memory: seven drawers, six green, one red. */
	for (let i = 0; i < 7; i++) {
		const a = 27.12 + 0.1 * i;
		at(a, 'drawer-out', P.memory, { gain: i === 6 ? 0.35 : 0.75, rate: 1 + i * 0.02 });
		if (i < 6) tone(a + 0.05, i, P.memory, 0.35);
		else at(a + 0.05, low(note(-6), 0.7), P.memory, { gain: 0.4 });
	}

	/* 28. When the answer gets lost: the pipe breaks, the loupe looks, it heals, and four levers. */
	at(28.14, porcelain(note(14), 0.7), P.turns, { gain: 0.3 });
	at(28.14, 'block', P.turns, { gain: 0.35, rate: 1.4 });
	at(28.3, 'servo', P.turns, { gain: 0.35 });
	at(28.5, chime([0, 2, 4]), P.turns, { gain: 0.3 });
	at(28.58, porcelain(note(9), 1.1), P.turns, { gain: 0.3 });
	[28.62, 28.67, 28.72, 28.77].forEach((T, i) => at(T + 0.03, 'latch', P.turns, { gain: 0.6, rate: 0.85 + i * 0.05 }));

	/* 29. The whole fix, in ten turns: a note per turn; the red one low, the last two bright. */
	for (let i = 0; i < 10; i++) tone(29.1 + 0.066 * i + 0.05, TURN_NOTES[i], P.turns, 0.35);
	at(29.47, low(note(-5), 0.6), P.turns, { gain: 0.35 });
	at(29.68, chime([4, 7, 9]), P.turns, { gain: 0.4 });

	/* 30. What finished means: up two steps, a padlock opens, a flag. */
	at(30.29, 'block', P.finish, { gain: 0.6 });
	at(30.29, 'latch', P.finish, { gain: 0.6, rate: 0.9 });
	at(30.54, 'block', P.finish, { gain: 0.6, rate: 1.1 });
	at(30.6, 'paper-slide', P.finish, { gain: 0.4 });

	/* 31. Home: a long flight back, and the laptop shows the result. */
	at(30.86, whoosh(4.5, 1200), P.laptop, { gain: 0.3 });
	at(31.36, chime([0, 2, 4, 7, 9]), P.laptop, { gain: 0.4 });

	/* 32. The whole trip, in one look: everything rises, the glass tube draws itself, the lap plays its nine stops. */
	at(31.99, 'rumble', P.brain, { gain: 0.9, dip: 0.6 });
	[32.1902, 32.2041, 32.2155, 32.2258, 32.2355, 32.245, 32.2545, 32.2642, 32.2745, 32.2859, 32.2998].forEach((T, i) => tone(T, i, P.harness, 0.25, 0.7));
	at(32.33, 'latch', P.brain, { gain: 0.5 });
	[32.34, 32.378, 32.404, 32.488, 32.611, 32.656, 32.722, 32.83, 32.87].forEach((T, i) => tone(T, [0, 2, 4, 5, 7, 9, 7, 5, 4][i], undefined, 0.35, 1.2));
	at(32.9, chime([0, 2, 4, 7, 9, 12]), undefined, { gain: 0.35 });

	return {
		cues,
		// Each place is a soft chord in the story's key, with a breath of its own air far underneath.
		beds: [
			{ sound: 'pad-sky', from: 0, to: 6.95, level: 1, fade: 0.06 },
			{ sound: 'sky', from: 0, to: 7.93, level: 0.12, fade: 0.04 },
			{ sound: 'belt', from: 6.02, to: 7.9, level: 0.28, fade: 0.04 },
			// The model: a dreamier chord with music-box glints, a thinking hum, and its gears.
			{ sound: 'pad-brain', from: 6.9, to: 7.95, level: 1, fade: 0.06 },
			{ sound: 'thinking', from: 6.95, to: 7.95, level: 0.4, fade: 0.06 },
			{ sound: 'gears', from: 6.95, to: 7.95, level: 0.28, fade: 0.06 },
			{ sound: 'pad-cluster', from: 8.0, to: 18.9, level: 1, fade: 0.05 },
			{ sound: 'cluster', from: 8.0, to: 18.9, level: 0.14, fade: 0.05 },
			{ sound: 'belt', from: 8.5, to: 9.56, level: 0.22, fade: 0.04 },
			{ sound: 'belt', from: 14.03, to: 14.12, level: 0.22, fade: 0.02 },
			{ sound: 'belt', from: 18.06, to: 18.64, level: 0.22, fade: 0.04 },
			{ sound: 'pad-sky', from: 19.05, to: 32.1, level: 1, fade: 0.05 },
			// The light goes gold as the camera pulls back to the whole trip, and the chord warms with it.
			{ sound: 'pad-dusk', from: 32.12, to: 34, level: 1, fade: 0.2 },
			{ sound: 'sky', from: 19.05, to: 34, level: 0.12, fade: 0.05 }
		]
	};
}

/* ---------- inside the harness ---------- */

/** One note per station, so a lap round the loop plays a little rising tune. */
const STATION_NOTE = { pack: 0, send: 1, read: 2, check: 3, run: 4, write: 5 } as const;

function insideHarness(): { cues: Cue[]; beds: Bed[] } {
	const cues: Cue[] = [];
	const at = (T: number, sound: Cue['sound'], where?: Where | (() => Where), more: Partial<Cue> = {}) => cues.push({ T, sound, at: where, ...more });

	// The turn: a little motor each time it sets off, and a porcelain note as it arrives at each station.
	const order = ['send', 'read', 'check', 'run', 'write', 'pack'] as const;
	PUCK_MOVES.forEach(({ from, to }, i) => {
		at(from, 'servo', () => puckPoint(from + 0.01), { gain: 0.5, rate: 1 + (i % 3) * 0.04, minor: true });
		const station = to < 2 ? order[i % 6] : undefined;
		if (station) at(to, porcelain(note(STATION_NOTE[station] + 2)), roomPoint(station), { gain: 0.5 });
	});

	// Out to the model and back: air down the orange pipe, then up the green one, on each turn the trip watches.
	for (const card of [1, 3]) {
		const out = card === 1 ? 0.14 : 0.12;
		at(card + out, 'tube', roomPoint('send'), { gain: 0.7 });
		at(card + out + 0.01, whoosh(0.7, 2200), roomPoint('send'), { gain: 0.35 });
		at(card + out + 0.1, whoosh(0.7, 1400), roomPoint('read'), { gain: 0.35 });
		// The reply types itself on Read's screen.
		const typeFrom = card === 1 ? 1.3 : 3.28;
		for (let k = 0; k < 10; k++) at(typeFrom + k * 0.008, tick(1.3), roomPoint('read'), { gain: 0.35, minor: true });
	}

	// The lap's tool: Read comes out of its slot, a pulse runs to your files, and the transcript winds on.
	at(1.64, 'latch', roomPoint('run'), { gain: 0.7 });
	at(1.65, whoosh(0.5, 1600), roomPoint('files'), { gain: 0.25 });
	at(1.8, 'paper-roll', roomPoint('reel'), { gain: 0.5 });

	// Packing: each hatch slides out, its sheet lands in Pack's row, the hatch goes back. Then the skill.
	for (let i = 0; i < 4; i++) {
		const a = 2 + 0.08 + i * 0.12;
		at(a, 'drawer-out', roomPoint('pack', i + 1), { gain: 0.8 });
		at(a + 0.115, 'paper-land', roomPoint('pack'), { gain: 0.7, rate: 1 + i * 0.03 });
		at(a + 0.1, 'drawer-in', roomPoint('pack', i + 1), { gain: 0.6 });
	}
	at(2.6, 'paper-slide', roomPoint('shelf'), { gain: 0.6 });
	at(2.775, 'paper-land', roomPoint('pack'), { gain: 0.8, rate: 1.08 });
	at(2.8, chime([0, 2, 4]), roomPoint('pack'), { gain: 0.45, dip: 0.3 });

	// The gate: the call stands up on the turn, a hook runs, Ask, then Allow, and the arm lifts.
	at(3.31, 'paper-slide', () => puckPoint(3.31), { gain: 0.5, rate: 1.2 });
	at(3.44, whoosh(0.6, 2600), roomPoint('hooks'), { gain: 0.3 });
	at(3.52, porcelain(note(6), 0.6), roomPoint('hooks'), { gain: 0.45 });
	at(3.53, porcelain(note(5), 1.2), roomPoint('check'), { gain: 0.5 });
	at(3.58, porcelain(note(5), 1.2), roomPoint('check'), { gain: 0.4 });
	at(3.63, chime([2, 4, 7]), roomPoint('check'), { gain: 0.5, dip: 0.35 });
	at(3.645, 'servo', roomPoint('check'), { gain: 0.7, rate: 0.9 });
	at(3.88, 'servo', roomPoint('check'), { gain: 0.5, rate: 0.95 });

	// Run, then written down: the call goes in, Edit comes out, the tape winds, pages pile up and get pressed.
	at(4.11, 'paper-slide', roomPoint('run'), { gain: 0.5, rate: 0.9 });
	at(4.12, 'latch', roomPoint('run'), { gain: 0.8 });
	at(4.14, whoosh(0.5, 1600), roomPoint('files'), { gain: 0.25 });
	for (let i = 0; i < 5; i++) at(4.32 + i * 0.05 + 0.035, 'paper-land', roomPoint('write'), { gain: 0.5, rate: 0.96 + i * 0.03, minor: true });
	at(4.6, 'press', roomPoint('write'), { gain: 0.9, dip: 0.4 });
	at(4.69, chime([4, 2, 0]), roomPoint('write'), { gain: 0.35 });
	at(4.72, 'servo', roomPoint('write'), { gain: 0.45, rate: 1.1 });

	// The subagent: a quick next turn, the Agent tool, a brief down the line, its own laps, and a report back.
	at(5.02, 'servo', () => puckPoint(5.05), { gain: 0.6, rate: 1.15 });
	at(5.2, 'latch', roomPoint('run'), { gain: 0.8 });
	at(5.24, whoosh(0.7, 2000), roomPoint('sub'), { gain: 0.3 });
	at(5.33, 'paper-slide', roomPoint('sub'), { gain: 0.5 });
	for (const k of [5.38, 5.5]) at(k, 'servo', roomPoint('sub'), { gain: 0.35, rate: 1.35 });
	at(5.46, whoosh(0.6, 1500), roomPoint('files'), { gain: 0.22 });
	at(5.63, 'paper-slide', roomPoint('sub'), { gain: 0.5, rate: 1.1 });
	at(5.7, whoosh(0.7, 1500), roomPoint('run'), { gain: 0.3 });
	at(5.79, 'paper-land', roomPoint('run'), { gain: 0.7 });
	at(5.82, chime([0, 4, 7]), roomPoint('run'), { gain: 0.4 });
	at(5.86, 'latch', roomPoint('run'), { gain: 0.6, rate: 0.95 });

	return {
		cues,
		beds: [
			{ sound: 'pad-room', from: 0, to: 6.1, level: 1, fade: 0.05 },
			{ sound: 'room', from: 0, to: 6.1, level: 0.18, fade: 0.05 },
			// The transcript winding onto its reel, for as long as it winds.
			{ sound: 'reel', from: 4.3, to: 4.9, level: 0.35, fade: 0.04 }
		]
	};
}

/* ---------- how MCP connects ---------- */

/** The harness and the server on the first island, in the story's coordinates. */
const HARNESS: Where = [1.1, 1.6, -0.65];
const SERVER: Where = [7.2, 0.8, -0.72];

function howMcpConnects(): { cues: Cue[]; beds: Bed[] } {
	const cues: Cue[] = [];
	const at = (T: number, sound: Cue['sound'], where?: Where, more: Partial<Cue> = {}) => cues.push({ T, sound, at: where, ...more });
	const small = { rate: 1.3, gain: 0.6 };
	// A message down the cable: air one way or the other.
	const along = (T: number, toServer: boolean, high = 1800) => at(T, whoosh(0.8, high), toServer ? SERVER : HARNESS, { gain: 0.28 });

	// Hello: the harness wakes, says hello, the server answers and its lamp goes green.
	at(0.08, 'servo', HARNESS, { gain: 0.35, rate: 0.9 });
	along(0.3, true);
	at(0.47, 'block', SERVER, { gain: 0.5 });
	at(0.54, chime([0, 4]), SERVER, { gain: 0.4 });
	along(0.56, false);
	at(0.73, 'block', HARNESS, { gain: 0.4, rate: 0.9 });

	// What do you offer: the list comes out of the server's Tools drawer and goes into the harness's.
	along(1.04, true);
	at(1.2, 'drawer-out', SERVER, small);
	at(1.29, 'paper-slide', SERVER, { gain: 0.5, rate: 1.2 });
	at(1.46, 'tube', SERVER, { gain: 0.5, rate: 1.1 });
	at(1.54, 'drawer-in', SERVER, small);
	along(1.58, false, 2200);
	at(1.7, 'drawer-out', HARNESS, { gain: 0.8 });
	at(1.77, 'paper-land', HARNESS, { gain: 0.6 });
	at(2.0, 'paper-slide', HARNESS, { gain: 0.4, rate: 0.9 });
	at(2.06, 'drawer-in', HARNESS, { gain: 0.7 });

	// A call: down the cable, into the server's drawer, and the server gets to work.
	along(2.22, true, 2400);
	at(2.4, 'drawer-out', SERVER, small);
	at(2.49, 'paper-slide', SERVER, { gain: 0.5, rate: 1.2 });
	for (const k of [2.64, 2.82, 3.0]) at(k, 'relay', SERVER, { gain: 0.35, minor: true });

	// The answer: up it stands, back down the cable, into the harness's Conversation drawer.
	at(3.04, 'paper-slide', SERVER, { gain: 0.35, rate: 0.85 });
	at(3.13, 'paper-slide', SERVER, { gain: 0.5, rate: 1.2 });
	at(3.16, chime([2, 4, 7]), SERVER, { gain: 0.4, dip: 0.3 });
	at(3.3, 'tube', SERVER, { gain: 0.5, rate: 1.1 });
	at(3.4, 'drawer-in', SERVER, small);
	along(3.42, false, 1500);
	at(3.58, 'drawer-out', HARNESS, { gain: 0.8 });
	at(3.65, 'paper-land', HARNESS, { gain: 0.6 });
	at(4.0, 'paper-slide', HARNESS, { gain: 0.4, rate: 0.9 });
	at(4.06, 'drawer-in', HARNESS, { gain: 0.7 });

	// Three drawers: tools, resources, prompts, one after another.
	[0.12, 0.42, 0.7].forEach((a, i) => {
		at(4 + a, 'drawer-out', SERVER, { ...small, rate: 1.3 - i * 0.06 });
		at(4 + a + 0.07, porcelain(note(i * 2 + 2)), SERVER, { gain: 0.45 });
		if (i < 2) at(4 + a + 0.26, 'drawer-in', SERVER, small);
	});
	return { cues, beds: [] };
}

/* ---------- permission and the sandbox ---------- */

/** A point on the trip's stage, in its own coordinates. */
const onStage = (x: number, y: number, z: number): Where => [STAGE_AT.x + x, STAGE_AT.y + y, STAGE_AT.z + z];
const STAGE = {
	harness: onStage(-10, 1.4, -1.8),
	deny: onStage(-7.8, 1.6, 1.5),
	ask: onStage(-5.6, 1.6, 1.5),
	allow: onStage(-3.4, 1.6, 1.5),
	you: onStage(-4.5, 1.0, 3.0),
	dial: onStage(-11.2, 1.5, 3.2),
	slot: onStage(-0.6, 0.8, 1.5),
	procs: onStage(4.3, 0.8, 0.8),
	project: onStage(2.8, 0.4, -2.0),
	wall: onStage(9.6, 1.4, 0),
	proxy: onStage(7.4, 1.4, -3.6),
	outside: onStage(-6.3, 0.8, 4.6)
} satisfies Record<string, Where>;

function permissionAndSandbox(): { cues: Cue[]; beds: Bed[] } {
	const cues: Cue[] = [];
	const at = (T: number, sound: Cue['sound'], where?: Where, more: Partial<Cue> = {}) => cues.push({ T, sound, at: where, ...more });

	// Three calls down the rail, one at a time. The first stops at Deny with a buzz and is sent back. The second is let
	// past Deny, a soft tick as it's read, stops at Ask, and hops onto your desk, which chimes. The third is read twice and
	// matched at Allow, and slides on into the glass.
	at(1.06, 'servo', STAGE.harness, { gain: 0.5 });
	at(1.18, 'nogo', STAGE.deny, { gain: 0.6, length: 0.16, dip: 0.3 });
	at(1.19, 'relay', STAGE.deny, { gain: 0.4, rate: 0.85 });
	at(1.21, 'pop', STAGE.deny, { gain: 0.35, rate: 1.1 });
	at(1.26, 'servo', STAGE.deny, { gain: 0.4, rate: 0.9 });
	at(1.36, 'drawer-in', STAGE.harness, { gain: 0.5 });
	at(1.4, 'servo', STAGE.harness, { gain: 0.45, rate: 1.05 });
	at(1.45, tick(1.1), STAGE.deny, { gain: 0.45 });
	at(1.5, 'relay', STAGE.ask, { gain: 0.35, rate: 1.1 });
	at(1.53, whoosh(0.35, 2600), STAGE.ask, { gain: 0.2, minor: true });
	at(1.61, 'paper-land', STAGE.you, { gain: 0.5 });
	at(1.61, chime([4, 7]), STAGE.you, { gain: 0.4, dip: 0.25 });
	at(1.62, 'servo', STAGE.harness, { gain: 0.45, rate: 1.1 });
	at(1.68, tick(1.1), STAGE.deny, { gain: 0.4 });
	at(1.73, tick(1.25), STAGE.ask, { gain: 0.4 });
	at(1.78, chime([0, 4, 7]), STAGE.allow, { gain: 0.4 });
	at(1.82, whoosh(0.5, 2400), STAGE.slot, { gain: 0.3 });

	// The dial clicks round, notch by notch, and back.
	[2.32, 2.52, 2.74].forEach((T, i) => {
		at(T, 'peg', STAGE.dial, { gain: 0.6, rate: 1 + i * 0.06 });
		at(T + 0.01, porcelain(note(4 + i * 2), 0.8), STAGE.dial, { gain: 0.3 });
	});
	at(3.0, 'servo', STAGE.dial, { gain: 0.35, rate: 1.2, minor: true });

	// Inside the glass: three processes pop into being, one after another, rising in pitch.
	[3.09, 3.21, 3.33].forEach((T, i) => {
		at(T, 'pop', STAGE.procs, { gain: 0.5, rate: 0.9 + i * 0.12 });
		at(T + 0.005, porcelain(note(5 + i * 2)), STAGE.procs, { gain: 0.35 });
	});
	// A note lands in the project, fine. Another flies at the glass and knocks against it.
	at(3.47, whoosh(0.4, 2600), STAGE.procs, { gain: 0.22, minor: true });
	at(3.575, 'paper-land', STAGE.project, { gain: 0.5 });
	at(3.58, porcelain(note(9)), STAGE.project, { gain: 0.3 });
	at(3.61, whoosh(0.35, 3000), STAGE.procs, { gain: 0.22, minor: true });
	at(3.7, 'clonk', STAGE.wall, { gain: 0.6, rate: 1.35, dip: 0.3 });
	at(3.7, low(note(-5), 0.9), STAGE.wall, { gain: 0.3 });
	// The network: one packet through the proxy, one turned back with a short buzz.
	at(3.81, whoosh(0.4, 1800), STAGE.proxy, { gain: 0.22, minor: true });
	at(3.86, chime([7, 9]), STAGE.proxy, { gain: 0.3 });
	at(3.91, whoosh(0.35, 1800), STAGE.proxy, { gain: 0.22, minor: true });
	at(3.95, 'nogo', STAGE.proxy, { gain: 0.45, length: 0.12 });

	// What stands outside the glass rises up, thing by thing.
	[4.17, 4.27, 4.37].forEach((T, i) => at(T, 'stomp', STAGE.outside, { gain: 0.45, rate: 1 + i * 0.05 }));
	at(4.47, 'pop', STAGE.outside, { gain: 0.35 });

	// The glass says no, and the question flies over the wall to you.
	at(5.07, whoosh(0.4, 1800), STAGE.proxy, { gain: 0.22, minor: true });
	at(5.15, 'nogo', STAGE.proxy, { gain: 0.5, length: 0.14 });
	at(5.27, 'swoosh', STAGE.procs, { gain: 0.35 });
	at(5.5, 'paper-land', STAGE.you, { gain: 0.55 });
	at(5.51, chime([4, 7, 9]), STAGE.you, { gain: 0.4, dip: 0.3 });

	return {
		cues,
		beds: [
			{ sound: 'pad-sky', from: 0, to: 6.1, level: 1, fade: 0.05 },
			{ sound: 'sky', from: 0, to: 6.1, level: 0.12, fade: 0.05 }
		]
	};
}

/* ---------- memory, forks and rewinding ---------- */

const onMemory = (x: number, y: number, z: number): Where => [MEMORY_AT.x + x, MEMORY_AT.y + y, MEMORY_AT.z + z];
const MEM = {
	yesterday: onMemory(-11.4, 0.5, -0.2),
	today: onMemory(4.9, 0.5, -0.2),
	fork: onMemory(4.9, 0.5, 1.9),
	shelf: onMemory(-2.9, 0.6, -3.3),
	files: onMemory(-0.8, 0.4, 3.2),
	host: onMemory(11.8, 1.4, -3.2)
} satisfies Record<string, Where>;

function memoryAndRewinding(): { cues: Cue[]; beds: Bed[] } {
	const cues: Cue[] = [];
	const at = (T: number, sound: Cue['sound'], where?: Where, more: Partial<Cue> = {}) => cues.push({ T, sound, at: where, ...more });
	/** A page standing up on a rail: a soft card sound and a note that climbs with the conversation. */
	const pageUp = (T: number, i: number, where: Where) => {
		at(T, 'paper-slide', where, { gain: 0.35, rate: 1.05 + i * 0.03, minor: true });
		at(T + 0.004, porcelain(note(i)), where, { gain: 0.28 });
	};

	// Yesterday, one message at a time; then the session ends and its pages lie down.
	for (let i = 0; i < 5; i++) pageUp(0.06 + i * 0.08 + 0.03, i, MEM.yesterday);
	for (let i = 0; i < 4; i++) at(0.49 + i * 0.015, 'paper-land', MEM.yesterday, { gain: 0.3, rate: 0.9 + i * 0.05, minor: true });
	at(0.5, low(note(-3), 0.9), MEM.yesterday, { gain: 0.25 });
	// Today begins with only your rules.
	pageUp(0.75, 0, MEM.today);

	// A note leaves yesterday for the shelf; the index and one note go into today's request; today goes on.
	at(1.08, whoosh(0.5, 2400), MEM.yesterday, { gain: 0.25 });
	at(1.2, 'paper-land', MEM.shelf, { gain: 0.5 });
	at(1.2, chime([4, 7]), MEM.shelf, { gain: 0.35 });
	at(1.36, whoosh(0.45, 2600), MEM.shelf, { gain: 0.2, minor: true });
	at(1.46, whoosh(0.45, 2600), MEM.shelf, { gain: 0.2, minor: true });
	pageUp(1.69, 1, MEM.today);
	pageUp(1.79, 2, MEM.today);

	// Today's work: the file copied aside first, then the push flies to the host, then the change that breaks a test.
	at(2.05, 'paper-slide', MEM.files, { gain: 0.45, rate: 0.9 });
	at(2.14, 'paper-land', MEM.files, { gain: 0.4 });
	pageUp(2.19, 3, MEM.today);
	at(2.24, 'swoosh', MEM.today, { gain: 0.35 });
	at(2.34, 'clonk', MEM.host, { gain: 0.5, rate: 1.2 });
	at(2.35, chime([0, 4, 7]), MEM.host, { gain: 0.3 });
	pageUp(2.35, 4, MEM.today);
	at(2.41, 'flap', MEM.files, { gain: 0.45 });
	pageUp(2.53, 5, MEM.today);
	at(2.56, 'nogo', MEM.today, { gain: 0.3, length: 0.12 });

	// The fork: a rail slides out, three pages copy down to it, and it goes its own way.
	at(3.06, 'servo', MEM.fork, { gain: 0.45 });
	for (let i = 0; i < 3; i++) at(3.2 + i * 0.06, 'paper-land', MEM.fork, { gain: 0.4, rate: 1 + i * 0.05 });
	for (let i = 3; i < 6; i++) pageUp(3 + 0.5 + (i - 3) * 0.1 + 0.03, i + 2, MEM.fork);

	// The rewind: today's later pages lie back down, the checkpoint slides home, the file flips back.
	at(4.16, 'paper-roll', MEM.today, { gain: 0.45, rate: 1.3 });
	for (let i = 0; i < 3; i++) at(4.2 + i * 0.03, 'paper-land', MEM.today, { gain: 0.3, rate: 1.2 - i * 0.06, minor: true });
	at(4.32, 'paper-slide', MEM.files, { gain: 0.45 });
	at(4.42, 'flap', MEM.files, { gain: 0.45 });
	at(4.44, chime([7, 4, 0]), MEM.files, { gain: 0.3 });

	// What it can't reach: the host lights red, twice, and keeps the commit.
	at(5.12, 'pop', MEM.host, { gain: 0.35 });
	at(5.3, 'nogo', MEM.host, { gain: 0.4, length: 0.12 });
	at(5.34, low(note(-5), 0.8), MEM.host, { gain: 0.25 });

	return {
		cues,
		beds: [
			{ sound: 'pad-sky', from: 0, to: 6.1, level: 1, fade: 0.05 },
			{ sound: 'sky', from: 0, to: 6.1, level: 0.12, fade: 0.05 }
		]
	};
}

export function tripScore(id: TrackId, w: World): { cues: Cue[]; beds: Bed[] } {
	void w;
	if (id === 'harness') return insideHarness();
	if (id === 'sandbox') return permissionAndSandbox();
	if (id === 'memory') return memoryAndRewinding();
	return howMcpConnects();
}
