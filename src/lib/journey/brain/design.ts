/*
 * The design of one half of the brain, as Neo Mohsenvand drew it: where each cushion's middle line runs and how wide
 * it is, and where every machine sits. The side view is the master, so most of it is written in that drawing's own
 * pixels, traced from it; what the side view cannot show, the roll into the fissure and the faces at the front and
 * back, is written as places on the chart (see shell.ts) and follows the other three drawings.
 *
 * The cushions all flow one way, as in the drawings: each starts along the fissure on top and runs forward and down
 * over the side, in a long S. The machines are drawn where the drawing has them, and then each settles into the pocket
 * or channel the cushions leave there (see `settle`), so nothing is built until it fits.
 */
import { chartStep, locate, RIM, shell, silhouette, CX, CY, type V3 } from './shell';
import { envelope, SLEEVE, type Machine, type Spot } from './machines';
import { through, type Ball, type Gyrus, type Tone } from './solve';

/** The side drawing's scale and middle: its pixels to the brain's units. */
const PX = 97.7;
const MID_X = 834.5;
const MID_Y = 416;
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

/** The same for the drawing from above (front at the top of the picture; either half of it). */
export function fromTop(x: number, y: number): [number, number] {
	const tx = (307 - y) / 54;
	const tz = Math.abs(x - 548.5) / 53.4;
	return seen((p) => [p[0], p[2]], [tx, tz], locate(tx, 3.2, tz));
}

/** The place on the top of the core over which a point stands, `high` off it, that is at x and z seen from above. */
export function over(x: number, z: number, high: number): [number, number] {
	return seen((p) => [p[0], p[2]], [x, z], locate(x, 3.4, z), high);
}

/** The same for the drawing from the front, and from the back. */
export function fromFront(x: number, y: number): [number, number] {
	const tz = Math.abs(x - 551) / 72.2;
	const ty = 3.92 - (y - 18) / 64.9;
	return seen((p) => [p[2], p[1]], [tz, ty], locate(4.6, ty, tz));
}
export function fromBack(x: number, y: number): [number, number] {
	const tz = Math.abs(x - 550) / 66.7;
	const ty = 3.92 - (y - 20) / 64.9;
	return seen((p) => [p[2], p[1]], [tz, ty], locate(-4.6, ty, tz));
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
/** A place given on the chart, with its half-width in the brain's units. */
export const C = (u: number, v: number, w: number): [number, number, number] => [u, v, w];

/** How far round the crest each direction of the chart is, every tenth of a degree, starting at the front tip and going up over the top. */
const ROUND: number[] = (() => {
	const table = [0];
	const was: V3 = [0, 0, 0];
	for (let i = 0; i <= 3600; i++) {
		const a = (i * Math.PI) / 1800;
		shell(Math.cos(a), Math.sin(a), at, out);
		if (i) table.push(table[i - 1] + Math.hypot(at[0] - was[0], at[1] - was[1], at[2] - was[2]));
		was[0] = at[0];
		was[1] = at[1];
		was[2] = at[2];
	}
	return table;
})();
/** All the way round the crest, where the core turns over into the fissure. */
export const AROUND = ROUND[3600];

/**
 * A place given by the fissure: `s` is how far round the crest it is, in the brain's units, from the front tip up over
 * the top (the crown is at about 6.4, the back tip 13.1, the middle of the underside 19) and `d` how far in from the
 * crest over the side it lies (below zero, round the roll into the fissure). With its half-width.
 */
const R = (s: number, d: number, w: number): [number, number, number] => {
	s = ((s % AROUND) + AROUND) % AROUND;
	let i = 0;
	while (i < 3600 && ROUND[i + 1] < s) i++;
	const a = ((i + (s - ROUND[i]) / (ROUND[i + 1] - ROUND[i] || 1)) * Math.PI) / 1800;
	const rho = 1 - d / 4.4;
	return [rho * Math.cos(a), rho * Math.sin(a), w];
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
 * The cushions all flow one way, as the drawings have them: each comes off the fissure and runs forward and down over
 * the side in a long S, nested inside the one before. Round the front they take the fissure's edge in turn.
 */
export const GYRI: Gyrus[] = [
	// Along the fissure at the back and over the crown: the blue rim.
	gyrus('N', 'blue', [R(13.3, -0.08, 0.26), R(12.4, -0.1, 0.32), R(11.2, -0.1, 0.32), R(10.0, -0.1, 0.32), R(8.8, -0.1, 0.32), R(7.9, -0.1, 0.3), R(7.3, -0.12, 0.24)]),
	// The great yellow S: up the back of the head inside the rim, over the top, and down the middle of the side.
	gyrus('A', 'yellow', [
		R(13.1, 0.5, 0.26), R(12.5, 0.52, 0.31), R(11.8, 0.55, 0.33), R(11.0, 0.62, 0.34), R(10.2, 0.62, 0.35), R(9.4, 0.58, 0.36), S(642, 82, 30), S(681, 81, 30), S(720, 88, 30),
		S(759, 102, 32), S(796, 133, 33), S(826, 171, 30), S(865, 193, 29), S(900, 216, 30), S(937, 233, 34), S(973, 252, 38), S(999, 290, 40), S(1029, 328, 37), S(1068, 352, 26),
		S(1107, 367, 16), S(1146, 384, 9)
	]),
	// The blue inside it, from the back of the head round the eye's pocket to the underside at the front, and on along the underside.
	gyrus('B', 'blue', [
		R(10.9, 1.22, 0.2), S(492, 181, 20), S(529, 155, 24), S(567, 142, 28), S(605, 141, 33), S(643, 147, 35), S(672, 177, 31), S(693, 214, 27), S(730, 246, 25), S(768, 258, 24),
		S(806, 268, 23), S(844, 282, 23), S(879, 307, 23), S(900, 341, 24), S(931, 371, 26), S(969, 381, 27), S(1006, 392, 27), S(1038, 415, 29), S(1076, 436, 30), S(1113, 467, 32),
		S(1132, 504, 33), S(1133, 542, 29), S(1119, 580, 24), S(1112, 618, 20), R(22.15, 0.82, 0.24), R(21.75, 0.5, 0.26), R(21.4, 0.34, 0.25)
	]),
	// The blue over the great S, from the crown down past the small eye, round the block at the front, to the fissure underneath.
	gyrus('C', 'blue', [
		R(7.65, 0.4, 0.26), S(745, 52, 20), S(783, 52, 22), S(821, 59, 23), S(859, 81, 24), S(896, 115, 22), S(932, 151, 18), S(970, 176, 15), S(1007, 205, 13), S(1041, 236, 13),
		S(1068, 272, 15), S(1101, 300, 19), S(1136, 318, 20), S(1172, 334, 20), S(1205, 363, 22), S(1224, 401, 21), S(1236, 439, 22), S(1269, 463, 23), R(24.7, 0.97, 0.26), R(24.3, 0.84, 0.25),
		R(23.9, 0.84, 0.25), R(23.5, 0.86, 0.26), R(23.1, 0.58, 0.28), R(22.75, 0.22, 0.27)
	]),
	// The yellow down from the crown to the small eye.
	gyrus('D', 'yellow', [
		R(6.3, 0.52, 0.26), S(869, 45, 26), S(907, 58, 28), S(945, 82, 28), S(983, 104, 27), S(1019, 124, 28), S(1042, 157, 32), S(1058, 195, 28), S(1074, 235, 22),
		S(1088, 264, 16)
	]),
	// In front of the intake the yellow takes the fissure's edge, as the blue does behind it, and the blue runs beside it
	// and takes the edge in turn round the tip.
	gyrus('F', 'blue', [
		R(5.1, 0.58, 0.22), R(4.5, 0.64, 0.24), R(3.8, 0.66, 0.24), R(3.1, 0.68, 0.24), R(2.4, 0.64, 0.24), R(1.8, 0.44, 0.26), R(1.2, 0.2, 0.3), R(0.5, 0.14, 0.31), R(-0.1, 0.14, 0.28)
	]),
	gyrus('R', 'yellow', [R(5.2, -0.1, 0.26), R(4.6, -0.1, 0.31), R(3.9, -0.1, 0.32), R(3.2, -0.1, 0.32), R(2.5, -0.08, 0.3), R(1.95, -0.04, 0.24)]),
	// The yellow arch over the small eye, which goes on down the front and takes the fissure after the blue.
	gyrus('D2', 'yellow', [
		S(1094, 196, 12), R(2.95, 1.5, 0.3), R(2.55, 1.32, 0.36), R(2.05, 1.26, 0.38), R(1.55, 1.24, 0.38), R(1.05, 1.16, 0.36), R(0.55, 0.9, 0.33), R(0.1, 0.68, 0.3), R(-0.4, 0.42, 0.29),
		R(-0.9, 0.22, 0.29), R(-1.45, 0.16, 0.26)
	]),
	// The yellow arch at the back, over the block there.
	gyrus('E', 'yellow', [
		R(12.75, 1.18, 0.24), S(387, 338, 28), S(422, 305, 34), S(459, 283, 38), S(496, 271, 41), S(533, 270, 44), S(566, 296, 42), S(580, 333, 40), S(590, 372, 34), S(592, 400, 26)
	]),
	// The long yellow under the eye.
	gyrus('T', 'yellow', [
		S(490, 485, 42), S(523, 476, 43), S(562, 478, 42), S(601, 483, 40), S(640, 496, 39), S(679, 517, 38), S(718, 537, 38), S(755, 553, 37), S(794, 556, 37), S(833, 557, 37),
		S(872, 562, 39), S(911, 567, 43), S(950, 587, 48), S(989, 619, 49), S(1028, 631, 43), S(1055, 629, 33)
	]),
	// Low on the back of the head: a blue hairpin, in two, with a yellow lobe between its legs.
	gyrus('K', 'blue', [R(14.35, 0.2, 0.24), R(13.8, 0.42, 0.28), R(13.2, 1.0, 0.28), R(12.98, 1.36, 0.22)]),
	gyrus('K2', 'blue', [R(13.05, 1.78, 0.2), R(13.5, 1.8, 0.23), R(14.0, 1.68, 0.24), R(14.5, 1.5, 0.22)]),
	gyrus('L', 'yellow', [R(13.75, 1.16, 0.22), R(14.1, 0.94, 0.27), R(14.5, 0.78, 0.29), R(14.9, 0.5, 0.28), R(15.25, 0.18, 0.24)]),
	gyrus('U', 'yellow', [S(1222, 550, 12), S(1193, 561, 15), S(1167, 580, 10)])
];

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
	{ kind: 'eye', name: 'big', at: eyeAt(744, 446), r: 0.47, dish: 0.76 },
	{ kind: 'eye', name: 'small', at: eyeAt(1147, 259), r: 0.3, dish: 0.56 },
	// Copper: over the big eye, low at the back, and by the block at the front.
	{ kind: 'coil', name: 'over the eye', path: [coilAt(722, 352), coilAt(758, 350), coilAt(794, 356), coilAt(826, 370)], r: 0.27 },
	{ kind: 'coil', name: 'at the back', path: [coilAt(466, 578), coilAt(522, 561), coilAt(588, 549)], r: 0.3 },
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
	{ kind: 'link', name: 'back', pins: [pinAt(640, 556), pinAt(700, 640)], r: 0.13 },
	{ kind: 'link', name: 'front', pins: [pinAt(1190, 520), pinAt(1226, 500)], r: 0.11 }
];

/*
 * A drawing is not a machine: drawn, a pipe may lie half under the cushion beside it. So every machine but the eyes
 * settles before anything is built. Each place on its line moves over the core, away from the nearest cushion's body,
 * until the machine has room there or stands midway between the cushions on either side; what room it still lacks,
 * the cushions on both sides then give in equal shares when they are solved. The eyes stay where they are drawn, and
 * the cushions part round them.
 */

/** Every cushion's designed body, as balls along its middle line. */
const BODIES: number[] = GYRI.flatMap((g) =>
	through(g.line, 8).flatMap(([u, v, w]) => {
		shell(u, v, at, out);
		return [at[0], at[1], at[2], w];
	})
);
const jac: number[] = [];

/** How far a place on the core is outside every cushion's designed body, and which ball of them is nearest. */
function roomAt(u: number, v: number): [number, number] {
	shell(u, v, at, out);
	let room = Infinity;
	let k = 0;
	for (let i = 0; i < BODIES.length; i += 4) {
		const d = Math.hypot(at[0] - BODIES[i], at[1] - BODIES[i + 1], at[2] - BODIES[i + 2]) - BODIES[i + 3];
		if (d < room) {
			room = d;
			k = i;
		}
	}
	return [room, k];
}

/** The nearest place to a spot, within reach, that is `need` clear of every cushion's body, or as clear as can be had; and how clear it is. */
function settled(spot: Spot, need: number, most = 0.45): [Spot, number] {
	let [u, v] = spot;
	let best: Spot = [u, v];
	let bestRoom = -Infinity;
	let gone = 0;
	for (let step = 0; step < 60 && gone < most; step++) {
		const [room, k] = roomAt(u, v);
		if (room > bestRoom) {
			bestRoom = room;
			best = [u, v];
		}
		if (room >= need) break;
		// Straight away from the nearest body, along the core.
		const away: V3 = [at[0] - BODIES[k], at[1] - BODIES[k + 1], at[2] - BODIES[k + 2]];
		const lift = away[0] * out[0] + away[1] * out[1] + away[2] * out[2];
		const flat: V3 = [away[0] - out[0] * lift, away[1] - out[1] * lift, away[2] - out[2] * lift];
		const far = Math.hypot(flat[0], flat[1], flat[2]) || 1;
		const stride = Math.min(0.02, need - room);
		const [du, dv] = chartStep(u, v, (flat[0] / far) * stride, (flat[1] / far) * stride, (flat[2] / far) * stride, jac);
		u += du;
		v += dv;
		gone += stride;
	}
	return [best, bestRoom];
}

const CLEAR = 0.07;
/** A machine too big for its channel is made smaller, but never by more than this share: the cushions give the rest. */
const LEAST = 0.8;

/** A place two machines share settles once, for both. */
const shared = new Map<Spot, Spot>();
function put(q: Spot, need: number): Spot {
	if (q !== ARCH) return settled(q, need)[0];
	if (!shared.has(q)) shared.set(q, settled(q, need)[0]);
	return shared.get(q)!;
}

function settle(m: Machine): Machine {
	if (m.kind === 'eye') return m;
	if (m.kind === 'coil') {
		// A coil is stiff: it moves as one, by as much as its places would move on average, and is then as thick as that leaves room for.
		const to = m.path.map((q) => settled(q, m.r + SLEEVE + CLEAR)[0]);
		const du = to.reduce((sum, q, i) => sum + q[0] - m.path[i][0], 0) / to.length;
		const dv = to.reduce((sum, q, i) => sum + q[1] - m.path[i][1], 0) / to.length;
		const path = m.path.map(([u, v]): Spot => [u + du, v + dv]);
		const room = Math.min(...path.map(([u, v]) => roomAt(u, v)[0]));
		return { ...m, path, r: Math.min(m.r, Math.max(m.r * LEAST, room - SLEEVE - CLEAR)) };
	}
	if (m.kind === 'pipe') {
		const to = m.path.map((q) => settled(q, m.r + SLEEVE + CLEAR));
		const room = Math.min(...to.map(([, r]) => r));
		return { ...m, path: to.map(([q]) => q), r: Math.min(m.r, Math.max(m.r * LEAST, room - SLEEVE - CLEAR)) };
	}
	if (m.kind === 'arm') return { ...m, path: m.path.map((q, i) => put(q, m.w[0] + ((m.w[1] - m.w[0]) * i) / (m.path.length - 1) + CLEAR)) };
	if (m.kind === 'link') return { ...m, pins: m.pins.map((q) => put(q, m.r + CLEAR)) };
	const [to] = settled(m.at, Math.hypot(m.size[0], m.size[1]) * 0.42 + CLEAR, 0.2);
	return { ...m, at: to, toward: [m.toward[0] + to[0] - m.at[0], m.toward[1] + to[1] - m.at[1]] };
}

/** The works of one half, each settled into its pocket or channel. */
export const MACHINES: Machine[] = DRAWN.map(settle);

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
/** The copper drum of the cerebellum under the back of each half: its middle, its radius, and half its height. */
export const DRUM = { at: [-3.0, -3.27, 1.78] as V3, r: 1.26, half: 0.62 };
/** The axle across the top of the brainstem that both halves ride on: where it is, and how far it reaches each way. */
export const AXLE = { x: 0.35, y: -2.84, reach: 1.62, r: 0.085 };

/** A cushion leans in over its own foot as it rounds the roll, so the intake keeps the feet this much further off. */
const BULGE = 0.14;

const between: Ball[] = [];
for (let y = PORT.floor + 0.3; y <= PORT.rim; y += 0.1) between.push({ at: [PORT.x, y, 0], r: PORT.r + BULGE + 0.1 });
// The top of the brainstem, under the middle: its ribs, and the axle across them.
for (const x of [0.2, 0.75, 1.3]) for (const z of [0.2, 0.75, 1.25]) between.push({ at: [x, AXLE.y + 0.1, z], r: 0.42 });
// The blocks in the fissure are a little wider than the fissure, so the cushions' walls part round each.
for (const b of FISSURE_BLOCKS) {
	const a = (b.lean * Math.PI) / 180;
	for (let k = -1; k <= 1; k++) between.push({ at: [b.at[0] + Math.cos(a) * k * b.size[0] * 0.3, b.at[1] + Math.sin(a) * k * b.size[0] * 0.3, 0], r: b.size[2] / 2 + 0.2 });
}

/** What the cushions must keep clear of. */
export const BALLS: Ball[] = [...MACHINES.flatMap(envelope), ...between];

/** The rows of cyan lights let into the blue cushions: which cushion, and how far along it. */
export const ROWS = [
	{ gyrus: 'B', at: 0.16 },
	{ gyrus: 'B', at: 0.6 },
	{ gyrus: 'C', at: 0.55 }
];
