import { BENCH, BENCHES, GATE, LAYERS, PAD, RAIL, railPath, TRAY } from './layout';
import { KEPT, SLOTS, STANDING, type TileKind } from './tiles';

/*
 * The side trip's script, turn by turn: when the copy goes up, when each tile of the reply comes down, what the gate
 * says to each call, where the cart goes, and when each result is tipped into the tray. Trip time t runs 0 to 6; card n
 * is t in [n - 1, n], and each card plays from a little before its start (0.848 after the last one's) to its stop.
 *
 * Everything that moves in the room reads this, and so do the tray, the sound and your screen, so they can never
 * disagree: a tile is in the tray from the moment it lands in its slot, and not before.
 */

/* ---------- where things go ---------- */

/** Where the first slot starts, and how far apart the slots are, so SLOTS of them reach the end stop. */
export const SLOT_X0 = TRAY.x0 + 0.16;
export const PITCH = (TRAY.x1 - 0.06 - SLOT_X0) / SLOTS;
/** A slot's middle along the tray. */
export const slotX = (slot: number) => SLOT_X0 + (slot + 0.5) * PITCH;
/** A tile: a little narrower than its slot, standing as tall as the tray's rims, and as deep as the tray inside them. */
export const TILE = { w: PITCH * 0.82, h: 0.26, d: 0.56 };
/** Where tiles from the left get on the lip, just past the pad: from here they ride to the open end. */
export const LIP_X0 = PAD.x1 - 0.25;
/** Your prompt comes round the front of the gate and gets on the lip past it, clear of the gate's legs. */
export const PROMPT_LIP_X = GATE.x1 + 0.5;

/** The cart's rail, and how far along it each stop is, in room units from the gate. */
export const RAIL_PATH = railPath();
export const RAIL_LEN = RAIL_PATH.getLength();
const SAMPLES = RAIL_PATH.getSpacedPoints(2000);
function nearest(x: number, z: number) {
	let best = 0;
	let d = Infinity;
	SAMPLES.forEach((q, i) => {
		const e = (q.x - x) ** 2 + (q.z - z) ** 2;
		if (e < d) [d, best] = [e, i];
	});
	return (best / (SAMPLES.length - 1)) * RAIL_LEN;
}
/** Along the rail's first leg, in front of the tray: how far from the gate a point level with x is. */
export const alongX = (x: number) => nearest(x, RAIL.z);
/** Where the cart stops at the subagent's door: its own length short of the rail's end. */
export const SUB_STOP = RAIL_LEN - 0.48;
/** Where the cart stops to post a card into each bench. */
export const BENCH_AT = BENCHES.map((b) => nearest(BENCH.x0, b.z));

/* ---------- what happens ---------- */

export type Verdict = 'allow' | 'ask' | 'deny';
/** Where a call is run: on one of the three benches, by the harness itself from the skill shelf, or by a subagent. */
export type Where = 0 | 1 | 2 | 'skill' | 'sub';
export type Call = { tool: string; arg: string; where: Where; verdict: Verdict; results: number; span?: number; said?: string };
type Spec = { at?: number; pace: number; words: string[]; calls: Call[]; stay?: boolean };

/** A tile of the reply: down the chute's shaft, out of its foot and down the slide to the pad, then along the lip. */
export type Fall = { kind: 'text' | 'call'; slot: number; fall: number; foot: number; pad: number; lip: number; born: number; pace: number };
/** A tile that comes along the lip from the left on its own: your prompt from your screen, or the gate's "no". */
export type Ride = { kind: 'prompt' | 'refusal'; slot: number; from: number; lip: number; wait: number; swing: number; born: number; pace: number };
/** A result: out of a bench's slot, down from the shelf or out of the subagent; onto the cart; tipped in. */
export type Result = { slot: number; span: number; ready: number; aboard: number; tip: number; born: number; place: number; pace: number };
export type CardRun = {
	call: Call;
	turn: number;
	j: number;
	n: number;
	/** Pops up out of the pad as the call goes by, and hops through the gate's back onto the cart. */
	printed: number;
	aboard: number;
	/** The hook runs, then the rules: a ring and your answer if it has to ask you. */
	check: number;
	hooked: number;
	ring?: number;
	answer?: number;
	verdict: number;
	settled: number;
	/** Refused: thrown back out onto the pad, where it turns into the "no". */
	out?: number;
	refusal?: Ride;
	/** Where the cart stops for it, and when it goes in: into a bench's slot, up to the shelf, or through the door. */
	stop?: number;
	into?: number;
	results: Result[];
	pace: number;
};
export type Send = { out: number; dock: number; loaded: number; home: number; gone: number; down: number; rest: number; copy: number; pace: number };
/** A bench at work: the call goes out along its wire to the real thing, and the answer comes back. */
export type Run = { bench: number; from: number; to: number; pace: number };
export type Turn = { send: Send; falls: Fall[]; cards: CardRun[]; runs: Run[]; tip: [number, number] | null; end: number; pace: number };
/** One of the subagent's rooms at work: its brief arrives, its own loop goes round, its report leaves. */
export type Nest = {
	layer: number;
	brief: number;
	send: [number, number];
	reply: number;
	gate: number;
	out: [number, number];
	run: [number, number];
	back: [number, number];
	result: number;
	report: number;
	done: number;
};
type Add = { at: number; kinds: TileKind[]; span?: number };

/** How long each step takes at a turn's own pace 1, in trip time (0.01 is about a twelfth of a second). */
export const D = {
	out: 0.045,
	load: 0.032,
	back: 0.04,
	up: 0.03,
	drop: 0.05,
	think: 0.04,
	fall: 0.028,
	gap: 0.014,
	slide: 0.03,
	step: 0.012,
	swing: 0.026,
	print: 0.014,
	hop: 0.026,
	hook: 0.028,
	verdict: 0.024,
	ask: 0.1,
	answer: 0.034,
	deny: 0.032,
	slot: 0.022,
	pulse: 0.03,
	work: 0.016,
	rise: 0.022,
	take: 0.018,
	tip: 0.034,
	shelf: 0.05,
	type: 0.0042,
	emerge: 0.05
};
/** Room units per unit of trip time: along the lip, and the cart, with the most the eye can follow. */
const SPEED = { lip: 85, lipMax: 230, cart: 95, cartMax: 230 };

const ADDS_: Add[] = [];
const TURNS_: Turn[] = [];
const RIDES_: Ride[] = [];
const CART_: [number, number][] = [[0, 0]];
const TILTS_: [number, number][] = [];
const LOG_: { at: number; line: string }[] = [];
const TYPED_: { from: number; to: number; text: string }[] = [];
const ASKS_: { from: number; answer: number; to: number; question: string }[] = [];
const NESTS_: Nest[] = [];
let used = STANDING;
let cartS = 0;
let cartFree = 0;

const ride = (dist: number, pace: number) => dist / Math.min(SPEED.lip / pace, SPEED.lipMax);
function land(at: number, kind: TileKind, span = 1) {
	const slot = used;
	used += span;
	ADDS_.push({ at, kinds: [kind], span });
	return slot;
}
/** The cart drives to s along the rail, as soon as it's free, and is there at the time this returns. */
function drive(from: number, s: number, pace: number) {
	from = Math.max(from, cartFree);
	const d = Math.abs(s - cartS);
	if (d < 0.01) return from;
	const to = from + d / Math.min(SPEED.cart / pace, SPEED.cartMax) + 0.012 * Math.min(1, pace * 1.5);
	CART_.push([from, cartS], [to, s]);
	cartS = s;
	cartFree = to;
	return to;
}

/** You type on your screen; the prompt comes out of it and along the lip into the tray. */
function prompt(at: number, text: string) {
	const to = at + text.length * D.type;
	TYPED_.push({ from: at, to, text: '> ' + text });
	const from = to + 0.03;
	const lip = from + D.emerge;
	const slot = used;
	const wait = lip + ride(slotX(slot) - PROMPT_LIP_X, 1);
	const born = wait + D.swing;
	land(born, 'prompt');
	RIDES_.push({ kind: 'prompt', slot, from, lip, wait, swing: wait, born, pace: 1 });
	return born;
}

/** The subagent's rooms, one inside the next: each runs its own small loop, and only its report comes out. */
function nest(at: number, layer = 1): number {
	// The smaller the room, the quicker its loop.
	const k = [1, 0.85, 0.75][layer - 1];
	const n: Nest = { layer, brief: at, send: [0, 0], reply: 0, gate: 0, out: [0, 0], run: [0, 0], back: [0, 0], result: 0, report: 0, done: 0 };
	n.send = [at + 0.008 * k, at + 0.032 * k];
	n.reply = n.send[1] + 0.016 * k;
	n.gate = n.reply + 0.01 * k;
	n.out = [n.gate + 0.004, n.gate + 0.004 + 0.028 * k];
	if (layer < LAYERS) {
		const done = nest(n.out[1] + 0.004, layer + 1);
		n.run = [n.out[1], done];
	} else n.run = [n.out[1], n.out[1] + 0.022];
	n.back = [n.run[1] + 0.003, n.run[1] + 0.003 + 0.026 * k];
	n.result = n.back[1] + 0.005;
	n.report = n.result + 0.01 * k;
	n.done = n.report + 0.008 * k;
	NESTS_.push(n);
	return n.done;
}

function turn(spec: Spec) {
	const p = spec.pace;
	const index = TURNS_.length;
	let t = spec.at ?? (TURNS_.at(-1)?.end ?? 0) + 0.02 * p;
	// The copy: out of the tube's foot to the press, loaded with the tray as it stands, back, and up.
	const send: Send = { pace: p, copy: used, out: t, dock: (t += D.out * p), loaded: (t += D.load * p), home: (t += D.back * p), gone: (t += D.up * p), down: 0, rest: 0 };
	t += D.think * p;
	// The reply: words first, then calls, one tile each, down the chute and along the lip to the open end.
	const kinds = [...spec.words.map(() => 'text' as const), ...spec.calls.map(() => 'call' as const)];
	const falls: Fall[] = kinds.map((kind, i) => {
		const fall = t + i * D.gap * p;
		const foot = fall + D.fall * p;
		const pad = foot + D.slide * p;
		const lip = pad + D.step * p;
		const born = lip + ride(slotX(used) - LIP_X0, p) + D.swing * p;
		return { kind, slot: land(born, kind), fall, foot, pad, lip, born, pace: p };
	});
	// The empty capsule comes back down as the reply begins: the model kept nothing.
	send.down = falls[0].fall;
	send.rest = send.down + D.drop * p;
	spec.words.forEach((line, i) => LOG_.push({ at: falls[i].pad, line }));

	// Each call becomes a card on the pad, and hops through the gate's back onto the cart.
	const calls = falls.filter((f) => f.kind === 'call');
	const cards: CardRun[] = [];
	let boarded = cartFree;
	spec.calls.forEach((call, j) => {
		const printed = calls[j].pad + 0.006 * p;
		const aboard = Math.max(printed + D.print * p, boarded) + D.hop * p;
		boarded = aboard - D.hop * p * 0.5;
		LOG_.push({ at: printed, line: `● ${call.tool}(${call.arg})` });
		cards.push({ call, turn: index, j, n: spec.calls.length, printed, aboard, check: 0, hooked: 0, verdict: 0, settled: 0, results: [], pace: p });
	});
	// The gate checks them one by one: your hook first, then your rules; it rings for you if it has to ask.
	let c = (cards.at(-1)?.aboard ?? t) + 0.006;
	for (const card of cards) {
		card.check = c;
		c += D.hook * p;
		card.hooked = c;
		if (card.call.verdict === 'ask') {
			// Asking you takes as long as it takes, however quick the turn.
			card.ring = c;
			c += D.ask * Math.max(p, 0.9);
			card.answer = c;
			c += D.answer * Math.max(p, 0.9);
			ASKS_.push({ from: card.ring, answer: card.answer, to: c, question: `Allow ${card.call.tool}(${card.call.arg})?` });
		}
		card.verdict = c;
		c += D.verdict * p;
		card.settled = c;
		if (card.call.verdict === 'deny') {
			card.out = c;
			c += D.deny * p;
			LOG_.push({ at: card.verdict, line: '  ⎿ denied by your rules' });
		}
	}
	let tt = c;
	const runs: Run[] = [];
	const passed = cards.filter((k) => k.call.verdict !== 'deny');

	// To the benches, nearest first; each card is posted and the cart moves on while the bench works. Then back,
	// taking each bench's results aboard on the way.
	const toBench = passed.filter((k) => typeof k.call.where === 'number');
	if (toBench.length) {
		const stops = [...new Set(toBench.map((k) => k.call.where as number))].sort((a, b) => BENCH_AT[a] - BENCH_AT[b]);
		const ready = new Map<number, number>();
		for (const b of stops) {
			tt = drive(tt, BENCH_AT[b], p);
			const here = toBench.filter((k) => k.call.where === b);
			here.forEach((k, i) => {
				k.stop = BENCH_AT[b];
				k.into = tt + i * D.slot * p * 0.6;
			});
			const from = tt + (here.length - 1) * D.slot * p * 0.6 + D.slot * p;
			const to = from + (2 * D.pulse + D.work) * p * (1 + (here.length - 1) * 0.3);
			runs.push({ bench: b, from, to, pace: p });
			ready.set(b, to + D.rise * p);
			tt = from;
		}
		for (const b of [...stops].reverse()) {
			tt = Math.max(drive(tt, BENCH_AT[b], p), ready.get(b)!);
			for (const k of toBench.filter((k) => k.call.where === b))
				for (let r = 0; r < k.call.results; r++)
					k.results.push({ slot: 0, span: 1, ready: ready.get(b)!, aboard: tt + D.take * p, tip: 0, born: 0, place: 0, pace: p });
			tt += D.take * p;
		}
	}
	// A skill: the card goes up to the shelf, and a copy of the skill comes down onto the cart, in three tiles.
	const skill = passed.find((k) => k.call.where === 'skill');
	if (skill) {
		tt = drive(tt, alongX(slotX(used + 1)), p);
		skill.stop = cartS;
		skill.into = tt;
		const down = tt + D.shelf * p;
		const landed = down + D.shelf * p * 1.2;
		for (let r = 0; r < skill.call.results; r++) skill.results.push({ slot: 0, span: 1, ready: down, aboard: landed + D.rise * p, tip: 0, born: 0, place: 0, pace: p });
		tt = landed + D.rise * p;
	}
	// A subagent: the brief goes through its door; its rooms do their work; only the report comes out.
	const sub = passed.find((k) => k.call.where === 'sub');
	if (sub) {
		// It stops short of the door, which is a small room's door, too narrow for it.
		tt = drive(tt, SUB_STOP, p);
		sub.stop = SUB_STOP;
		sub.into = tt;
		const done = nest(tt + D.hop * p);
		sub.results.push({ slot: 0, span: sub.call.span ?? 1, ready: done, aboard: done + D.take * p, tip: 0, born: 0, place: 0, pace: p });
		tt = done + D.take * p;
	}

	// Back to the open end, and every result tipped in, in the order the calls were made; then any "no" after them.
	const results = cards.flatMap((k) => k.results);
	results.forEach((r, i) => (r.place = i));
	let tip: [number, number] | null = null;
	let end = falls.at(-1)!.born;
	if (results.length) {
		const width = results.reduce((s, r) => s + r.span, 0);
		tt = drive(tt, alongX(SLOT_X0 + (used + width / 2) * PITCH), p);
		tip = [tt, tt + D.tip * p];
		TILTS_.push(tip);
		results.forEach((r, i) => {
			r.tip = tt + i * D.tip * p * 0.18;
			r.born = r.tip + D.tip * p * 0.7;
			r.slot = land(r.born, 'result', r.span);
			end = r.born;
		});
		cards.forEach((k) => k.call.said && LOG_.push({ at: k.results.at(-1)?.born ?? end, line: `  ⎿ ${k.call.said}` }));
		tt += D.tip * p;
		cartFree = tt;
	}
	for (const k of cards.filter((k) => k.out !== undefined)) {
		const from = k.out! + D.deny * p;
		const lip = from + D.step * p;
		const slot = used;
		const wait = lip + ride(slotX(slot) - LIP_X0, p);
		const swing = Math.max(wait, end + 0.004);
		const born = swing + D.swing * p;
		land(born, 'refusal');
		k.refusal = { kind: 'refusal', slot, from, lip, wait, swing, born, pace: p };
		RIDES_.push(k.refusal);
		end = born;
	}
	if (!spec.stay) drive(tt, 0, p);
	TURNS_.push({ send, falls, cards, runs, tip, end, pace: p });
}

/* ---------- the trip ---------- */

/** Card 1: you ask. */
export const PROMPT_AT = 0.3;
prompt(PROMPT_AT, 'fix the flaky scheduler test');

/** Card 2: one slow turn, one quicker, and a reply that asks for nothing: the loop stops. */
turn({ at: 0.86, pace: 0.66, words: ['I’ll read the scheduler first.'], calls: [{ tool: 'Read', arg: 'scheduler.py', where: 0, verdict: 'allow', results: 2, said: 'Read 212 lines' }] });
turn({ pace: 0.38, words: ['Now the test, twenty times.'], calls: [{ tool: 'Bash', arg: 'pytest -q --count 20', where: 1, verdict: 'allow', results: 1, said: '3 failed, 17 passed' }] });
turn({ pace: 0.38, words: ['Found it: one lock, taken twice.', 'Shall I fix it?'], calls: [] });

/** Card 3: you answer, the request is packed again, and the model asks for a skill. */
const yes = prompt(1.93, 'yes, fix it');
turn({ at: yes + 0.02, pace: 1, words: ['I’ll follow the debugging skill.'], calls: [{ tool: 'Skill', arg: 'debugging', where: 'skill', verdict: 'allow', results: 3, said: 'Loaded debugging' }] });

/** Card 4: three calls at the gate: one allowed, one that asks you, one refused. */
turn({
	at: 2.9,
	pace: 0.75,
	words: ['First, three things to look at.'],
	calls: [
		{ tool: 'Read', arg: 'test_scheduler.py', where: 0, verdict: 'allow', results: 1, said: 'Read 88 lines' },
		{ tool: 'Bash', arg: 'rm -rf .pytest_cache', where: 1, verdict: 'ask', results: 1, said: 'Removed' },
		{ tool: 'Read', arg: '.env', where: 0, verdict: 'deny', results: 0 }
	]
});

/** Card 5: a long session, sped up, until the tray is full; the press; the files touched last read in again. */
turn({
	at: 3.92,
	pace: 0.22,
	words: ['The lock is taken in two places.'],
	calls: [
		{ tool: 'Read', arg: 'lock.py', where: 0, verdict: 'allow', results: 2 },
		{ tool: 'Bash', arg: 'pytest -q', where: 1, verdict: 'allow', results: 3 },
		{ tool: 'github', arg: 'get_issue 412', where: 2, verdict: 'allow', results: 3 }
	]
});
turn({
	pace: 0.22,
	stay: true,
	words: ['Taking it once, at the top.'],
	calls: [
		{ tool: 'Edit', arg: 'scheduler.py', where: 0, verdict: 'allow', results: 3 },
		{ tool: 'Bash', arg: 'pytest -q', where: 1, verdict: 'allow', results: 3 },
		{ tool: 'Bash', arg: 'git diff', where: 1, verdict: 'allow', results: 3 }
	]
});
/** The tray is full: everything after your first prompt is squeezed into one summary block. */
export const FULL = used;
const pressAt = TURNS_.at(-1)!.end + 0.03;
export const COMPACT = { at: pressAt, until: pressAt + 0.14, span: 3 };
used = KEPT + COMPACT.span;
LOG_.push({ at: COMPACT.at, line: '✻ Compacting the conversation…' }, { at: COMPACT.until, line: '✓ Compacted' });
/** Then the files touched last are read in again: the cart fetches them from your files, no call needed. */
export const REREAD: Result[] = [];
{
	let tt = Math.max(drive(COMPACT.until - 0.06, BENCH_AT[0], 0.5), COMPACT.until + 0.006);
	const ready = tt + D.rise * 0.5;
	for (let r = 0; r < 2; r++) REREAD.push({ slot: 0, span: 1, ready, aboard: ready + D.take * 0.5, tip: 0, born: 0, place: r, pace: 0.5 });
	tt = drive(ready + D.take * 0.5, alongX(SLOT_X0 + (used + 1) * PITCH), 0.5);
	TILTS_.push([tt, tt + D.tip * 0.5]);
	REREAD.forEach((r, i) => {
		r.tip = tt + i * D.tip * 0.5 * 0.18;
		r.born = r.tip + D.tip * 0.5 * 0.7;
		r.slot = land(r.born, 'result');
	});
	drive(tt + D.tip * 0.5, 0, 0.5);
}

/** Card 6: a brief to a subagent, three rooms deep, and back comes a report. */
turn({ at: 4.9, pace: 0.55, words: ['A helper can find every caller.'], calls: [{ tool: 'Agent', arg: 'explore', where: 'sub', verdict: 'allow', results: 1, span: 2, said: 'Three callers, all safe.' }] });

/* ---------- what it all comes to ---------- */

export const TURNS: readonly Turn[] = TURNS_;
export const RIDES: readonly Ride[] = RIDES_;
export const NESTS: readonly Nest[] = NESTS_.sort((a, b) => a.layer - b.layer);
/** The tray's arrivals, in the order they land. */
export const ADDS: readonly Add[] = ADDS_;
/** The cart's moves along the rail: [trip time, distance from the gate], holding between pairs. */
export const CART: readonly [number, number][] = CART_;
/** When the cart tips what it carries into the tray. */
export const TILTS: readonly [number, number][] = TILTS_;
/** When your screen asks you, and when you answer. */
export const ASKS = ASKS_;
/** Everything the trip's cards ask of each card, in one list: for the room and the sound. */
export const CARDS: readonly CardRun[] = TURNS_.flatMap((x) => x.cards);
/** Every result tipped in, the re-read files and the subagent's report among them. */
export const RESULTS: readonly Result[] = [...CARDS.flatMap((k) => k.results), ...REREAD];

/** Where the cart is along its rail at t: held at each stop, starting and stopping gently between them. */
export function cartAt(t: number) {
	const keys = CART;
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) {
		const [tb, sb] = keys[i];
		if (t > tb) continue;
		const [ta, sa] = keys[i - 1];
		if (tb - ta < 1e-9 || sa === sb) return sa;
		return sa + (sb - sa) * travel((t - ta) / (tb - ta));
	}
	return keys[keys.length - 1][1];
}
/** How far along a move the cart is: it speeds up, runs, and slows to a stop, a fifth of the way each. */
export function travel(k: number) {
	k = Math.min(1, Math.max(0, k));
	const a = 0.22;
	const v = 1 / (1 - a);
	if (k < a) return (v * k * k) / (2 * a);
	if (k > 1 - a) return 1 - (v * (1 - k) * (1 - k)) / (2 * a);
	return v * (k - a / 2);
}

/** What your screen shows at t: the lines so far, the prompt as you type it, and a question if the gate is asking. */
export function screenAt(t: number): { lines: string[]; ask: string | null; answered: boolean } {
	const lines: { at: number; line: string }[] = LOG_.filter((x) => x.at <= t);
	for (const ty of TYPED_) {
		if (t < ty.from) continue;
		const n = Math.min(ty.text.length, 2 + Math.floor(((t - ty.from) / (ty.to - ty.from)) * (ty.text.length - 2)));
		lines.push({ at: ty.from, line: ty.text.slice(0, n) + (t < ty.to + 0.03 ? '▌' : '') });
	}
	lines.sort((a, b) => a.at - b.at);
	const ask = ASKS_.find((a) => t >= a.from && t < a.to);
	return { lines: lines.slice(ask ? -5 : -10).map((x) => x.line), ask: ask?.question ?? null, answered: !!ask && t >= ask.answer };
}

/** While a copy is being loaded into the capsule: how far along the tray the reading is (0 to 1), and how much it holds. */
export function loadingAt(t: number): { k: number; copy: number } | null {
	for (const x of TURNS_) if (t >= x.send.dock && t < x.send.loaded) return { k: (t - x.send.dock) / (x.send.loaded - x.send.dock), copy: x.send.copy };
	return null;
}

/** The frosted cover: how many slots from the start were in the last request sent, so the provider has them. */
export function coveredAt(t: number): number {
	const steps = [
		...TURNS_.map((x) => ({ at: x.send.dock, to: x.send.loaded, slots: x.send.copy })),
		// The press makes everything after your prompt new: only the start is still cached.
		{ at: COMPACT.at, to: COMPACT.at + 0.02, slots: KEPT }
	].sort((a, b) => a.at - b.at);
	let covered = STANDING;
	for (const e of steps) {
		if (t < e.at) break;
		covered += (e.slots - covered) * Math.min(1, (t - e.at) / (e.to - e.at));
	}
	return covered;
}

// Every tile must land in the order its slot was given out.
for (let i = 1; i < ADDS_.length; i++) if (ADDS_[i].at < ADDS_[i - 1].at) throw new Error(`turns: tile ${i} lands at ${ADDS_[i].at.toFixed(3)}, before the one ahead of it at ${ADDS_[i - 1].at.toFixed(3)}`);
