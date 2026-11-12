import { describe, expect, it } from 'vitest';
import { COMPACT, KEPT, SLOTS, trayAt, TURN_ONE } from './tray';
import { ADDS, CARDS, NESTS, RESULTS, RIDES, TURNS } from './turns';

const kinds = (t: number) => trayAt(t).tiles.map((x) => x.kind);
/** Where each card stops: its scene has to be over by then (stops are at 0.848, 1.848, …, and 6). */
const STOPS = [0.848, 1.848, 2.848, 3.848, 4.848, 6];

describe('the tray', () => {
	it('starts with what every request starts with, tools first, and your prompt arrives in card 1', () => {
		expect(kinds(0)).toEqual(['tools', 'instructions', 'environment']);
		expect(kinds(0.84)).toEqual(TURN_ONE);
		expect(trayAt(0.99).used / SLOTS).toBeLessThan(0.1);
	});

	it('only grows until the press, and never past its end stop', () => {
		let last = 0;
		for (let t = 0; t < COMPACT.at; t += 0.005) {
			const { used } = trayAt(t);
			expect(used).toBeGreaterThanOrEqual(last);
			expect(used).toBeLessThan(SLOTS);
			last = used;
		}
		expect(last / SLOTS).toBeGreaterThan(0.9);
	});

	it('puts each turn’s words and call before the result that answers it', () => {
		const list = kinds(1.84);
		const call = list.indexOf('call');
		expect(list[call - 1]).toBe('text');
		expect(list[call + 1]).toBe('result');
		// The last reply of card 2 asks for nothing: the turn is over.
		expect(list.slice(-2)).toEqual(['text', 'text']);
	});

	it('takes the refused call’s "no" in after the results, in red', () => {
		const no = RIDES.find((r) => r.kind === 'refusal')!;
		expect(kinds(no.born - 0.001)).not.toContain('refusal');
		const after = kinds(no.born);
		expect(after.at(-1)).toBe('refusal');
		expect(after.at(-2)).toBe('result');
	});

	it('squeezes everything after your prompt into one summary block, and leaves the start alone', () => {
		const mid = trayAt((COMPACT.at + COMPACT.until) / 2);
		expect(mid.squeeze).not.toBeNull();
		expect(mid.squeeze!.from).toBe(KEPT);
		const after = trayAt(COMPACT.until + 0.01);
		expect(after.squeeze).toBeNull();
		expect(after.tiles.map((x) => x.kind)).toEqual([...TURN_ONE, 'summary']);
		expect(after.used).toBe(KEPT + COMPACT.span);
	});

	it('ends with the subagent’s report, after the files read in again', () => {
		const end = kinds(6);
		expect(end.slice(0, KEPT + 3)).toEqual([...TURN_ONE, 'summary', 'result', 'result']);
		expect(end.at(-1)).toBe('result');
		expect(trayAt(6).tiles.at(-1)!.span).toBe(2);
	});

	it('is the same at the same moment, whichever way the reader scrubs', () => {
		for (const t of [0.5, 1.7, 3.5, 4.4, 4.6, 5.9]) expect(trayAt(t)).toEqual(trayAt(t));
	});
});

describe('the turns', () => {
	it('land every tile in the order its slot was given out', () => {
		for (let i = 1; i < ADDS.length; i++) expect(ADDS[i].at).toBeGreaterThanOrEqual(ADDS[i - 1].at);
	});

	it('finish each card’s work before its stop', () => {
		const ends = [...ADDS.map((a) => a.at), COMPACT.until, ...TURNS.map((x) => x.end)];
		for (const end of ends) {
			const card = Math.floor(end + 0.152);
			expect(end, `something lands at ${end.toFixed(3)}, after card ${card + 1}'s stop`).toBeLessThan(STOPS[Math.min(card, 5)] - 0.015);
		}
	});

	it('check every call at the gate before it reaches a bench, and never let a refused one through', () => {
		for (const k of CARDS) {
			expect(k.verdict).toBeGreaterThan(k.check);
			if (k.call.verdict === 'deny') {
				expect(k.into).toBeUndefined();
				expect(k.results).toHaveLength(0);
			} else expect(k.into!).toBeGreaterThan(k.settled);
		}
	});

	it('only ask you when your rules say so, and wait for your answer', () => {
		for (const k of CARDS) {
			if (k.call.verdict === 'ask') expect(k.answer!).toBeGreaterThan(k.ring!);
			else expect(k.ring).toBeUndefined();
		}
	});

	it('tip every result in after it boards the cart', () => {
		for (const r of RESULTS) {
			expect(r.aboard).toBeGreaterThanOrEqual(r.ready);
			expect(r.tip).toBeGreaterThanOrEqual(r.aboard);
			expect(r.born).toBeGreaterThan(r.tip);
		}
	});

	it('nest three rooms deep, each finishing inside the one around it', () => {
		expect(NESTS.map((n) => n.layer)).toEqual([1, 2, 3]);
		for (let i = 1; i < NESTS.length; i++) {
			expect(NESTS[i].brief).toBeGreaterThanOrEqual(NESTS[i - 1].out[1]);
			expect(NESTS[i].done).toBeLessThanOrEqual(NESTS[i - 1].back[0]);
		}
	});
});
