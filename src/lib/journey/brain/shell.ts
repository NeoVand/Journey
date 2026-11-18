/*
 * The brain's core, as an equation. One half is a dome over the fissure: seen from the side its outline is the drawing's,
 * it swells sideways as part of an ellipsoid, and where it comes back to the fissure it rolls over a round edge onto a
 * flat inner face. Every cushion and every machine is placed on this surface by its map, and stands along its normal, so
 * nothing here is sculpted: a point of the brain is a pair of numbers.
 *
 * The map is flat and round, like a chart of a hemisphere seen from its pole: the middle is the point of the half that
 * sticks out furthest sideways, a circle of radius 1 is the outline seen from the side, and the ring beyond it, out to
 * RIM, is the roll into the fissure. A direction on the chart is the direction the outline faces there. X is forward, Y up, Z sideways out of the fissure; this is the half with z > 0, and
 * the other is its mirror image.
 */

export type V3 = [number, number, number];

/** The middle of the side view's outline. */
export const CX = 0;
export const CY = 0.45;
/** Half the width of the fissure between the two cores, and the radius of the roll into it. */
export const FISSURE = 0.42;
export const ROLL = 0.45;
/** How far the dome swells sideways beyond the roll, at the middle. */
const DEPTH = 2.5;
/** The dome narrows towards the front by this share, as a brain does seen from above. */
const TAPER = 0.1;
/** How far a cushion stands off the core where the outline was measured. */
const SKIN = 0.42;
/** The chart's radius at the end of the roll, where the core's flat inner face begins. */
export const RIM = 1.16;

/**
 * The drawing's outline from the side, cushions and all, round (CX, CY): how far the brain reaches in each direction,
 * as a few waves (a constant, then a cosine and a sine for each count of waves round). Written this way an outline is
 * convex exactly when its radius of curvature, which is just as simple a sum, stays above zero; this one was fitted to
 * the drawing's silhouette (the cerebrum alone, closed along its underside where the drawing hides it behind the
 * cerebellum and the brainstem) with that radius held above 1.7, so the core inside it is convex too.
 */
const REACH = [4.4785, -0.0793, -0.2151, 0.957, 0.0623, 0.0319, -0.1455, -0.0484, 0.0035, 0.0026, 0.0378, 0.0065, 0];

/** How far the outline reaches in a direction, and how fast that changes as the direction turns. */
function reach(alpha: number): [number, number] {
	let h = REACH[0];
	let d = 0;
	for (let k = 1; 2 * k < REACH.length; k++) {
		const c = Math.cos(k * alpha);
		const s = Math.sin(k * alpha);
		h += REACH[2 * k - 1] * c + REACH[2 * k] * s;
		d += k * (REACH[2 * k] * c - REACH[2 * k - 1] * s);
	}
	return [h, d];
}

/** The core's outline from the side, facing a given way, drawn in by `inset`: the edge of its flat inner face when the inset is the roll's radius. */
export function profile(alpha: number, inset = 0): [number, number] {
	const [hk, dh] = reach(alpha);
	const h = hk - SKIN - inset;
	return [CX + h * Math.cos(alpha) - dh * Math.sin(alpha), CY + h * Math.sin(alpha) + dh * Math.cos(alpha)];
}

/** How far the drawing's outline reaches in a direction, cushions and all: for laying the drawing over the map. */
export function silhouette(alpha: number) {
	return reach(alpha)[0];
}

/**
 * A point of the core and the way it faces, from its place on the chart. Results go into `at` and `out`.
 * The chart's angle is the way the outline faces there, so round the rim the core's normal is simply that direction.
 */
export function shell(u: number, v: number, at: V3, out: V3) {
	const rho = Math.hypot(u, v);
	const ct = rho > 1e-9 ? u / rho : 1;
	const st = rho > 1e-9 ? v / rho : 0;
	const [hk, dh] = reach(Math.atan2(v, u));
	// The core's own outline: the drawing's, less the cushions and the roll. The point of it that faces this way.
	const h = hk - SKIN - ROLL;
	const kx = h * ct - dh * st;
	const ky = h * st + dh * ct;
	let nx: number, ny: number, nz: number;
	let ax: number, ay: number, az: number;
	if (rho <= 1) {
		const phi = (rho * Math.PI) / 2;
		const s = Math.sin(phi);
		const c = Math.cos(phi);
		ax = CX + s * kx;
		ay = CY + s * ky;
		const k = 1 - (TAPER * (ax - CX)) / 5.35;
		az = FISSURE + ROLL + DEPTH * k * c;
		nx = ((2 * s) / h) * ct + (2 * c * c * TAPER) / (5.35 * k);
		ny = ((2 * s) / h) * st;
		nz = (2 * c) / (DEPTH * k);
	} else {
		const psi = ((Math.min(rho, RIM) - 1) / (RIM - 1)) * (Math.PI / 2);
		ax = CX + kx;
		ay = CY + ky;
		az = FISSURE + ROLL;
		nx = Math.cos(psi) * ct;
		ny = Math.cos(psi) * st;
		nz = -Math.sin(psi);
	}
	const l = Math.hypot(nx, ny, nz);
	out[0] = nx / l;
	out[1] = ny / l;
	out[2] = nz / l;
	at[0] = ax + ROLL * out[0];
	at[1] = ay + ROLL * out[1];
	at[2] = az + ROLL * out[2];
}

const p0: V3 = [0, 0, 0];
const p1: V3 = [0, 0, 0];
const n0: V3 = [0, 0, 0];

/** A point standing `h` off the core at a place on the chart. */
export function lifted(u: number, v: number, h: number, to: V3 = [0, 0, 0]): V3 {
	shell(u, v, p0, n0);
	to[0] = p0[0] + n0[0] * h;
	to[1] = p0[1] + n0[1] * h;
	to[2] = p0[2] + n0[2] * h;
	return to;
}

/**
 * How the chart stretches at a place: the two directions on the core that a step along u and a step along v make, as
 * six numbers (du's x, y, z, then dv's).
 */
export function stretch(u: number, v: number, to: number[]) {
	const e = 1e-4;
	shell(u + e, v, p0, n0);
	shell(u - e, v, p1, n0);
	for (let i = 0; i < 3; i++) to[i] = (p0[i] - p1[i]) / (2 * e);
	shell(u, v + e, p0, n0);
	shell(u, v - e, p1, n0);
	for (let i = 0; i < 3; i++) to[3 + i] = (p0[i] - p1[i]) / (2 * e);
}

/**
 * The step on the chart that moves a point of the core by a given step in space, as near as a step on the core can:
 * what lets a line be walked straight over the surface.
 */
export function chartStep(u: number, v: number, dx: number, dy: number, dz: number, j: number[] = []): [number, number] {
	stretch(u, v, j);
	const a = j[0] * j[0] + j[1] * j[1] + j[2] * j[2];
	const b = j[0] * j[3] + j[1] * j[4] + j[2] * j[5];
	const c = j[3] * j[3] + j[4] * j[4] + j[5] * j[5];
	const p = j[0] * dx + j[1] * dy + j[2] * dz;
	const q = j[3] * dx + j[4] * dy + j[5] * dz;
	const det = a * c - b * b || 1e-12;
	return [(c * p - b * q) / det, (a * q - b * p) / det];
}

/** The place on the chart whose point of the core is nearest a point in space, starting the search from a guess. */
export function locate(x: number, y: number, z: number, guess?: [number, number]): [number, number] {
	let u = 0;
	let v = 0;
	if (guess) [u, v] = guess;
	else {
		// A coarse look over the whole chart first.
		let best = Infinity;
		for (let i = -12; i <= 12; i++)
			for (let k = -12; k <= 12; k++) {
				const a = (i / 12) * RIM;
				const b = (k / 12) * RIM;
				if (Math.hypot(a, b) > RIM) continue;
				shell(a, b, p0, n0);
				const d = (p0[0] - x) ** 2 + (p0[1] - y) ** 2 + (p0[2] - z) ** 2;
				if (d < best) [best, u, v] = [d, a, b];
			}
	}
	const j: number[] = [];
	for (let it = 0; it < 12; it++) {
		shell(u, v, p0, n0);
		const [du, dv] = chartStep(u, v, x - p0[0], y - p0[1], z - p0[2], j);
		u += du;
		v += dv;
		const rho = Math.hypot(u, v);
		if (rho > RIM) {
			u *= RIM / rho;
			v *= RIM / rho;
		}
		if (Math.abs(du) + Math.abs(dv) < 1e-7) break;
	}
	return [u, v];
}
