import * as THREE from 'three';
import { hang, type Solid } from './kit/cable';
import { low, TOOLS } from './layout';
import { HD, PORT_BACK_X, PORT_BACK_Y } from './props/harness';
import * as P from './sky/masterplan';

type V3 = [number, number, number];

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

/** Your desk's top, as something cables lie on: a rounded rectangle at y = 0. */
function deskOutline(): [number, number][] {
	const { w, d, corner: r } = P.DESK;
	const pts: [number, number][] = [];
	const corners: [number, number, number][] = [
		[w / 2 - r, d / 2 - r, 0],
		[-w / 2 + r, d / 2 - r, Math.PI / 2],
		[-w / 2 + r, -d / 2 + r, Math.PI],
		[w / 2 - r, -d / 2 + r, (Math.PI * 3) / 2]
	];
	for (const [cx, cz, a0] of corners) for (let i = 0; i <= 4; i++) pts.push([cx + r * Math.cos(a0 + (i / 4) * (Math.PI / 2)), cz + r * Math.sin(a0 + (i / 4) * (Math.PI / 2))]);
	return pts;
}
const DESK = slab(deskOutline(), 0, P.DESK.top, [0, 0], 0);
/** The workshop's island, small on the desk's right wing, and the gates' plinth beside it. */
const WORKSHOP = slab(superellipse(32 * TOOLS.s, 15 * TOOLS.s, low([-24.5, 0, 0])[0], low([0, 0, 0.4])[2]), low([0, -15, 0])[1], 1.24 * TOOLS.s, [0, 0], 0);
const GATES: Solid = { min: low([-61, -16.5, -5.6]), max: low([-41, -13, 6.4]) };

const H = P.HARNESS;
const HARNESS: Solid = { min: [H.at.x - H.w / 2, 0, H.at.z - H.d / 2], max: [H.at.x + H.w / 2, H.h, H.at.z + H.d / 2] };
/** The harness's two ports in its back: the results come in at the low one, the calls go out of the high one. */
const backPort = (y: number): V3 => [H.at.x + PORT_BACK_X * H.scale, y * H.scale, H.at.z - (HD / 2) * H.scale];

let returnCable: THREE.CatmullRomCurve3 | null = null;
/**
 * The green cable, harness end first: out of the harness's back, down onto your desk, along behind your tools to the
 * far end of the workshop, round it, up onto its island, and level through the sandbox wall's gland into the hopper.
 */
export function returnPath() {
	const gland = low([-11.5, -14.69, 3.6]);
	return (returnCable ??= hang({
		from: { at: backPort(PORT_BACK_Y), out: [0, 0, -1] },
		to: { at: low([-13.5, -14.69, 3.6]), out: [1, 0, 0] },
		via: [
			{ at: [H.at.x - 0.6, 0.12, H.at.z - H.d / 2 - 0.7], slack: 1.06 },
			{ at: [3.2, 0.12, -4.9], slack: 1.01 },
			{ at: [13.0, 0.12, -4.4], slack: 1.01 },
			{ at: [13.7, 0.12, gland[2] - 0.5], slack: 1.02 },
			{ at: [gland[0] + 0.45, gland[1], gland[2]], slack: 1.01 },
			{ at: gland, slack: 1 }
		],
		r: 0.115,
		slack: 1,
		bend: 0.6,
		on: [DESK, WORKSHOP, HARNESS, GATES]
	}));
}

/** The calls' cable: out of the harness's back, down onto your desk, along behind it, and up into the riser on the gates' dock. */
export function callPath(dock: V3) {
	return hang({
		from: { at: backPort(3.2), out: [0, 0, -1] },
		to: { at: dock, out: [-1, 0, 0] },
		via: [
			{ at: [H.at.x - 0.3, 0.09, H.at.z - H.d / 2 - 0.9], slack: 1.08 },
			{ at: [2.4, 0.09, -4.7], slack: 1.01 },
			{ at: [2.6, 0.09, dock[2] - 0.5], slack: 1.04 }
		],
		r: 0.09,
		slack: 1.017,
		bend: 0.6,
		on: [DESK, HARNESS, GATES]
	});
}
