/**
 * The new room inside the harness, heard: every sound placed on a moment of the trip's script (tracks/room/turns.ts),
 * so it plays when the picture does it. Recorded sounds for the machines, porcelain notes for what the reader should
 * notice: a call let through, a ring for you, a "no".
 */
import * as THREE from 'three';
import { ROOM_AT } from '../tracks/harness';
import { BENCHES, CHUTE, DOCK, GATE_X, GATE_Z, HOOK_PORT, PAD, RAIL_WEST_Z, skillAt, SUB, TRAY_Z, TUBE } from '../tracks/room/layout';
import { cartAt, CART, CARDS, COMPACT, NESTS, RAIL_LEN, RAIL_PATH, REREAD, RESULTS, RIDES, slotX, TURNS } from '../tracks/room/turns';
import type { Bed, Cue, Heard, Where } from './conductor';
import { chime, key, low, note, porcelain, tick, whoosh } from './synth';

/** A point in the room, in the story's coordinates. */
const at = (x: number, y: number, z: number): Where => [x + ROOM_AT.x, y + ROOM_AT.y, z + ROOM_AT.z];
const TUBE_FOOT = at(TUBE.x, 0.5, TUBE.z);
const TUBE_TOP = at(TUBE.x, 6.5, TUBE.z);
const PRESS = at(DOCK.x, 0.5, DOCK.z);
const CHUTE_TOP = at((CHUTE.x0 + CHUTE.x1) / 2, 5.5, (CHUTE.z0 + CHUTE.z1) / 2);
const CHUTE_FOOT = at((CHUTE.x0 + CHUTE.x1) / 2, 1, (CHUTE.z0 + CHUTE.z1) / 2);
const PADS = at(PAD.x1 - 0.3, 0.3, PAD.z0 + 0.2);
const GATE = at(GATE_X, 1.0, GATE_Z);
const BELL = at(GATE_X, 1.5, GATE_Z);
const HOOK = at(HOOK_PORT[0], HOOK_PORT[1], HOOK_PORT[2]);
const SCREEN = at(-7.1, 2.3, -1.4);
const SHELF = (() => {
	const p = skillAt(0);
	return at(p.x, p.y, p.z);
})();
const DOOR = at(SUB.x1, 0.3, RAIL_WEST_Z);
const bench = (i: number) => at(6.3, 0.7, BENCHES[i].z);
const thing = (i: number) => at(8.4, 0.4, BENCHES[i].z);
const slot = (n: number) => at(slotX(n), 0.5, TRAY_Z);
/** Where the cart is, asked for as the sound plays. */
const v = new THREE.Vector3();
const cart =
	(T: number): Heard =>
	() => {
		RAIL_PATH.getPointAt(Math.min(1, Math.max(0, cartAt(T) / RAIL_LEN)), v);
		return at(v.x, 0.4, v.z);
	};
/** The subagent's rooms, by layer: each nearer the middle of the one before. */
const sub = (layer: number) => at((SUB.x0 + SUB.x1) / 2, 0.3, SUB.z0 + (SUB.z1 - SUB.z0) * (0.5 + layer * 0.12));

export function insideTheRoom(): { cues: Cue[]; beds: Bed[] } {
	const cues: Cue[] = [];
	const cue = (T: number, sound: Cue['sound'], where?: Where | Heard, more: Partial<Cue> = {}) => cues.push({ T, sound, at: where, ...more });

	// Your prompt: typed, out of your screen, along the lip, and into its slot.
	for (const r of RIDES) {
		if (r.kind === 'prompt') {
			for (let k = 0; k < 9; k++) cue(r.from - 0.13 + k * 0.012, key(0.8), SCREEN, { gain: 0.35, minor: true });
			cue(r.from, 'pop', SCREEN, { gain: 0.5 });
		}
		cue(r.lip, 'paper-slide', PADS, { gain: 0.35, rate: 1.15, minor: true });
		cue(r.born, tick(r.kind === 'refusal' ? 0.8 : 1.3), slot(r.slot), { gain: 0.5 });
	}

	for (const turn of TURNS) {
		const s = turn.send;
		const quick = turn.pace < 0.5;
		// The copy: out to the press and loaded, back, and up the tube with a soft pop; down again, empty.
		cue(s.out, 'servo', TUBE_FOOT, { gain: 0.4, rate: 1.2, minor: quick });
		cue(s.dock, 'latch', PRESS, { gain: 0.45, rate: 1.1 });
		if (!quick) for (let k = 0; k < 6; k++) cue(s.dock + ((s.loaded - s.dock) * k) / 6, tick(1.5), PRESS, { gain: 0.25, minor: true });
		cue(s.home + (s.gone - s.home) * 0.3, 'tube', TUBE_FOOT, { gain: quick ? 0.45 : 0.7 });
		cue(s.home + (s.gone - s.home) * 0.35, whoosh(0.6, 2400), TUBE_TOP, { gain: 0.3, minor: quick });
		cue(s.down, whoosh(0.7, 1300), TUBE_TOP, { gain: 0.2, minor: true });
		cue(s.rest - 0.004, 'clonk', TUBE_FOOT, { gain: 0.3, rate: 1.3, minor: true });

		// The reply: tiles drop down the chute, run down the slide, and click into the tray one by one.
		turn.falls.forEach((f, i) => {
			// Sped up, a turn is heard by its first tile only: a time-lapse, not a clatter.
			if (turn.pace < 0.3 && i > 0) return;
			cue(f.fall, whoosh(0.4, 2600), CHUTE_TOP, { gain: 0.18, minor: true });
			cue(f.foot, tick(1.1 + i * 0.05), CHUTE_FOOT, { gain: 0.45, minor: i > 0 });
			if (i === 0) cue(f.foot + 0.004, 'paper-slide', CHUTE_FOOT, { gain: 0.4, rate: 1.1 });
			cue(f.born, tick(1.25 + i * 0.06), slot(f.slot), { gain: 0.5, minor: i > 0 });
		});
	}

	// Each call: a card pops up, boards the cart, and the gate checks it: your hook, your rules, and you.
	for (const k of CARDS) {
		if (k.pace < 0.3 && k.j > 0) continue;
		cue(k.printed, 'pop', PADS, { gain: 0.45, rate: 1.1 + k.j * 0.06 });
		cue(k.aboard, 'paper-land', GATE, { gain: 0.45, rate: 1.05, minor: k.j > 0 });
		cue(k.check, whoosh(0.5, 2200), HOOK, { gain: 0.22, minor: k.pace < 0.5 });
		cue(k.hooked, porcelain(note(6), 0.6), GATE, { gain: 0.35, minor: k.pace < 0.5 });
		if (k.ring !== undefined) {
			// The bell: it rings for you, and your screen asks.
			for (let r = 0; r < 4; r++) cue(k.ring + r * 0.022, porcelain(note(14), 0.9), BELL, { gain: 0.5 - r * 0.07, dip: 0.3 });
			cue(k.answer!, key(1.1), SCREEN, { gain: 0.6 });
		}
		if (k.call.verdict === 'deny') {
			cue(k.verdict, low(147, 0.9), GATE, { gain: 0.7, dip: 0.35 });
			cue(k.out!, 'flap', GATE, { gain: 0.45 });
			cue(k.out! + 0.03 * k.pace, 'paper-land', PADS, { gain: 0.5, rate: 0.9 });
		} else cue(k.verdict, chime(k.pace < 0.5 ? [4, 7] : [2, 4, 7], 0.06), GATE, { gain: k.pace < 0.5 ? 0.25 : 0.42, minor: k.pace < 0.5 });
		if (typeof k.call.where === 'number' && k.into !== undefined) cue(k.into + 0.01 * k.pace, 'latch', bench(k.call.where), { gain: 0.5, rate: 1 + k.call.where * 0.05, minor: k.pace < 0.5 && k.j > 0 });
	}

	// The cart: a little motor each time it sets off (sped up, once a turn).
	const lapse = TURNS.filter((x) => x.pace < 0.3);
	const heard = new Set<(typeof TURNS)[number]>();
	for (let i = 1; i < CART.length; i += 2) {
		const [from, s0] = CART[i];
		const [, s1] = CART[i + 1] ?? CART[i];
		if (Math.abs(s1 - s0) < 0.05) continue;
		const fast = lapse.find((x) => from >= x.send.out && from <= x.end);
		if (fast && heard.has(fast)) continue;
		if (fast) heard.add(fast);
		cue(from, 'servo', cart(from + 0.005), { gain: 0.42, rate: 1.05 + ((i >> 1) % 3) * 0.04, minor: true });
	}

	// The benches: out along the wire to your machine, the real thing at work, and back.
	for (const turn of TURNS)
		for (const run of turn.runs) {
			cue(run.from, whoosh(0.45, 1900), bench(run.bench), { gain: 0.25, minor: run.pace < 0.5 });
			cue((run.from + run.to) / 2, 'relay', thing(run.bench), { gain: 0.35, rate: 1 + run.bench * 0.08, minor: run.pace < 0.5 });
			cue(run.to - 0.004, whoosh(0.45, 1400), bench(run.bench), { gain: 0.2, minor: true });
		}

	// Results: up out of the bench, onto the cart, and tipped into the tray with a click each.
	RESULTS.forEach((r, i) => {
		if (r.span < 2 && (r.pace >= 0.3 || r.place === 0)) cue(r.born, tick(1.35 + (i % 4) * 0.05), slot(r.slot), { gain: 0.45, minor: r.place > 0 });
	});
	for (const turn of TURNS) if (turn.tip) cue(turn.tip[0], 'paper-land', cart(turn.tip[0]), { gain: 0.5, rate: 1.1 });

	// The skill: up to the shelf, and its copy down onto the cart, unfolding.
	const skill = CARDS.find((k) => k.call.where === 'skill');
	if (skill) {
		cue(skill.into!, 'paper-slide', SHELF, { gain: 0.5, rate: 1.2 });
		cue(skill.results[0].ready, 'flap', SHELF, { gain: 0.4 });
		cue(skill.results[0].aboard - 0.01, chime([0, 2, 4], 0.05), cart(skill.results[0].aboard), { gain: 0.42 });
	}

	// The press: the tray is full, and the conversation is squeezed into a summary.
	cue(COMPACT.at, 'press', slot(26), { gain: 0.9, dip: 0.4 });
	cue(COMPACT.until - 0.01, chime([4, 2, 0]), slot(5), { gain: 0.35 });
	cue(REREAD[0].ready - 0.01, 'latch', bench(0), { gain: 0.45 });

	// The subagent: the brief through the door; each room's own little loop, quicker the deeper it goes; the report.
	const agent = CARDS.find((k) => k.call.where === 'sub');
	if (agent) cue(agent.into!, whoosh(0.6, 2000), DOOR, { gain: 0.3 });
	for (const n of NESTS) {
		const r = 1.15 + n.layer * 0.18;
		cue(n.brief, tick(1.6 + n.layer * 0.1), sub(n.layer), { gain: 0.35 });
		cue(n.send[0], 'tube', sub(n.layer), { gain: 0.35 - n.layer * 0.06, rate: r });
		cue(n.gate, porcelain(note(7 + n.layer * 2), 0.6), sub(n.layer), { gain: 0.3 });
		cue(n.out[0], 'servo', sub(n.layer), { gain: 0.3, rate: r + 0.1, minor: true });
		cue(n.back[0], 'servo', sub(n.layer), { gain: 0.28, rate: r + 0.12, minor: true });
		cue(n.report, porcelain(note(9 + n.layer * 2), 0.7), sub(n.layer), { gain: 0.32 });
	}
	const report = RESULTS.find((r) => r.span === 2);
	if (report) {
		cue(report.aboard, chime([0, 4, 7]), DOOR, { gain: 0.42 });
		cue(report.born, 'paper-land', slot(report.slot), { gain: 0.7, rate: 0.9 });
	}

	const long = lapse;
	return {
		cues: cues.sort((a, b) => a.T - b.T),
		beds: [
			{ sound: 'pad-room', from: 0, to: 6.1, level: 1, fade: 0.05 },
			{ sound: 'room', from: 0, to: 6.1, level: 0.1, fade: 0.05 },
			// The record winding out to your disk, through the long session.
			{ sound: 'reel', from: long[0].send.out, to: COMPACT.at, level: 0.3, fade: 0.04 }
		]
	};
}
