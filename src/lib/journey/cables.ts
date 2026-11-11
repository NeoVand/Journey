import * as THREE from 'three';
import { hang, roller, type Solid } from './kit/cable';
import { LOWER } from './layout';

type V3 = [number, number, number];
const low = (p: V3): V3 => [p[0] + LOWER[0], p[1] + LOWER[1], p[2] + LOWER[2]];

/** Your island, from above. */
export const HOME_OUTLINE: [number, number][] = [
	[-6.1, 0.2],
	[-4.6, -2.7],
	[0.4, -3.3],
	[5.6, -3.0],
	[8.2, -1.2],
	[8.2, 1.3],
	[5.0, 3.2],
	[-1.2, 3.7],
	[-5.2, 2.7]
];

/** The outline islandAt() draws, w across and d deep, centred on x, z. */
export function superellipse(w: number, d: number, x = 0, z = 0): [number, number][] {
	const pts: [number, number][] = [];
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const c = Math.cos(a);
		const s = Math.sin(a);
		pts.push([x + Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (w / 2), z + Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (d / 2)]);
	}
	return pts;
}

/**
 * An island as something a cable rests on: its top, and the bottom of its lip. The island's edge is drawn as a smooth
 * curve through its outline, a little outside it, so the outline grows by that much.
 */
export function slab(outline: [number, number][], top: number, thick = 0.62, at: [number, number] = [0, 0], grow = 0.22): Solid {
	const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
	const cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
	const moved = outline.map(([x, z]): [number, number] => {
		const l = Math.hypot(x - cx, z - cz) || 1;
		return [x + ((x - cx) / l) * grow + at[0], z + ((z - cz) / l) * grow + at[1]];
	});
	return { outline: moved, top, bottom: top - thick };
}

export const HOME = slab(HOME_OUTLINE, 0);
/** The workshop's island, and its floor. */
const WORKSHOP_Y = low([0, -15, 0])[1];
const WORKSHOP = slab(superellipse(32, 15, low([-24.5, 0, 0])[0], 0.4), WORKSHOP_Y, 0.6, [0, 0], 0);

const HARNESS: Solid = { min: [-0.3, 0, -1.78], max: [2.5, 3.9, 0.5] };

/** Rollers on your island's edge, where the cables go over: the green one behind the harness, the calls' further left. */
export const RETURN_ROLLER = roller([0.4, 0, -3.32], [0, -1], 0.24, 0.115);
export const CALL_ROLLER = roller([-4.1, 0, -2.95], [-0.45, -0.89], 0.24, 0.09);

let returnCable: THREE.CatmullRomCurve3 | null = null;
/**
 * The green cable, harness end first: out of the harness's back, down onto your island, over the roller at its back
 * edge, and straight down, a long way, to the workshop's floor, along it, and level through the sandbox wall's gland
 * into the hopper.
 */
export function returnPath() {
	return (returnCable ??= hang({
		from: { at: [0.4, 1.3, -1.75], out: [0, 0, -1] },
		to: { at: low([-13.5, -14.69, 3.6]), out: [1, 0, 0] },
		via: [
			{ at: RETURN_ROLLER.hold, slack: 1.12 },
			{ at: RETURN_ROLLER.top, slack: 1.02 },
			{ at: RETURN_ROLLER.past, slack: 1.11 },
			{ at: low([-10.7, -14.69, 3.6]), slack: 1.03 },
			{ at: low([-11.5, -14.69, 3.6]), slack: 1 }
		],
		r: 0.115,
		slack: 1,
		bend: 0.8,
		on: [HOME, WORKSHOP, HARNESS, RETURN_ROLLER.solid]
	}));
}

/** The calls' cable: out of the harness's back, along behind your island, over the roller at its back, and down in one long swing to the riser on the dock. */
export function callPath(dock: V3) {
	return hang({
		from: { at: [0.4, 3.2, -1.75], out: [0, 0, -1] },
		to: { at: dock, out: [1, 0, 0] },
		via: [
			{ at: [-1.5, 0.09, -2.45], slack: 1.12 },
			{ at: CALL_ROLLER.hold, slack: 1.04 },
			{ at: CALL_ROLLER.top, slack: 1.02 }
		],
		r: 0.09,
		slack: 1.017,
		bend: 0.8,
		on: [HOME, HARNESS, CALL_ROLLER.solid]
	});
}
