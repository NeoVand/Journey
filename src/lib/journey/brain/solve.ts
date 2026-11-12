/*
 * The cushions, solved. The design says where each one's middle line runs over the core and how wide it means to be;
 * this works out exactly how far each can reach before it would come closer to a neighbour than the gap, or to a
 * machine than its clearance, and builds every cushion as a row of plates that fit: the same gap everywhere two meet,
 * the same clearance round every machine, a hairline seam between one plate and the next.
 *
 * A cushion's reach is measured along lines walked straight over the core from its middle line, to either side and
 * round both ends. A place belongs to a cushion while it is inside the cushion's own shape (its middle line fattened
 * to its width, and a little more to let it close up to its neighbours), is nearer to it than to any other cushion by
 * at least the gap, and is clear of every machine. All three are plain distances, so a line can be walked in a few
 * sure strides, each as long as the nearest limit is far.
 *
 * Then the reaches along each side are made one smooth run that is nowhere longer than what was walked, so a cushion's
 * edge is a clean curve and still clears everything; a cushion that tapers to a thread is cut back to a round end; and
 * where a cushion rolls over into the fissure it is cut off flat, so the two halves face each other with level walls.
 */
import { chartStep, RIM, shell, type V3 } from './shell';

export type Tone = 'yellow' | 'blue';

/** A cushion as designed: its middle line as places on the chart, each with half the width it means to have there. */
export interface Gyrus {
	name: string;
	tone: Tone;
	/** u, v on the chart, and the half-width in the brain's own units. */
	line: [number, number, number][];
	/** How far it stands off the core at its crest, where it is wide enough; narrower stretches stand lower. */
	height?: number;
}

/** Something a cushion must keep clear of: a ball in space, on this half. */
export interface Ball {
	at: V3;
	r: number;
}

export interface Fit {
	/** The dark gap between two cushions' feet. */
	gap: number;
	/** How far a cushion's foot stays from a machine's envelope. */
	clear: number;
	/** How much wider than designed a cushion may grow to close up to a neighbour. */
	grow: number;
	/** How much further from a machine the part it has grown keeps: a cushion closes up to cushions, not round the works. */
	slack: number;
	/** The hairline between two plates of one cushion. */
	seam: number;
	/** About how long a plate is, along its cushion. */
	plate: number;
	/** Cushions stop this far out on the chart, part of the way round the roll into the fissure. */
	trim: number;
	/**
	 * No cushion comes nearer the middle of the fissure than this. Where one rolls over into the fissure it is cut off
	 * flat there, so the two halves face each other across it with flat walls, the same distance apart all the way along.
	 */
	face: number;
	/** Anything else a cushion's foot must stay out of: how far a place is inside the allowed region (negative, outside). */
	keep?: (p: V3) => number;
}

export const FIT: Fit = { gap: 0.1, clear: 0.07, grow: 0.3, slack: 0.1, seam: 0.022, plate: 1.25, trim: RIM - 0.004, face: 0.17 };

/** How far apart the stations along a middle line are, and how many steps a cushion's side takes from foot to crest. */
const STATION = 0.085;
const RISE = 8;
/** How many times a cushion's crest is moved to the middle of what it got. None: the crest stays the line that was drawn, however its sides were cut. */
const CENTRE = 0;
/**
 * Between two cushions the ground is shared by how near each one's middle line is, and only this much by how wide each
 * was drawn: so a wide one beside a narrow one gets a little more, and both come out nearer the same width, as tubes do.
 */
const SHARE = 0.35;
/** A cushion's end is cut back to where it reaches at least this far to both sides. */
const THIN = 0.2;
/** How many lines fan round each end. */
const FAN = 14;
/** The cushion's section is a superellipse of this power: 2 is half an ellipse, more is fuller in the shoulders. */
const POWER = 3.1;
/** Where across a plate's underside its points are, as shares of its reach: close enough that it follows the core round the roll. */
const UNDER = [1, 0.72, 0.44, 0.2];
/** Each plate floats this far off the core: over the low dishes the eyes stand in, and with room for light to show under it. */
export const FLOAT = 0.046;

/** One plate: a rigid piece of a cushion, which rises along its own axis. */
export interface Plate {
	/** Which cushion it is a plate of, and that cushion's name in the design. */
	gyrus: number;
	name: string;
	tone: Tone;
	/** Where it sits on the core, and the way it rises: the core's normal at its middle. */
	at: V3;
	axis: V3;
	/** Its part of the mesh: vertices [from, to) and index entries [first, last). */
	from: number;
	to: number;
	first: number;
	last: number;
}

export interface Cushions {
	position: Float32Array;
	/** Per vertex: how high it stands as a share of its cushion's height (0 at the foot, 1 at the crest; -1 underneath). */
	rise: Float32Array;
	/** Per vertex: which plate it belongs to. */
	plate: Uint16Array;
	index: Uint32Array;
	plates: Plate[];
	/**
	 * Each cushion's solved outline, as places on the chart, for drawing the plan: and for each place on it, what stopped
	 * the line that found it (see Walk), how far that line got, and how far the cushion reaches along it in the end.
	 */
	outlines: { name: string; tone: Tone; edge: [number, number][]; spine: [number, number][]; why: number[]; walked: number[]; reach: number[] }[];
	/** Each cushion's crest line: where it runs, how high it stands there, which plate that is, and how far it is to the nearer edge. */
	crests: { name: string; tone: Tone; line: (Station & { high: number; plate: number; half: number })[] }[];
}

/* ---- the middle lines ---- */

/** A smooth curve through points (centripetal Catmull-Rom), as many samples as asked for each span. */
export function through(pts: number[][], per: number) {
	const out: number[][] = [];
	const n = pts.length;
	const dim = pts[0].length;
	const get = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
	for (let i = 0; i < n - 1; i++) {
		const p0 = get(i - 1);
		const p1 = get(i);
		const p2 = get(i + 1);
		const p3 = get(i + 2);
		const d = (a: number[], b: number[]) => Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1])) || 1e-4;
		const t0 = 0;
		const t1 = t0 + d(p0, p1);
		const t2 = t1 + d(p1, p2);
		const t3 = t2 + d(p2, p3);
		for (let k = 0; k < per; k++) {
			const t = t1 + ((t2 - t1) * k) / per;
			const p: number[] = [];
			for (let c = 0; c < dim; c++) {
				const a1 = i === 0 ? p1[c] : (p0[c] * (t1 - t)) / (t1 - t0) + (p1[c] * (t - t0)) / (t1 - t0);
				const a2 = (p1[c] * (t2 - t)) / (t2 - t1) + (p2[c] * (t - t1)) / (t2 - t1);
				const a3 = i === n - 2 ? p2[c] : (p2[c] * (t3 - t)) / (t3 - t2) + (p3[c] * (t - t2)) / (t3 - t2);
				const b1 = i === 0 ? a2 : (a1 * (t2 - t)) / (t2 - t0) + (a2 * (t - t0)) / (t2 - t0);
				const b2 = i === n - 2 ? a2 : (a2 * (t3 - t)) / (t3 - t1) + (a3 * (t - t1)) / (t3 - t1);
				p.push((b1 * (t2 - t)) / (t2 - t1) + (b2 * (t - t1)) / (t2 - t1));
			}
			out.push(p);
		}
	}
	out.push(pts[n - 1].slice());
	return out;
}

export interface Station {
	u: number;
	v: number;
	w: number;
	p: V3;
	n: V3;
	/** Along the line, and to its left, on the core. */
	t: V3;
	b: V3;
	/** How far along the line, in the brain's units. */
	s: number;
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: V3): V3 => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};

/** Fills in each station's place in space and its frame on the core. */
export function frame(list: Station[]) {
	for (const st of list) shell(st.u, st.v, st.p, st.n);
	let s = 0;
	for (let i = 0; i < list.length; i++) {
		const a = list[Math.max(0, i - 1)];
		const b = list[Math.min(list.length - 1, i + 1)];
		const st = list[i];
		const along = sub(b.p, a.p);
		const k = dot(along, st.n);
		st.t = unit([along[0] - st.n[0] * k, along[1] - st.n[1] * k, along[2] - st.n[2] * k]);
		st.b = cross(st.n, st.t);
		if (i) s += Math.hypot(...sub(st.p, list[i - 1].p));
		st.s = s;
	}
}

/**
 * Stations along a designed line, evenly spaced over the core. Where the cushion is cut into plates there are two,
 * a seam apart: the end of one plate and the start of the next.
 */
function stations(g: Gyrus, fit: Fit, room: (st: Station) => number): { list: Station[]; cuts: number[]; fine: Station[] }[] {
	const drawn = through(g.line, 40).map(([u, v, w]) => ({ u, v, w, p: [0, 0, 0] as V3, n: [0, 0, 0] as V3, t: [0, 0, 0] as V3, b: [0, 0, 0] as V3, s: 0 }));
	frame(drawn);
	// A middle line may be drawn through a machine's pocket or out over the rim. The cushion is each stretch of it that has
	// room to stand: usually one, and two where a machine stands across it.
	const runs: { list: Station[]; cuts: number[]; fine: Station[] }[] = [];
	for (let i = 0, start = 0; i <= drawn.length; i++) {
		if (i < drawn.length && room(drawn[i]) > 0.03) continue;
		if (i - 1 - start >= 2 && drawn[i - 1].s - drawn[start].s > 0.4) {
			const fine = drawn.slice(start, i).map((st) => ({ ...st }));
			runs.push({ ...laid(fine, fit), fine });
		}
		start = i + 1;
	}
	return runs;
}

/** Stations along one stretch of a middle line, with the cuts between its plates. */
function laid(fine: Station[], fit: Fit): { list: Station[]; cuts: number[] } {
	frame(fine);
	const length = fine[fine.length - 1].s;
	const plates = Math.max(1, Math.round(length / fit.plate));
	// Where to stand: evenly within each plate, with a seam between plates.
	const at: number[] = [];
	const cuts: number[] = [];
	for (let k = 0; k < plates; k++) {
		const a = (length * k) / plates + (k ? fit.seam / 2 : 0);
		const b = (length * (k + 1)) / plates - (k < plates - 1 ? fit.seam / 2 : 0);
		const n = Math.max(2, Math.round((b - a) / STATION));
		for (let i = 0; i <= n; i++) at.push(a + ((b - a) * i) / n);
		cuts.push(at.length);
	}
	const list: Station[] = [];
	let j = 0;
	for (const s of at) {
		while (j < fine.length - 2 && fine[j + 1].s < s) j++;
		const a = fine[j];
		const b = fine[j + 1];
		const k = Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s || 1)));
		list.push({ u: a.u + (b.u - a.u) * k, v: a.v + (b.v - a.v) * k, w: a.w + (b.w - a.w) * k, p: [0, 0, 0], n: [0, 0, 0], t: [0, 0, 0], b: [0, 0, 0], s: 0 });
	}
	// A width that changes gently along the line: every station takes the average over a stretch about a cushion wide.
	const wide = list.map((st) => st.w);
	const span = Math.round(0.45 / STATION);
	for (let i = 0; i < list.length; i++) {
		let sum = 0;
		let count = 0;
		for (let k = Math.max(0, i - span); k <= Math.min(list.length - 1, i + span); k++) {
			const weight = 1 - Math.abs(k - i) / (span + 1);
			sum += wide[k] * weight;
			count += weight;
		}
		list[i].w = sum / count;
	}
	frame(list);
	return { list, cuts };
}

/* ---- who is near a place ---- */

/**
 * Every cushion's designed shape and every machine's envelope as balls, sorted into a grid: for a place, how far it is
 * inside or outside one cushion's shape, the nearest other cushion's, and the nearest machine's.
 */
class Near {
	private cell = 0.6;
	private lo: V3 = [Infinity, Infinity, Infinity];
	private size: [number, number, number] = [1, 1, 1];
	private start!: Int32Array;
	private items!: Int32Array;
	private x: number[] = [];
	private y: number[] = [];
	private z: number[] = [];
	private r: number[] = [];
	private owner: number[] = [];
	/** The widest ball: a search need go no further than this past what it has found. */
	private widest = 0;
	self = 0;
	mine = 0;
	other = 0;
	machine = 0;

	add(p: V3, r: number, owner: number) {
		this.x.push(p[0]);
		this.y.push(p[1]);
		this.z.push(p[2]);
		this.r.push(r);
		this.owner.push(owner);
		this.widest = Math.max(this.widest, r);
	}

	build() {
		const n = this.x.length;
		const hi: V3 = [-Infinity, -Infinity, -Infinity];
		const co = [this.x, this.y, this.z];
		for (let i = 0; i < n; i++)
			for (let k = 0; k < 3; k++) {
				this.lo[k] = Math.min(this.lo[k], co[k][i]);
				hi[k] = Math.max(hi[k], co[k][i]);
			}
		for (let k = 0; k < 3; k++) this.size[k] = Math.floor((hi[k] - this.lo[k]) / this.cell) + 1;
		const cells = this.size[0] * this.size[1] * this.size[2];
		this.start = new Int32Array(cells + 1);
		const home = (i: number) => this.at(Math.floor((this.x[i] - this.lo[0]) / this.cell), Math.floor((this.y[i] - this.lo[1]) / this.cell), Math.floor((this.z[i] - this.lo[2]) / this.cell));
		for (let i = 0; i < n; i++) this.start[home(i) + 1]++;
		for (let c = 0; c < cells; c++) this.start[c + 1] += this.start[c];
		const fill = this.start.slice();
		this.items = new Int32Array(n);
		for (let i = 0; i < n; i++) this.items[fill[home(i)]++] = i;
	}

	private at(i: number, j: number, k: number) {
		return (i * this.size[1] + j) * this.size[2] + k;
	}

	/**
	 * Measures a place for cushion `me`: sets self and machine, each a distance to a surface (negative, inside), and mine
	 * and other, the distances that say whose a place is between two cushions.
	 */
	measure(p: V3, me: number) {
		const reach = this.widest + 0.9;
		const c = this.cell;
		const i0 = Math.max(0, Math.floor((p[0] - reach - this.lo[0]) / c));
		const i1 = Math.min(this.size[0] - 1, Math.floor((p[0] + reach - this.lo[0]) / c));
		const j0 = Math.max(0, Math.floor((p[1] - reach - this.lo[1]) / c));
		const j1 = Math.min(this.size[1] - 1, Math.floor((p[1] + reach - this.lo[1]) / c));
		const k0 = Math.max(0, Math.floor((p[2] - reach - this.lo[2]) / c));
		const k1 = Math.min(this.size[2] - 1, Math.floor((p[2] + reach - this.lo[2]) / c));
		let self = 9;
		let mine = 9;
		let other = 9;
		let machine = 9;
		for (let i = i0; i <= i1; i++)
			for (let j = j0; j <= j1; j++)
				for (let k = k0; k <= k1; k++) {
					const cc = this.at(i, j, k);
					for (let e = this.start[cc]; e < this.start[cc + 1]; e++) {
						const q = this.items[e];
						const far = Math.hypot(this.x[q] - p[0], this.y[q] - p[1], this.z[q] - p[2]);
						const o = this.owner[q];
						if (o === me) {
							if (far - this.r[q] < self) self = far - this.r[q];
							if (far - this.r[q] * SHARE < mine) mine = far - this.r[q] * SHARE;
						} else if (o < 0) {
							if (far - this.r[q] < machine) machine = far - this.r[q];
						} else if (far - this.r[q] * SHARE < other) other = far - this.r[q] * SHARE;
					}
				}
		this.self = self;
		this.mine = mine;
		this.other = other;
		this.machine = machine;
	}
}

/* ---- walking out from a middle line ---- */

/** A line walked over the core from a station: how far it got, and the places it passed. */
interface Walk {
	reach: number;
	/** t, u, v at each stride. */
	path: number[];
	/** What stopped it: 0 its own shape, 1 a neighbour, 2 a machine, 3 the rim, 4 its limit, 5 something else to keep out of. */
	why: number;
}

const spot: V3 = [0, 0, 0];
const face: V3 = [0, 0, 0];
const jac: number[] = [];

function walk(near: Near, me: number, u: number, v: number, dir: V3, fit: Fit, most = 9): Walk {
	const path = [0, u, v];
	let t = 0;
	let d = dir;
	let why = 0;
	for (let step = 0; step < 60; step++) {
		shell(u, v, spot, face);
		near.measure(spot, me);
		const rho = Math.hypot(u, v);
		// Where it has grown past its designed shape it keeps further from the works, by more the further it has grown.
		const grown = Math.max(0, near.self) * 1.5;
		const works = grown < fit.slack ? (near.machine - fit.clear - grown) / 2.5 : near.machine - fit.clear - fit.slack;
		const rooms = [fit.grow - near.self, (near.other - near.mine - fit.gap) / 2, works, (fit.trim - rho) * 2.5, most - t, fit.keep ? fit.keep(spot) : 9];
		const room = Math.min(...rooms);
		why = rooms.indexOf(room);
		if (room < 0.0015) break;
		const stride = Math.min(room, 0.1);
		// Straight on over the core: the way it was going, laid back down onto the surface here.
		const k = dot(d, face);
		d = unit([d[0] - face[0] * k, d[1] - face[1] * k, d[2] - face[2] * k]);
		const [du, dv] = chartStep(u, v, d[0] * stride, d[1] * stride, d[2] * stride, jac);
		u += du;
		v += dv;
		t += stride;
		path.push(t, u, v);
	}
	return { reach: t, path, why };
}

/** The same walk, started a little way off: every place it passed, moved by the same step in space. */
function moved(w: Walk, d: V3): Walk {
	const path = w.path.slice();
	for (let i = 0; i < path.length; i += 3) {
		const [du, dv] = chartStep(path[i + 1], path[i + 2], d[0], d[1], d[2], jac);
		path[i + 1] += du;
		path[i + 2] += dv;
	}
	return { reach: w.reach, path, why: w.why };
}

/** The place a walk had reached at t. */
function along(w: Walk, t: number): [number, number] {
	const p = w.path;
	let i = 0;
	while (i + 6 < p.length && p[i + 3] < t) i += 3;
	if (i + 3 >= p.length) return [p[i + 1], p[i + 2]];
	const k = Math.min(1, Math.max(0, (t - p[i]) / (p[i + 3] - p[i] || 1)));
	return [p[i + 1] + (p[i + 4] - p[i + 1]) * k, p[i + 2] + (p[i + 5] - p[i + 2]) * k];
}

/**
 * Makes a run of reaches a smooth one without ever lengthening any: each first takes the least of its neighbours within
 * `half` either side, and then, twice over, the average of its neighbours, over stretches that add up to no more than
 * that. Every reach in an average is then one that was no longer than the reach it replaces.
 */
function eased(reach: number[], closed: boolean, half = 4) {
	const n = reach.length;
	const pick = (list: number[], j: number) => (closed ? list[((j % n) + n) % n] : list[Math.max(0, Math.min(n - 1, j))]);
	let now = reach.map((_, i) => {
		let least = Infinity;
		for (let k = -half; k <= half; k++) least = Math.min(least, pick(reach, i + k));
		return least;
	});
	for (const span of [Math.ceil(half / 2), Math.floor(half / 2)]) {
		if (!span) continue;
		const was = now;
		now = was.map((_, i) => {
			let sum = 0;
			for (let k = -span; k <= span; k++) sum += pick(was, i + k);
			return sum / (2 * span + 1);
		});
	}
	for (let i = 0; i < n; i++) reach[i] = now[i];
}

/* ---- the plates ---- */

class Mesh {
	position: number[] = [];
	rise: number[] = [];
	plate: number[] = [];
	index: number[] = [];
	vertex(p: V3, rise: number, plate: number) {
		this.position.push(p[0], p[1], p[2]);
		this.rise.push(rise);
		this.plate.push(plate);
		return this.rise.length - 1;
	}
	tri(a: number, b: number, c: number) {
		this.index.push(a, b, c);
	}
	quad(a: number, b: number, c: number, d: number) {
		this.index.push(a, b, c, a, c, d);
	}
}

const pt: V3 = [0, 0, 0];
const nm: V3 = [0, 0, 0];
/** A point standing `h` off the core at a place, or as far off as it can stand without coming nearer the fissure's middle than `face`. */
function raised(u: number, v: number, h: number, face = -Infinity): V3 {
	shell(u, v, pt, nm);
	if (nm[2] < 0 && pt[2] + nm[2] * h < face) h = Math.max(0, (pt[2] - face) / -nm[2]);
	return [pt[0] + nm[0] * h, pt[1] + nm[1] * h, pt[2] + nm[2] * h];
}

/** Solves every cushion and builds its plates. */
export function solve(gyri: Gyrus[], balls: Ball[], fit: Fit = FIT): Cushions {
	// What stands in the way of a middle line: the machines, and the rim.
	const guard = new Near();
	for (const b of balls) guard.add(b.at, b.r, -1);
	guard.add([0, 99, 0], 0.01, -1);
	guard.build();
	const room = (st: Station) => {
		guard.measure(st.p, -2);
		return Math.min(guard.machine - fit.clear, (fit.trim - Math.hypot(st.u, st.v)) * 4.4, fit.keep ? fit.keep(st.p) : 9);
	};
	let lines = gyri.flatMap((g) => stations(g, fit, room).map((run) => ({ ...run, g })));
	const gather = () => {
		const all = new Near();
		lines.forEach(({ list }, me) => {
			for (const st of list) all.add(st.p, st.w, me);
		});
		for (const b of balls) all.add(b.at, b.r, -1);
		all.build();
		return all;
	};
	let near = gather();
	// A cushion that tapers away to a thread between its neighbours is cut short, where it is still wide enough to end in
	// a round end: found by walking out a little way from the stations at each of its ends.
	let cut = false;
	lines = lines.flatMap((line, me) => {
		const { list, fine } = line;
		const wide = (st: Station) => Math.min(walk(near, me, st.u, st.v, st.b, fit, THIN * 1.2).reach, walk(near, me, st.u, st.v, [-st.b[0], -st.b[1], -st.b[2]], fit, THIN * 1.2).reach) >= THIN;
		let a = 0;
		while (a < list.length - 1 && !wide(list[a])) a++;
		let b = list.length - 1;
		while (b > a && !wide(list[b])) b--;
		if (a === 0 && b === list.length - 1) return [line];
		cut = true;
		if (list[b].s - list[a].s < 0.5) return [];
		const kept = fine.filter((st) => st.s >= list[a].s - 1e-6 && st.s <= list[b].s + 1e-6).map((st) => ({ ...st }));
		return [{ ...laid(kept, fit), fine: kept, g: line.g }];
	});
	if (cut) near = gather();

	const mesh = new Mesh();
	const plates: Plate[] = [];
	const outlines: Cushions['outlines'] = [];
	const crests: Cushions['crests'] = [];

	lines.forEach(({ list, cuts, g }, me) => {
		// First from the designed line, to find the middle of what the cushion really gets; then from that middle.
		for (let round = 0; round < CENTRE; round++) {
			const shift = list.map((st) => {
				const l = walk(near, me, st.u, st.v, st.b, fit);
				const r = walk(near, me, st.u, st.v, [-st.b[0], -st.b[1], -st.b[2]], fit);
				const off = (l.reach - r.reach) / 2;
				return { off, to: off > 0 ? along(l, off) : along(r, -off) };
			});
			// Shifts eased along the line, so the crest stays a smooth curve.
			const off = shift.map((s) => s.off);
			for (let pass = 0; pass < 40; pass++) {
				const was = off.slice();
				for (let i = 0; i < off.length; i++) off[i] = (was[Math.max(0, i - 1)] + was[i] * 2 + was[Math.min(off.length - 1, i + 1)]) / 4;
			}
			list.forEach((st, i) => {
				const [du, dv] = chartStep(st.u, st.v, st.b[0] * off[i], st.b[1] * off[i], st.b[2] * off[i], jac);
				st.u += du;
				st.v += dv;
			});
			frame(list);
		}

		// Where the cushion is cut into plates, the station that starts a plate stands exactly a seam on from the one that ends
		// the plate before, straight along the line.
		const starts = new Set(cuts.slice(0, -1));
		for (const i of starts) {
			const a = list[i - 1];
			const [du, dv] = chartStep(a.u, a.v, a.t[0] * fit.seam, a.t[1] * fit.seam, a.t[2] * fit.seam, jac);
			list[i].u = a.u + du;
			list[i].v = a.v + dv;
		}
		frame(list);

		// The lines out from it: down the right side, round the far end, back up the left side, round the near end.
		const n = list.length;
		const last = list[n - 1];
		const first = list[0];
		type Ray = { st: number; side: number; walk: Walk };
		const rays: Ray[] = [];
		const turn = (st: Station, a: number): V3 => {
			// From the right-hand side (a = 0) round the far end (a = 90°, straight on) to the left (a = 180°).
			const c = Math.cos(a);
			const s = Math.sin(a);
			return [-st.b[0] * c + st.t[0] * s, -st.b[1] * c + st.t[1] * s, -st.b[2] * c + st.t[2] * s];
		};
		// On the inside of a bend, lines from the middle would cross before long: none goes further than most of the bend's radius.
		const bend = list.map((st, i) => {
			const a = list[Math.max(0, i - 2)];
			const b = list[Math.min(n - 1, i + 2)];
			return dot(sub(b.t, a.t), st.b) / (b.s - a.s || 1);
		});
		const within = (i: number, left: boolean) => {
			const k = left ? bend[i] : -bend[i];
			return k > 0.2 ? 0.85 / k : 9;
		};
		// Where the cushion is cut into plates, the two faces of the cut are one section and its copy a seam further on, so the
		// seam is the same hairline all the way across.
		const across = (i: number, left: boolean): Walk => {
			if (starts.has(i)) return moved(across(i - 1, left), sub(list[i].p, list[i - 1].p));
			return walk(near, me, list[i].u, list[i].v, turn(list[i], left ? Math.PI : 0), fit, within(i, left));
		};
		const rights = list.map((_, i) => across(i, false));
		const lefts = list.map((_, i) => across(i, true));
		for (let i = 0; i < n; i++) rays.push({ st: i, side: 0, walk: rights[i] });
		for (let k = 1; k < FAN; k++) rays.push({ st: n - 1, side: 1, walk: walk(near, me, last.u, last.v, turn(last, (Math.PI * k) / FAN), fit) });
		for (let i = n - 1; i >= 0; i--) rays.push({ st: i, side: 2, walk: lefts[i] });
		for (let k = 1; k < FAN; k++) rays.push({ st: 0, side: 3, walk: walk(near, me, first.u, first.v, turn(first, Math.PI + (Math.PI * k) / FAN), fit) });
		const reach = rays.map((r) => r.walk.reach);
		eased(reach, true);
		const leftOf = (i: number) => 2 * n + FAN - 2 - i;
		// The two faces of a cut are one section, so they reach the same.
		const paired = () => {
			for (const i of starts) {
				reach[i] = reach[i - 1] = Math.min(reach[i], reach[i - 1]);
				reach[leftOf(i)] = reach[leftOf(i - 1)] = Math.min(reach[leftOf(i)], reach[leftOf(i - 1)]);
			}
		};
		paired();
		// No line may cross the next: on the inside of a tight bend the feet of two neighbouring stations would pass each
		// other, and the cushion fold over itself. Where they come too near along the cushion, the lines round there draw in,
		// the nearest most, so the edge stays a smooth one. (The two faces of a cut are a seam apart by construction.)
		const footOf = (ri: number) => raised(...along(rays[ri].walk, reach[ri]), 0);
		for (let pass = 0; pass < 40; pass++) {
			let drew = false;
			for (const side of [(i: number) => i, leftOf])
				for (let i = 0; i < n - 1; i++) {
					if (starts.has(i + 1)) continue;
					const step = sub(list[i + 1].p, list[i].p);
					const far = Math.hypot(...step);
					if (dot(sub(footOf(side(i + 1)), footOf(side(i))), step) / far < 0.35 * far) {
						for (let k = -3; k <= 4; k++) {
							const j = i + k;
							if (j < 0 || j >= n) continue;
							reach[side(j)] *= 1 - 0.05 * (1 - Math.abs(k - 0.5) / 4.5);
						}
						drew = true;
					}
				}
			paired();
			if (!drew) break;
		}

		// How high it stands along its length: as high as designed where it is wide enough, lower where it narrows.
		const tall = g.height ?? 0.5;
		const high = list.map((_, i) => Math.min(tall, 1.05 * Math.min(reach[i], reach[2 * n + FAN - 2 - i])));
		eased(high, false);
		for (const i of starts) high[i] = high[i - 1] = Math.min(high[i], high[i - 1]);

		outlines.push({ name: g.name, tone: g.tone, edge: rays.map((r, i) => along(r.walk, reach[i])), spine: list.map((st) => [st.u, st.v]), why: rays.map((r) => r.walk.why), walked: rays.map((r) => r.walk.reach), reach: reach.slice() });
		const plateOf: number[] = [];
		cuts.forEach((to, k) => {
			while (plateOf.length < to) plateOf.push(plates.length + k);
		});
		crests.push({ name: g.name, tone: g.tone, line: list.map((st, i) => ({ ...st, p: [...st.p] as V3, n: [...st.n] as V3, high: FLOAT + high[i], plate: plateOf[i], half: Math.min(reach[i], reach[leftOf(i)]) })) });

		// One plate at a time: its stretch of stations, and the fan at an end if it has one.
		let from = 0;
		cuts.forEach((to, k) => {
			const id = plates.length;
			const v0 = mesh.rise.length;
			const i0 = mesh.index.length;
			const isFirst = k === 0;
			const isLast = k === cuts.length - 1;
			// This plate's lines, in order round it: right side, far fan (or the cut), left side, near fan (or the cut).
			const ring: number[] = [];
			for (let i = from; i < to; i++) ring.push(i);
			if (isLast) for (let q = 0; q < FAN - 1; q++) ring.push(n + q);
			for (let i = to - 1; i >= from; i--) ring.push(2 * n + FAN - 2 - i);
			if (isFirst) for (let q = 0; q < FAN - 1; q++) ring.push(2 * n + FAN - 1 + q);
			// Each line's points from foot to shoulder, and under it; the crest points along the middle.
			const up: number[][] = [];
			const under: number[][] = [];
			for (const ri of ring) {
				const ray = rays[ri];
				const h = high[ray.st];
				const col: number[] = [];
				for (let j = 0; j < RISE; j++) {
					const a = ((j / RISE) * Math.PI) / 2;
					const out = Math.pow(Math.cos(a), 2 / POWER);
					const rise = Math.pow(Math.sin(a), 2 / POWER);
					const [u, v] = along(ray.walk, reach[ri] * out);
					col.push(mesh.vertex(raised(u, v, FLOAT + h * rise, fit.face), rise, id));
				}
				up.push(col);
				const low: number[] = [];
				for (const out of UNDER) {
					const [u, v] = along(ray.walk, reach[ri] * out);
					low.push(mesh.vertex(raised(u, v, FLOAT, fit.face), -1, id));
				}
				under.push(low);
			}
			const crest: number[] = [];
			const floor: number[] = [];
			for (let i = from; i < to; i++) {
				crest.push(mesh.vertex(raised(list[i].u, list[i].v, FLOAT + high[i], fit.face), 1, id));
				floor.push(mesh.vertex(raised(list[i].u, list[i].v, FLOAT, fit.face), -1, id));
			}
			const crestOf = (ri: number) => crest[rays[ri].st - from];
			const floorOf = (ri: number) => floor[rays[ri].st - from];
			const m = ring.length;
			const closed = isFirst && isLast;
			for (let q = 0; q < m; q++) {
				const q1 = (q + 1) % m;
				const a = ring[q];
				const b = ring[q1];
				// Across a cut there is no skin: the ends are closed below.
				const cutHere = !closed && ((q === to - from - 1 && !isLast) || (q === m - 1 && !isFirst) || (isFirst && !isLast && q === to - from - 1) || (!isFirst && isLast && q === m - 1));
				if (cutHere) continue;
				for (let j = 0; j < RISE - 1; j++) mesh.quad(up[q][j], up[q1][j], up[q1][j + 1], up[q][j + 1]);
				const ca = crestOf(a);
				const cb = crestOf(b);
				if (ca === cb) mesh.tri(up[q][RISE - 1], up[q1][RISE - 1], ca);
				else mesh.quad(up[q][RISE - 1], up[q1][RISE - 1], cb, ca);
				// Underneath, facing the core.
				const deep = UNDER.length - 1;
				for (let j = 0; j < deep; j++) mesh.quad(under[q1][j], under[q][j], under[q][j + 1], under[q1][j + 1]);
				const fa = floorOf(a);
				const fb = floorOf(b);
				if (fa === fb) mesh.tri(under[q1][deep], under[q][deep], fa);
				else mesh.quad(under[q1][deep], under[q][deep], fa, fb);
			}
			// The cut ends: a face across the section, with corners of its own so it shades flat. A line walked over the core
			// bows a little as it goes, so each half of the face is drawn about a point on its own line: the face then follows
			// the line, and the two faces of a cut stay a seam apart all the way across.
			const closeEnd = (station: number, qRight: number, qLeft: number, forward: boolean) => {
				for (const [q, mirrored] of [
					[qRight, false],
					[qLeft, true]
				] as const) {
					const ri = ring[q];
					const [hu, hv] = along(rays[ri].walk, reach[ri] * 0.5);
					const hub = mesh.vertex(raised(hu, hv, FLOAT + high[station] * 0.45, fit.face), 0.45, id);
					const loop = [...up[q], crest[station - from], floor[station - from], ...under[q].slice(1).reverse()].map((vi) => mesh.vertex([mesh.position[vi * 3], mesh.position[vi * 3 + 1], mesh.position[vi * 3 + 2]], Math.max(0, mesh.rise[vi]), id));
					for (let k = 0; k < loop.length; k++) {
						const next = loop[(k + 1) % loop.length];
						if (forward !== mirrored) mesh.tri(hub, next, loop[k]);
						else mesh.tri(hub, loop[k], next);
					}
				}
			};
			const count = to - from;
			if (!isLast) closeEnd(to - 1, count - 1, count, true);
			if (!isFirst) closeEnd(from, 0, m - 1, false);

			const mid = list[Math.floor((from + to - 1) / 2)];
			plates.push({ gyrus: me, name: g.name, tone: g.tone, at: [...mid.p] as V3, axis: [...mid.n] as V3, from: v0, to: mesh.rise.length, first: i0, last: mesh.index.length });
			from = to;
		});
	});

	return { position: new Float32Array(mesh.position), rise: new Float32Array(mesh.rise), plate: new Uint16Array(mesh.plate), index: new Uint32Array(mesh.index), plates, outlines, crests };
}
