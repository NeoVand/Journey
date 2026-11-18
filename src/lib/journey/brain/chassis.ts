/*
 * What holds the two halves: the keel in the fissure that both ride on, with the intake at its crown and the blocks of
 * electronics that show between the halves; the brainstem under it, with the axle across its top; and under the back of
 * each half, the cerebellum (its copper lobe and blue lid). Everything between the halves stays where it is when they draw apart;
 * what rides with a half (its boss on the axle, its collars on the pins, its saddle round the intake, its drum) goes with it.
 */
import * as THREE from 'three';
import { rbox } from '../kit/geometry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lid, lobe } from './cerebellum';
import { AXLE, beneath, FISSURE_BLOCKS, HOSE, over, PORT } from './design';
import { FISSURE, profile, ROLL, shell, type V3 } from './shell';
import { rod, tube, turned, turnedZ } from './shapes';
import { stem } from './stem';
import { DISH, Parts } from './works';

/** How far the keel's edge is drawn in from the core's own outline: inside the roll, and clear of the cushions that come round it. */
export const KEEL_IN = ROLL + 0.2;
/** Half the keel's thickness. */
export const KEEL = 0.08;
/** Where the pins through the keel are, that the two halves slide on: x and y in the fissure's plane. */
export const PINS: [number, number][] = [
	[2.5, 1.35],
	[-2.7, 1.3],
	[2.3, -1.25],
	[-2.5, -0.85]
];
/** How far each pin reaches either side of the fissure's middle, and the most the halves ever draw apart. */
const PIN_REACH = 0.86;
export const PART = 0.26;

/** What the intake's arms hold: the hose's wheel and the nozzle under it, in the brain's own frame. See HOSE in the design. */
export type Hose = typeof HOSE;

/** Everything between the halves. The ratchet ring round the intake comes back on its own, to be turned. */
export function between(hose: Hose = HOSE) {
	const parts = new Parts();

	// The keel: a dark plate the shape of the fissure, with the intake's throat let into its top edge.
	const outline: THREE.Vector2[] = [];
	const n = 220;
	for (let i = 0; i < n; i++) {
		const [x, y] = profile((i / n) * Math.PI * 2, KEEL_IN);
		// The intake stands in a notch in its top edge, clear of the plate all round.
		const inThroat = Math.abs(x - PORT.x) < PORT.r + 0.1;
		outline.push(new THREE.Vector2(x, inThroat ? Math.min(y, PORT.floor - 0.1) : y));
	}
	const plate = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: KEEL * 2 - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 4 }).translate(0, 0, -KEEL + 0.015);
	parts.add('dark', plate);
	// A seam of light let into its edge, all the way round: what shows in the fissure when the halves draw apart.
	const seam: V3[] = [];
	for (let i = 0; i < n; i += 2) {
		const [x, y] = profile((i / n) * Math.PI * 2, KEEL_IN - 0.012);
		if (Math.abs(x - PORT.x) < PORT.r + 0.1 && y > 2) continue;
		seam.push([x, y, 0]);
	}
	parts.add('amber', tube(seam, 0.028, 6, false));
	// The pins the halves slide on: each goes into a bore in either core, so they are kept apart from what must stand clear of the cores.
	const pins = new Parts();
	for (const [x, y] of PINS) {
		pins.add('chrome', rod([x, y, -PIN_REACH], [x, y, PIN_REACH], 0.1, 20));
		parts.add('dark', rod([x, y, -KEEL - 0.03], [x, y, KEEL + 0.03], 0.17, 24));
	}

	// The blocks that stand in the fissure, each on a stalk from the keel, its lit bars facing out.
	for (const b of FISSURE_BLOCKS) {
		const a = (b.lean * Math.PI) / 180;
		const at = new THREE.Matrix4().makeRotationZ(a).setPosition(b.at[0], b.at[1], 0);
		const place = (x: number, y: number, z: number) => at.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
		const [tall, deep, wide] = b.size;
		parts.add('dark', rbox(tall, deep, wide, 0.04, 2), place(0, 0, 0));
		parts.add('chrome', rbox(0.016, deep * 0.84, wide * 0.84, 0.006, 1), place(tall / 2 + 0.004, 0, 0));
		for (let i = 0; i < b.bars; i++) parts.add('amber', rbox(0.02, Math.min(0.07, (deep * 0.5) / b.bars), wide * 0.6, 0.008, 1), place(tall / 2 + 0.014, deep * 0.62 * ((i + 0.5) / b.bars - 0.5), 0));
		parts.add('chrome', rbox(tall * 0.5, deep + 0.04, 0.05, 0.012, 1), place(-tall * 0.1, 0, wide / 2 - 0.01));
		parts.add('chrome', rbox(tall * 0.5, deep + 0.04, 0.05, 0.012, 1), place(-tall * 0.1, 0, -wide / 2 + 0.01));
		parts.add('dark', rod([b.at[0] - Math.cos(a) * (tall / 2 + 0.75), b.at[1] - Math.sin(a) * (tall / 2 + 0.75), 0], [b.at[0] - Math.cos(a) * tall * 0.4, b.at[1] - Math.sin(a) * tall * 0.4, 0], KEEL - 0.01, 12));
	}

	// The intake: a chrome bezel at the crown and a throat going down into the keel in steps, a ring of light at each step.
	const { rim, r, bore, floor } = PORT;
	const at: V3 = [PORT.x, 0, 0];
	const steps: [number, number][] = [
		[bore, rim - 0.34],
		[bore - 0.08, rim - 0.66],
		[bore - 0.16, rim - 0.98]
	];
	const bezel: [number, number][] = [
		[r + 0.025, rim - 0.86],
		[r + 0.025, rim - 0.78],
		[r, rim - 0.75],
		[r, rim - 0.1],
		[r - 0.07, rim],
		[r - 0.085, rim],
		[r - 0.085, rim - 0.034],
		[bore + 0.155, rim - 0.034],
		[bore + 0.155, rim],
		[bore + 0.1, rim],
		[bore + 0.04, rim - 0.05],
		[bore, rim - 0.12]
	];
	parts.add('chrome', turned(at, bezel, 72));
	const throat: [number, number][] = [[bore, rim - 0.12]];
	for (const [radius, y] of steps) throat.push([throat[throat.length - 1][0], y], [radius, y]);
	throat.push([throat[throat.length - 1][0], floor]);
	parts.add('dark', turned(at, throat, 56));
	steps.forEach(([radius, y]) => parts.add('amber', new THREE.TorusGeometry(radius + 0.045, 0.02, 10, 96).rotateX(Math.PI / 2).translate(PORT.x, y + 0.018, 0)));
	// Its outside, down into the fissure, and the dark of its floor.
	parts.add('dark', turned(at, [[0, floor - 0.12], [r - 0.12, floor - 0.12], [r - 0.12, rim - 0.86], [r + 0.025, rim - 0.86]], 56));
	// The ratchet ring in its top, that clicks round a notch for every token: chrome, with a dark mark at every notch.
	const ring = new Parts();
	ring.add('chrome', turned([0, 0, 0], [[r - 0.1, rim - 0.024], [r - 0.1, rim + 0.035], [r - 0.13, rim + 0.05], [bore + 0.2, rim + 0.05], [bore + 0.17, rim + 0.035], [bore + 0.17, rim - 0.024]], 72));
	for (let i = 0; i < NOTCHES; i++) {
		const a = (i / NOTCHES) * Math.PI * 2;
		ring.add('dark', rbox(0.1, 0.012, 0.03, 0.005, 1), new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation((r - 0.1 + bore + 0.17) / 2, rim + 0.052, 0)));
	}

	// Two arms rise from lugs on the bezel to the axle of the hose's wheel, and hold the nozzle under it.
	const [wx, wy] = hose.wheel;
	for (const s of [-1, 1]) {
		const foot: V3 = [PORT.x - 0.15, rim - 0.2, s * (r + 0.02)];
		const knee: V3 = [PORT.x + 0.1, rim + (wy - rim) * 0.45, s * 0.92];
		const top: V3 = [wx, wy, s * 0.8];
		parts.add('chrome', tube([foot, [foot[0], rim + 0.25, s * (r - 0.02)], knee, [wx - 0.12, wy - 0.5, s * 0.82], top], 0.07, 10));
		parts.add('amber', tube([[foot[0] + 0.005, rim + 0.3, s * (r + 0.05)], [knee[0], knee[1], knee[2] + s * 0.073], [wx - 0.12, wy - 0.55, s * 0.893]], 0.016, 5));
		// A lug on the bezel, a boss at the axle, and a strut in to the nozzle's collar.
		parts.add('chrome', rbox(0.3, 0.3, 0.1, 0.03, 2), new THREE.Matrix4().makeTranslation(foot[0], rim - 0.2, s * (r + 0.035)));
		parts.add('chrome', rod([wx, wy, s * 0.7], [wx, wy, s * 0.9], 0.17, 24));
		const collar = hose.nozzle - 0.16;
		parts.add('chrome', tube([[PORT.x + 0.04, collar, s * (hose.hoseR + 0.16)], [PORT.x + 0.06, collar + 0.05, s * 0.75], [PORT.x + 0.085, collar + 0.3, s * 0.9]], 0.045, 8));
	}
	parts.add('chrome', rod([wx, wy, -0.98], [wx, wy, 0.98], 0.08, 16));
	// The wheel the hose rides over: a rubber roller between two flanges.
	parts.add('dark', rod([wx, wy, -0.5], [wx, wy, 0.5], hose.wheelR, 40));
	for (const s of [-1, 1]) parts.add('chrome', rod([wx, wy, s * 0.5], [wx, wy, s * 0.56], hose.wheelR + 0.16, 40));
	// The nozzle: the hose ends in a chrome collar, and a short spout below it to the lip.
	const R = hose.hoseR;
	parts.add('chrome', turned(at, [[R + 0.02, hose.lip - 0.02], [R + 0.07, hose.lip - 0.02], [R + 0.1, hose.lip + 0.1], [R + 0.1, hose.nozzle - 0.3], [R + 0.2, hose.nozzle - 0.26], [R + 0.2, hose.nozzle - 0.06], [R + 0.14, hose.nozzle], [R + 0.02, hose.nozzle], [R + 0.02, hose.lip - 0.02]], 40));

	// The brainstem (stem.ts): the plug that sits in the stand, the neck up to the keel, and the fork that carries the axle
	// the halves slide on.
	for (const piece of stem()) parts.add(piece.finish, piece.geo);

	return { parts, ring, pins };
}

/** How many notches the intake's ratchet ring has. */
export const NOTCHES = 36;
/** How far out along the brainstem's axle each half's bearing is, with the halves closed. */
export const BEARING = 1.08;

/** What hangs under one half and rides with it: its bearing on the brainstem's axle, its sockets on the keel's pins, and its drum. */
export function under() {
	const parts = new Parts();
	const p: V3 = [0, 0, 0];
	const n: V3 = [0, 0, 0];
	// The half's bearing on the brainstem's axle: a ring that slides along the axle, under a block let up into the core's
	// underside and held there by two bolts.
	const z0 = BEARING;
	parts.add('chrome', turnedZ([AXLE.x, AXLE.y, z0], [[AXLE.r + 0.018, -0.11], [0.185, -0.11], [0.2, -0.095], [0.2, 0.095], [0.185, 0.11], [AXLE.r + 0.018, 0.11], [AXLE.r + 0.018, -0.11]]));
	const under = beneath(AXLE.x, z0);
	if (under) {
		shell(under[0], under[1], p, n);
		const top = p[1] + 0.06;
		const low = AXLE.y + 0.12;
		parts.add('chrome', rbox(0.62, top - low, 0.2, 0.03, 2), new THREE.Matrix4().makeTranslation(AXLE.x, (top + low) / 2, z0));
		for (const dx of [-0.23, 0.23]) parts.add('dark', rod([AXLE.x + dx, low - 0.02, z0], [AXLE.x + dx, low + 0.02, z0], 0.045, 12));
	}
	// A collar on the inner face round each of the keel's pins.
	for (const [x, y] of PINS) parts.add('chrome', turnedZ([x, y, FISSURE - 0.03], [[0.118, -0.03], [0.2, -0.03], [0.2, 0.03], [0.118, 0.03], [0.118, -0.03]]));

	// The intake's saddle: a low chrome skirt lying on the core round the intake, as an eye's dish lies round an eye. The
	// cushions that part round the intake float over it; it rides with its half, and draws away from the bezel when the halves part.
	{
		const inner = PORT.r + 0.06;
		const outer = PORT.r + 0.62;
		const least = 0.78;
		const rings: [number, number][] = [
			[inner, 0.004],
			[inner, DISH + 0.008],
			[inner + 0.05, DISH + 0.008],
			[inner + 0.065, DISH],
			[outer - 0.1, DISH],
			[outer - 0.085, DISH - 0.01],
			[outer - 0.012, DISH - 0.01],
			[outer, 0.003]
		];
		const sides = 56;
		const pos: number[] = [];
		const idx: number[] = [];
		for (let k = 0; k <= sides; k++)
			for (const [radius, high] of rings) {
				// Each ring runs from where it leaves the fissure's side, round the intake, to where it comes back to it.
				const a0 = Math.asin(least / radius);
				const a = a0 + ((Math.PI - 2 * a0) * k) / sides;
				const h = k === 0 || k === sides ? 0.003 : high;
				const [cu, cw] = over(PORT.x + radius * Math.cos(a), radius * Math.sin(a), h);
				shell(cu, cw, p, n);
				pos.push(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h);
			}
		for (let k = 0; k < sides; k++)
			for (let j = 0; j < rings.length - 1; j++) {
				const a = k * rings.length + j;
				const b = a + rings.length;
				idx.push(a, b + 1, a + 1, a, b, b + 1);
			}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setIndex(idx);
		const flat = g.toNonIndexed();
		flat.computeVertexNormals();
		parts.add('chrome', flat);
	}

	// The cerebellum, from the drawing's own curves (cerebellum.ts): a lobe of wound copper and the blue lid that sits on
	// it, with its lights. They are one thing: it dips as each pass comes down, and comes back.
	const cb = lid();
	return { parts, drum: { ...lobe(), blue: mergeGeometries(cb.blue)!, cyan: mergeGeometries(cb.lights)! } };
}

