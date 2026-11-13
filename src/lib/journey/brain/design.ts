/*
 * The design of one half of the brain, as Neo Mohsenvand drew it: which cushion is which, and where every machine sits.
 * The cushions' edges are the drawings' own (tones.ts); what is written here is the line down the middle of each. The
 * side view is the master: its cushions' lines were traced from it by hand, in that drawing's own pixels. What it cannot
 * see, the top, the front and the back, has its lines from the other three drawings by measuring (lines.ts), and the
 * pipes in the channels between cushions likewise (channels.ts).
 *
 * The machines are drawn where the side drawing has them, and then each settles into the pocket or channel the
 * cushions leave there (see `settle`), so nothing is built until it fits.
 */
import { chartStep, locate, RIM, shell, silhouette, stretch, CX, CY, type V3 } from './shell';
import { LINES } from './lines';
import { clearOfDrawn, MID_X, MID_Y, PX } from './tones';
import { TRACED } from './traced';
import { envelope, SLEEVE, trace, type Machine, type Spot } from './machines';
import type { Ball, Gyrus, Tone } from './solve';

/** Cushions stand about this far off the core, which is what the drawing shows the top of. */
const TOP = 0.42;
/** A traced line follows the bright middle of a cushion; its foot is this many pixels further out. */
const FLANK = 12;

const at: V3 = [0, 0, 0];
const out: V3 = [0, 0, 0];

/** The place on the chart whose cushion top a view shows at a given spot: `see` is what the view measures of a point. */
function seen(see: (p: V3) => [number, number], want: [number, number], guess: [number, number], high = TOP): [number, number] {
	let [u, v] = guess;
	const f = (a: number, b: number): [number, number] => {
		shell(a, b, at, out);
		const [x, y] = see([at[0] + out[0] * high, at[1] + out[1] * high, at[2] + out[2] * high]);
		return [x - want[0], y - want[1]];
	};
	// Newton's method on the two numbers, never stepping far at once, and never over the rim.
	for (let i = 0; i < 30; i++) {
		const [fx, fy] = f(u, v);
		if (Math.abs(fx) + Math.abs(fy) < 1e-6) break;
		const e = 1e-4;
		const [ax, ay] = f(u + e, v);
		const [bx, by] = f(u, v + e);
		const a = (ax - fx) / e;
		const c = (ay - fy) / e;
		const b = (bx - fx) / e;
		const d = (by - fy) / e;
		const det = a * d - b * c || 1e-9;
		let du = -(d * fx - b * fy) / det;
		let dv = -(a * fy - c * fx) / det;
		const far = Math.hypot(du, dv);
		if (far > 0.15) {
			du *= 0.15 / far;
			dv *= 0.15 / far;
		}
		u += du;
		v += dv;
		const rho = Math.hypot(u, v);
		if (rho > RIM - 0.01) {
			u *= (RIM - 0.01) / rho;
			v *= (RIM - 0.01) / rho;
		}
	}
	return [u, v];
}

/** The place on the chart whose cushion top the side drawing shows at a pixel, or of something that stands only so high off the core. */
export function fromSide(x: number, y: number, high = TOP): [number, number] {
	const tx = (x - MID_X) / PX;
	const ty = (MID_Y - y) / PX;
	const theta = Math.atan2(ty - CY, tx - CX);
	const rho = (Math.asin(Math.min(0.97, Math.hypot(tx - CX, ty - CY) / silhouette(theta))) * 2) / Math.PI;
	return seen((p) => [p[0], p[1]], [tx, ty], [rho * Math.cos(theta), rho * Math.sin(theta)], high);
}

/** The place on the top of the core over which a point stands, `high` off it, that is at x and z seen from above. */
export function over(x: number, z: number, high: number): [number, number] {
	return seen((p) => [p[0], p[2]], [x, z], locate(x, 3.4, z), high);
}

/** The place on the underside of the core under which a point hangs, `low` off it, that is at x and z seen from below; or null where the core has no underside there. */
export function beneath(x: number, z: number, low = 0): [number, number] | null {
	const [u, v] = seen((p) => [p[0], p[2]], [x, z], locate(x, -3.4, z), low);
	shell(u, v, at, out);
	return out[1] < -0.05 && Math.hypot(at[0] + out[0] * low - x, at[2] + out[2] * low - z) < 0.02 ? [u, v] : null;
}

/**
 * A place traced from the side drawing: its pixel and the half-width of the bright middle there, in pixels. That is the
 * width the drawing shows, looking across the brain; where the cushion lies on a part of the core that turns away from
 * the drawing, it is really wider than it looks, and is made so when its line is known (see `gyrus`).
 */
const drawnFromSide = new WeakSet<number[]>();
const S = (x: number, y: number, half: number): [number, number, number] => {
	const q: [number, number, number] = [...fromSide(x, y), (half + FLANK) / PX];
	drawnFromSide.add(q);
	return q;
};
/** A cushion from its line. Widths traced from the side drawing are widths as seen: each is made as much wider as the cushion there is turned away. */
function gyrus(name: string, tone: Tone, line: [number, number, number][], height?: number): Gyrus {
	const places = line.map(([u, v]) => {
		const p: V3 = [0, 0, 0];
		const n: V3 = [0, 0, 0];
		shell(u, v, p, n);
		return { p, n };
	});
	const wide = line.map((q, i) => {
		if (!drawnFromSide.has(q)) return q[2];
		// Across the cushion: square to the way its line runs, on the core. The drawing sees only the part of that which lies in its plane.
		const a = places[Math.max(0, i - 1)].p;
		const b = places[Math.min(line.length - 1, i + 1)].p;
		const n = places[i].n;
		const along: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const across: V3 = [n[1] * along[2] - n[2] * along[1], n[2] * along[0] - n[0] * along[2], n[0] * along[1] - n[1] * along[0]];
		const far = Math.hypot(across[0], across[1], across[2]) || 1;
		return Math.min(Math.max(q[2], 0.6), q[2] / Math.max(0.55, Math.hypot(across[0], across[1]) / far));
	});
	return { name, tone, line: line.map(([u, v], i) => [u, v, wide[i]]), height };
}

/*
 * The cushions the side drawing has. They all flow one way: each comes down off the top and runs forward and down over
 * the side in a long S, nested inside the one before.
 */
export const SIDE: Gyrus[] = [
	// The great yellow S: over the top and down the middle of the side.
	gyrus('A', 'yellow', [
		S(642, 82, 30), S(681, 81, 30), S(720, 88, 30),
		S(759, 102, 32), S(796, 133, 33), S(826, 171, 30), S(865, 193, 29), S(900, 216, 30), S(937, 233, 34), S(973, 252, 38), S(999, 290, 40), S(1029, 328, 37), S(1068, 352, 26),
		S(1107, 367, 16), S(1146, 384, 9)
	]),
	// The blue inside it, from the back of the head round the eye's pocket to the underside at the front.
	gyrus('B', 'blue', [
		S(492, 181, 20), S(529, 155, 24), S(567, 142, 28), S(605, 141, 33), S(643, 147, 35), S(672, 177, 31), S(693, 214, 27), S(730, 246, 25), S(768, 258, 24),
		S(806, 268, 23), S(844, 282, 23), S(879, 307, 23), S(900, 341, 24), S(931, 371, 26), S(969, 381, 27), S(1006, 392, 27), S(1038, 415, 29), S(1076, 436, 30), S(1113, 467, 32),
		S(1132, 504, 33), S(1133, 542, 29), S(1119, 580, 24), S(1112, 618, 20)
	]),
	// The blue over the great S, down past the small eye and round the block at the front.
	gyrus('C', 'blue', [
		S(859, 81, 24), S(896, 115, 22), S(932, 151, 18), S(970, 176, 15), S(1007, 205, 13), S(1041, 236, 13),
		S(1068, 272, 15), S(1101, 300, 19), S(1136, 318, 20), S(1172, 334, 20), S(1205, 363, 22), S(1224, 401, 21), S(1236, 439, 22), S(1269, 463, 23)
	]),
	// The yellow down from the crown to the small eye.
	gyrus('D', 'yellow', [
		S(869, 45, 26), S(907, 58, 28), S(945, 82, 28), S(983, 104, 27), S(1019, 124, 28), S(1042, 157, 32), S(1058, 195, 28), S(1074, 235, 22),
		S(1088, 264, 16)
	]),
	// The yellow arch at the back, over the block there.
	gyrus('E', 'yellow', [
		S(387, 338, 28), S(422, 305, 34), S(459, 283, 38), S(496, 271, 41), S(533, 270, 44), S(566, 296, 42), S(580, 333, 40), S(590, 372, 34), S(592, 400, 26)
	]),
	// The long yellow under the eye.
	gyrus('T', 'yellow', [
		S(490, 485, 42), S(523, 476, 43), S(562, 478, 42), S(601, 483, 40), S(640, 496, 39), S(679, 517, 38), S(718, 537, 38), S(755, 553, 37), S(794, 556, 37), S(833, 557, 37),
		S(872, 562, 39), S(911, 567, 43), S(950, 587, 48), S(989, 619, 49), S(1028, 631, 43), S(1055, 629, 33)
	]),
	gyrus('U', 'yellow', [S(1222, 550, 12), S(1193, 561, 15), S(1167, 580, 10)])
];

/**
 * Every cushion of one half: those, and the ones the drawings from above, from the front and from the back have where the
 * side drawing cannot see, each by the line down its middle as the drawings have it (lines.ts, found by measuring).
 */
export const GYRI: Gyrus[] = [...SIDE, ...LINES.map((l) => gyrus(l.name, l.tone, l.line as [number, number, number][]))];

/**
 * A place the side drawing shows, by its pixel. The drawing looks across the brain, and a thing that stands high off
 * the core is drawn further from the middle than the place it stands on: so each kind of machine is found by the height
 * of what the drawing shows of it. An eye's face, a coil's axis, a block's top, a pipe's back, an arm, a pin.
 */
const place = (high: number) => (x: number, y: number): Spot => fromSide(x, y, high);
const eyeAt = place(0.3);
const coilAt = place(0.32);
const blockAt = place(0.3);
const pipeAt = place(0.16);
const armAt = place(0.12);
const pinAt = place(0.1);

/** Where the arm along the top of the yellow arch ends and the links down to the coil begin: one pivot holds both. */
const ARCH: Spot = pinAt(607, 205);

/** The works in the pockets and channels of one half, where the side drawing has them. */
const DRAWN: Machine[] = [
	{ kind: 'eye', name: 'big', at: eyeAt(736, 456), r: 0.84 },
	{ kind: 'eye', name: 'small', at: eyeAt(1158, 254), r: 0.55 },
	// Copper: over the big eye, low at the back, and by the block at the front.
	{ kind: 'coil', name: 'over the eye', path: [coilAt(722, 352), coilAt(758, 350), coilAt(794, 356), coilAt(826, 370)], r: 0.27 },
	{ kind: 'coil', name: 'at the back', path: [coilAt(470, 566), coilAt(524, 550), coilAt(586, 539)], r: 0.25 },
	{ kind: 'coil', name: 'at the front', path: [coilAt(1166, 426), coilAt(1182, 458), coilAt(1195, 492)], r: 0.17 },
	// Electronics: under the yellow arch at the back, beside the big eye, and at the front.
	{ kind: 'block', name: 'back', at: blockAt(478, 383), toward: blockAt(478, 300), size: [0.7, 0.44, 0.36], face: 'bars', count: 3 },
	{ kind: 'block', name: 'back fins', at: blockAt(534, 385), toward: blockAt(534, 300), size: [0.4, 0.3, 0.3], face: 'fins', count: 4 },
	{ kind: 'block', name: 'eye fins', at: blockAt(922, 481), toward: blockAt(1020, 496), size: [0.34, 0.38, 0.3], face: 'fins', count: 5 },
	{ kind: 'block', name: 'eye cells', at: blockAt(962, 488), toward: blockAt(1020, 499), size: [0.26, 0.38, 0.34], face: 'cells', count: 3 },
	{ kind: 'block', name: 'eye bars', at: blockAt(1026, 506), toward: blockAt(1026, 420), size: [0.6, 0.48, 0.38], face: 'bars', count: 2 },
	{ kind: 'block', name: 'front', at: blockAt(1260, 387), toward: blockAt(1260, 300), size: [0.56, 0.44, 0.36], face: 'bars', count: 3 },
	// Pipes: down the channel between the great yellow S and the blue under it, and under the long yellow.
	{ kind: 'pipe', name: 'channel', path: [pipeAt(704, 130), pipeAt(735, 166), pipeAt(772, 204), pipeAt(812, 219), pipeAt(852, 234), pipeAt(888, 256), pipeAt(908, 284)], r: 0.09, lit: [0.5, 0.74] },
	{ kind: 'pipe', name: 'under', path: [pipeAt(704, 598), pipeAt(750, 600), pipeAt(800, 601), pipeAt(852, 611), pipeAt(896, 637)], r: 0.105, lit: [0.3, 0.6] },
	// The chrome arm from the big eye, with its strip of light, and the one along the top of the yellow arch.
	{ kind: 'arm', name: 'eye', path: [armAt(846, 416), armAt(880, 428), armAt(920, 436), armAt(962, 442), armAt(1000, 451)], w: [0.16, 0.085] },
	{ kind: 'arm', name: 'arch', path: [armAt(505, 214), armAt(545, 205), armAt(578, 201), ARCH], w: [0.07, 0.1], held: true },
	// Links: from the end of that arm down to the coil over the eye, low at the back, and by the block at the front.
	{ kind: 'link', name: 'arch', pins: [ARCH, pinAt(652, 290), pinAt(700, 306)], r: 0.12 },
	{ kind: 'link', name: 'back', pins: [pinAt(640, 552), pinAt(682, 600)], r: 0.12 },
	{ kind: 'link', name: 'front', pins: [pinAt(1190, 520), pinAt(1226, 500)], r: 0.11 }
];

/*
 * The cushions' edges are the drawing's own (see tones.ts), so the pockets and channels between them are the drawing's
 * too. Every machine settles into its pocket before anything is built: each place on its line moves over the core,
 * the clearest way, until the machine has its clearance from every drawn cushion, and a machine too big for its
 * channel is made a little smaller.
 */

const jac: number[] = [];

/** What has settled already: each machine after it keeps clear of these too. */
const settledSoFar: Ball[] = [];

/** How far a place on the core is outside every cushion the drawing has (below zero, under one), and every machine that has settled. */
function roomAt(u: number, v: number): number {
	shell(u, v, at, out);
	let room = clearOfDrawn(at, out) ?? 9;
	for (const b of settledSoFar) room = Math.min(room, Math.hypot(at[0] - b.at[0], at[1] - b.at[1], at[2] - b.at[2]) - b.r + CLEAR - 0.02);
	return room;
}

/** The nearest place to a spot, within reach, that is `need` clear of every drawn cushion, or as clear as can be had; and how clear it is. */
function settled(spot: Spot, need: number, most = 0.45): [Spot, number] {
	let [u, v] = spot;
	let room = roomAt(u, v);
	let gone = 0;
	const stride = 0.02;
	while (room < need && gone < most) {
		// Whichever way along the core is clearest, a stride at a time; and no further once no way is clearer.
		stretch(u, v, jac);
		const along = Math.hypot(jac[0], jac[1], jac[2]) || 1;
		const t: V3 = [jac[0] / along, jac[1] / along, jac[2] / along];
		shell(u, v, at, out);
		const b: V3 = [out[1] * t[2] - out[2] * t[1], out[2] * t[0] - out[0] * t[2], out[0] * t[1] - out[1] * t[0]];
		let best = room;
		let to: Spot | null = null;
		for (let k = 0; k < 12; k++) {
			const c = Math.cos((k * Math.PI) / 6) * stride;
			const d = Math.sin((k * Math.PI) / 6) * stride;
			const [du, dv] = chartStep(u, v, t[0] * c + b[0] * d, t[1] * c + b[1] * d, t[2] * c + b[2] * d, jac);
			const there = roomAt(u + du, v + dv);
			if (there > best) {
				best = there;
				to = [u + du, v + dv];
			}
		}
		if (!to) break;
		[u, v] = to;
		room = best;
		gone += stride;
	}
	return [[u, v], room];
}

const CLEAR = 0.07;

/** A place two machines share settles once, for both. */
const shared = new Map<Spot, Spot>();
function put(q: Spot, need: number): Spot {
	if (q !== ARCH) return settled(q, need)[0];
	if (!shared.has(q)) shared.set(q, settled(q, need)[0]);
	return shared.get(q)!;
}

function settle(m: Machine): Machine {
	if (m.kind === 'eye') {
		// An eye's housing fills its pocket: it sits where the pocket is widest near where it is drawn, as large as that lets it be.
		const [to, room] = settled(m.at, m.r + CLEAR, 0.2);
		return { ...m, at: to, r: Math.min(m.r, room - CLEAR) };
	}
	if (m.kind === 'coil') {
		// A coil is stiff: it moves as one, a little at a time, the way its places would on average, and is then as thick as
		// the room it has found. The cushions are the drawing's: it is the coil that gives.
		let path = m.path;
		for (let round = 0; round < 24; round++) {
			const to = path.map((q) => settled(q, m.r + SLEEVE + CLEAR, 0.04)[0]);
			const du = to.reduce((sum, q, i) => sum + q[0] - path[i][0], 0) / to.length;
			const dv = to.reduce((sum, q, i) => sum + q[1] - path[i][1], 0) / to.length;
			if (Math.hypot(du, dv) < 1e-5) break;
			path = path.map(([u, v]): Spot => [u + du, v + dv]);
		}
		const room = Math.min(...trace(path, 0.05).map((st) => roomAt(st.u, st.v)));
		return { ...m, path, r: Math.max(0.09, Math.min(m.r, room - SLEEVE - CLEAR)) };
	}
	if (m.kind === 'pipe') {
		const path = m.path.map((q) => settled(q, m.r + SLEEVE + CLEAR)[0]);
		const room = Math.min(...trace(path, 0.05).map((st) => roomAt(st.u, st.v)));
		return { ...m, path, r: Math.max(0.05, Math.min(m.r, room - SLEEVE - CLEAR)) };
	}
	if (m.kind === 'arm') return { ...m, path: m.path.map((q, i) => put(q, m.w[0] + ((m.w[1] - m.w[0]) * i) / (m.path.length - 1) + CLEAR)) };
	if (m.kind === 'link') return { ...m, pins: m.pins.map((q) => put(q, m.r + CLEAR)) };
	// A block sits where its pocket is widest near where it is drawn, and is made smaller if the pocket is.
	const half = Math.hypot(m.size[0], m.size[1]) * 0.42;
	const [to, room] = settled(m.at, half + CLEAR, 0.2);
	const k = Math.max(0.45, Math.min(1, (room - CLEAR) / half));
	return { ...m, at: to, toward: [m.toward[0] + to[0] - m.at[0], m.toward[1] + to[1] - m.at[1]], size: [m.size[0] * k, m.size[1] * k, m.size[2] * Math.max(k, 0.7)] };
}

/** The works of one half, each settled into its pocket or channel, in turn: each keeps clear of those before it. */
export const MACHINES: Machine[] = DRAWN.map((m) => {
	const placed = settle(m);
	// (The arm along the arch and the links below it share a pivot: they are one thing, and do not keep clear of each other.)
	if (!(m.kind === 'arm' && m.name === 'arch')) settledSoFar.push(...envelope(placed));
	return placed;
});

/*
 * What stands in the fissure, between the halves, and under them. The cushions of each half are solved to keep clear of
 * these too, so they part round the intake and round each block exactly as they part round an eye.
 */

/** The intake, at the crown: its rim's height, the radius of its bezel and of its throat, and how deep the throat goes. */
export const PORT = { x: 0, rim: 3.99, r: 1.02, bore: 0.64, floor: 2.72 };
/**
 * What the intake's arms hold, in the brain's own frame, unless the world says otherwise: the hose's wheel over the
 * crown (its axle, its radius, and the hose's own), and the heights of the nozzle under it and of the nozzle's lip, where
 * the tokens fall free.
 */
export const HOSE = { wheel: [1.02, PORT.rim + 2.4, 0] as V3, wheelR: 0.6, hoseR: 0.42, nozzle: PORT.rim + 0.95, lip: PORT.rim + 0.5 };
/** Blocks of electronics standing in the fissure: where (x, y in the fissure's plane), which way is up for it, and its size (tall, deep, wide across the fissure). */
export const FISSURE_BLOCKS: { at: [number, number]; lean: number; size: V3; bars: number }[] = [
	{ at: [3.86, 1.84], lean: 46, size: [0.5, 0.5, 0.3], bars: 2 },
	{ at: [4.28, 1.2], lean: 30, size: [0.5, 0.5, 0.3], bars: 3 },
	{ at: [4.6, -0.68], lean: -14, size: [0.44, 0.44, 0.3], bars: 2 },
	{ at: [1.42, 3.3], lean: 97, size: [0.3, 0.32, 0.26], bars: 2 },
	{ at: [-1.72, 3.22], lean: 106, size: [0.3, 0.32, 0.26], bars: 2 }
];
/** The cerebellum under the back of each half: how far out from the fissure's middle its own middle is, and how wide it is for its length (from the drawing from behind). */
export const CEREBELLUM = { out: 1.36, wide: 0.72 };
/** The axle across the top of the brainstem that both halves ride on: where it is, and how far it reaches each way. */
export const AXLE = { x: 0.35, y: -2.84, reach: 1.62, r: 0.085 };

/** A cushion leans in over its own foot as it rounds the roll, so the intake keeps the feet this much further off. */
const BULGE = 0.14;

/** What stands between the halves and under them, as what the cushions keep clear of. */
export const BETWEEN: Ball[] = [];
for (let y = PORT.floor + 0.3; y <= PORT.rim; y += 0.1) BETWEEN.push({ at: [PORT.x, y, 0], r: PORT.r + BULGE + 0.1 });
// The top of the brainstem, under the middle: its ribs, and the axle across them.
for (const x of [0.2, 0.75, 1.3]) for (const z of [0.2, 0.75, 1.25]) BETWEEN.push({ at: [x, AXLE.y + 0.1, z], r: 0.42 });
// The cerebellum, as drawn, sits up under the back of the half in a recess of its own: the cushions there part round it,
// all the way round its brim.
{
	let x0 = Infinity;
	let x1 = -Infinity;
	let top = -Infinity;
	for (let i = 0; i < TRACED.brim.length; i += 2) {
		const x = (TRACED.brim[i] / 2 - MID_X) / PX;
		x0 = Math.min(x0, x);
		x1 = Math.max(x1, x);
		top = Math.max(top, (MID_Y - TRACED.brim[i + 1] / 2) / PX);
	}
	const mid = (x0 + x1) / 2;
	const half = (x1 - x0) / 2 + 0.06;
	for (const k of [0.3, 0.5, 0.7]) BETWEEN.push({ at: [x0 + (x1 - x0) * k, top - 1.02, CEREBELLUM.out], r: 1.1 });
	for (let k = 0; k < 14; k++) {
		const a = (k / 14) * Math.PI * 2;
		BETWEEN.push({ at: [mid + half * Math.cos(a), top - 0.3, CEREBELLUM.out + half * CEREBELLUM.wide * Math.sin(a)], r: 0.46 });
	}
}
// The blocks in the fissure are a little wider than the fissure, so the cushions' walls part round each.
for (const b of FISSURE_BLOCKS) {
	const a = (b.lean * Math.PI) / 180;
	for (let k = -1; k <= 1; k++) BETWEEN.push({ at: [b.at[0] + Math.cos(a) * k * b.size[0] * 0.3, b.at[1] + Math.sin(a) * k * b.size[0] * 0.3, 0], r: b.size[2] / 2 + 0.36 });
}

// The intake's saddle lies on the core round the intake, under the cushions there.
BETWEEN.push({ at: [PORT.x, PORT.rim - 0.8, 0], r: PORT.r + 0.82, low: true });

/** What the cushions must keep clear of. */
export const BALLS: Ball[] = [...MACHINES.flatMap(envelope), ...BETWEEN];

/** The rows of cyan lights let into the blue cushions: which cushion, and how far along it. */
export const ROWS = [
	{ gyrus: 'B', at: 0.16 },
	{ gyrus: 'B', at: 0.6 },
	{ gyrus: 'C', at: 0.55 }
];
