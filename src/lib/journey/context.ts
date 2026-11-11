/**
 * What the model is sent, moment by moment through the story: the context the header's bar measures. Token counts are
 * illustrative, for Claude Code, and agree with the ten turns' ledger and the compaction press.
 */
import { hash, inOut, lerp, seg } from './kit/math';
import { TEN_AT, TEN_STEP, TEN_TURNS } from './content';

/** The most the model can take in at once: a common size for the models these agents run. */
export const WINDOW = 200_000;

export type PartKind = 'instructions' | 'environment' | 'tools' | 'conversation' | 'call' | 'result' | 'text' | 'summary';
export type Part = { kind: PartKind; tokens: number };
export type Context = { parts: Part[]; total: number; long: boolean };

export const PART_NAME: Record<PartKind, string> = {
	instructions: 'Instructions',
	environment: 'Environment',
	tools: 'Tools',
	conversation: 'Your prompt',
	call: 'Tool calls',
	result: 'Tool results',
	text: 'The model’s words',
	summary: 'Summary'
};

/**
 * Turn one, drawer by drawer, in the drawers' order. The instructions and the tools' descriptions are nearly all of it;
 * your sentence is the tail. Together they make the ledger's 21,000.
 */
export const TURN_ONE: Part[] = [
	{ kind: 'instructions', tokens: 6000 },
	{ kind: 'environment', tokens: 900 },
	{ kind: 'tools', tokens: 14000 },
	{ kind: 'conversation', tokens: 100 }
];
/** When each drawer's contents go in: the moment the story opens that drawer. */
export const PACKED_AT = [2.04, 2.2, 2.36, 2.52];
/** Turn two's request goes out as the loop comes round. */
export const TURN_TWO_AT = 25.46;

/**
 * The compaction press holds a long session, message by message. Instructions and tools lie at the bottom and never
 * change; on them your prompt, then turn after turn of call, result and the model's own words, creeping up towards the
 * window's limit. Each slip is as thick as roughly how much it holds: a file read is thick, a call is thin.
 */
export type SlipKind = 'base' | 'prompt' | 'call' | 'result' | 'text';
export const SLIP_TURNS = 12;
/** The latest turns, which go on as they are. */
export const SLIP_KEEP = 2;
export const SLIPS: { kind: SlipKind; t: number }[] = [
	{ kind: 'base', t: 0.32 },
	{ kind: 'prompt', t: 0.07 },
	...Array.from({ length: SLIP_TURNS }, (_, n) => [
		{ kind: 'call' as const, t: 0.05 },
		{ kind: 'result' as const, t: 0.07 + hash(n * 3.7 + 1) * 0.13 },
		{ kind: 'text' as const, t: 0.04 }
	]).flat()
];
/** Everything from your prompt up to the latest turns: what the summary stands in for. */
export const SLIP_OLD = [1, SLIPS.length - SLIP_KEEP * 3];
export const SLIP_OLD_T = SLIPS.slice(SLIP_OLD[0], SLIP_OLD[1]).reduce((s, x) => s + x.t, 0);
export const SLIP_FULL = SLIPS.reduce((s, x) => s + x.t, 0);
export const SUMMARY_T = 0.3;
/** Each message after your prompt lands at its own moment; the score's paper sounds land with them. */
export const SLIP_FROM = 26.08;
export const SLIP_STEP = (26.46 - SLIP_FROM) / (SLIPS.length - 2);
/** The press comes down, squeezes the older messages, and lifts. */
export const PRESS_REACH = [26.48, 26.53];
export const PRESS_SQUEEZE = [26.53, 26.6];
/** How full the press's gauge reads with the whole pile on it. */
export const PILE_FULL = 0.98;
/** The card the long session belongs to. */
const LONG = [26, 27];

/** A slip's thickness, as tokens of the window. */
const asTokens = (t: number) => Math.round((t / SLIP_FULL) * PILE_FULL * WINDOW);

/** The long session on the press at T, slip by slip, as the gauge beside it reads it. */
export function pileAt(T: number): Part[] {
	const q = inOut(seg(T, PRESS_SQUEEZE[0], PRESS_SQUEEZE[1]));
	const folded = q >= 1;
	const oldK = lerp(1, SUMMARY_T / SLIP_OLD_T, q);
	const parts: Part[] = [];
	SLIPS.forEach((s, i) => {
		const old = i >= SLIP_OLD[0] && i < SLIP_OLD[1];
		const at = i < 2 ? -1 : SLIP_FROM + (i - 1) * SLIP_STEP;
		// The gauge counts a slip from the moment it starts down, as the press's pile makes room for it.
		const landed = i < 2 || T > at - SLIP_STEP;
		if (landed && !(old && folded)) {
			const t = s.t * (old ? oldK : 1);
			if (s.kind === 'base') {
				// The bottom slip is the drawers' contents: instructions, environment and tools, in turn one's shares.
				const base = TURN_ONE.slice(0, 3);
				const sum = base.reduce((a, p) => a + p.tokens, 0);
				base.forEach((p) => parts.push({ kind: p.kind, tokens: Math.round((asTokens(t) * p.tokens) / sum) }));
			} else parts.push({ kind: s.kind === 'prompt' ? 'conversation' : s.kind, tokens: asTokens(t) });
		}
		if (i === SLIP_OLD[1] - 1 && folded) parts.push({ kind: 'summary', tokens: asTokens(SUMMARY_T) });
	});
	return parts;
}

/** How many of the fix's turns have gone out by T. The ten turns' card tells them again from the first. */
function turnsAt(T: number) {
	if (T >= TEN_AT) return Math.min(TEN_TURNS.length, Math.floor((T - TEN_AT) / TEN_STEP) + 1);
	return T >= TURN_TWO_AT ? 2 : 1;
}

/** The fix's request after its first n turns: turn one's drawers, then each turn's call and what came back. */
function fixAfter(n: number): Part[] {
	const parts = [...TURN_ONE];
	for (let i = 1; i < n; i++) {
		const fresh = TEN_TURNS[i].fresh;
		// What's new in a turn is the model's last call, which is short, and the result that answers it.
		const call = Math.min(150, Math.round(fresh / 3));
		parts.push({ kind: 'call', tokens: call }, { kind: 'result', tokens: fresh - call });
	}
	return parts;
}

/** What the model is sent at T, or null before the harness has packed anything. */
export function contextAt(T: number): Context | null {
	if (T < PACKED_AT[0]) return null;
	const long = T >= LONG[0] && T < LONG[1];
	const parts = long ? pileAt(T) : T < PACKED_AT[3] + 0.1 ? TURN_ONE.filter((_, i) => T >= PACKED_AT[i]) : fixAfter(turnsAt(T));
	return { parts, total: parts.reduce((s, p) => s + p.tokens, 0), long };
}
