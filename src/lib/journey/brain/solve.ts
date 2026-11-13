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
import { drawn, FACING, type Tone } from './tones';

export type { Tone };

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
	/** Not in a cushion's way: something low lies on the core inside this ball, which the cushions float over. They have no seats there. */
	low?: boolean;
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
	/**
	 * The drawing: how far inside the drawn cushions of a colour a place is, or null where the drawing cannot see. Where it
	 * can, a cushion's edge is the drawing's edge, drawn in by `inset`, and nothing of ours shapes it.
	 */
	drawn?: (tone: Tone, p: V3, n: V3) => number | null;
	inset: number;
}

export const FIT: Fit = { gap: 0.1, clear: 0.07, grow: 0.3, slack: 0.1, seam: 0.022, plate: 1.25, trim: RIM - 0.004, face: 0.17, drawn, inset: 0.02 };

/** How far apart the stations along a middle line are, and how many steps a cushion's side takes from foot to crest. */
const STATION = 0.085;
const RISE = 10;
/** How many times a cushion's crest is moved to the middle of the cushion as drawn, where both its sides are the drawing's. */
const CENTRE = 2;
/**
 * Between two cushions the ground is shared by how near each one's middle line is, and only this much by how wide each
 * was drawn: so a wide one beside a narrow one gets a little more, and both come out nearer the same width, as tubes do.
 */
const SHARE = 0.35;
/** A cushion's end is cut back to where it reaches at least this far to both sides. */
const THIN = 0.2;
/** How many lines fan round each end. */
const FAN = 14;
/** A middle line is well inside its cushion when it is this far from the drawing's edge. */
const SEATED = 0.09;
/** How stiff the fair curve of a cushion's width is: it follows what is longer than about one of the brain's units and lets go of what is shorter. */
const STIFF = 14;
/** How stiff the fair curve of a middle line is: it keeps bends longer than about three quarters of a unit and takes out anything shorter. */
const SWEEP = 4;
/** A seat: how far it stands off its cushion's foot, how wide it may be, and how high. It is never nearer another cushion's foot or a machine than its own standing-off. */
const SEAT = { off: 0.012, wide: 0.1, high: 0.088 };
/** A walk stopped by the drawing's own edge: a measurement of the cushion as drawn. */
const DRAWN = 6;
/** In the drawing's sight no cushion reaches further from its middle line than this: it would be in another cushion of its colour. */
const WIDEST = 1.0;
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
	/**
	 * The seats: a low dark gasket round the foot of every cushion, fixed to the core. A plate rises out of its seat and
	 * settles back into it; the seat stays. Its faces have points of their own, so they meet in edges.
	 */
	seat: { position: Float32Array; index: Uint32Array };
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

const spot: V3 = [0, 0, 0];
const face: V3 = [0, 0, 0];
const jac: number[] = [];

/**
 * Stations along a designed line, evenly spaced over the core. Where the cushion is cut into plates there are two,
 * a seam apart: the end of one plate and the start of the next.
 */
function stations(g: Gyrus, fit: Fit, room: (st: Station, tone: Tone) => number): { list: Station[]; cuts: number[]; fine: Station[] }[] {
	const traced = through(g.line, 40).map(([u, v, w]) => ({ u, v, w, p: [0, 0, 0] as V3, n: [0, 0, 0] as V3, t: [0, 0, 0] as V3, b: [0, 0, 0] as V3, s: 0 }));
	frame(traced);
	// In the drawing's sight a middle line belongs inside a cushion of its own colour. Where ours runs beside one, it is
	// moved sideways into it, by the least that will do.
	if (fit.drawn) {
		const off = traced.map((st) => {
			const seen = fit.drawn!(g.tone, st.p, st.n);
			if (seen === null || seen > SEATED) return 0;
			let best = seen;
			let to = 0;
			search: for (let d = 0.03; d <= 0.5; d += 0.03)
				for (const side of [1, -1]) {
					const [du, dv] = chartStep(st.u, st.v, st.b[0] * d * side, st.b[1] * d * side, st.b[2] * d * side, jac);
					shell(st.u + du, st.v + dv, spot, face);
					const there = fit.drawn!(g.tone, spot, face);
					if (there === null || there <= best) continue;
					best = there;
					to = d * side;
					if (there > SEATED) break search;
				}
			// (Where the cushion is too narrow to be well inside anywhere, the middle of it will do.)
			return to;
		});
		// The line moves over as a whole, smoothly: each place by about what its neighbours need too, so it stays one sweep.
		for (let pass = 0; pass < 30; pass++) {
			const was = off.slice();
			for (let i = 0; i < off.length; i++) off[i] = (was[Math.max(0, i - 1)] + 2 * was[i] + was[Math.min(off.length - 1, i + 1)]) / 4;
		}
		traced.forEach((st, i) => {
			if (Math.abs(off[i]) < 1e-4) return;
			const [du, dv] = chartStep(st.u, st.v, st.b[0] * off[i], st.b[1] * off[i], st.b[2] * off[i], jac);
			st.u += du;
			st.v += dv;
		});
		frame(traced);
	}
	// A middle line may be drawn through a machine's pocket or out over the rim. The cushion is each stretch of it that has
	// room to stand: usually one, and two where a machine stands across it.
	const runs: { list: Station[]; cuts: number[]; fine: Station[] }[] = [];
	for (let i = 0, start = 0; i <= traced.length; i++) {
		if (i < traced.length && room(traced[i], g.tone) > 0.03) continue;
		if (i - 1 - start >= 2 && traced[i - 1].s - traced[start].s > 0.4) {
			const fine = traced.slice(start, i).map((st) => ({ ...st }));
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
	/** Each cushion's colour, by its number. */
	tones: Tone[] = [];
	/** The widest ball: a search need go no further than this past what it has found. */
	private widest = 0;
	self = 0;
	mine = 0;
	other = 0;
	/** The same as `other`, for the nearest other cushion of this one's own colour. */
	same = 0;
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
		let same = 9;
		let machine = 9;
		const tone = this.tones[me];
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
						} else {
							if (far - this.r[q] * SHARE < other) other = far - this.r[q] * SHARE;
							if (far - this.r[q] * SHARE < same && this.tones[o] === tone) same = far - this.r[q] * SHARE;
						}
					}
				}
		this.self = self;
		this.mine = mine;
		this.other = other;
		this.same = same;
		this.machine = machine;
	}
}

/* ---- walking out from a middle line ---- */

/** A line walked over the core from a station: how far it got, and the places it passed. */
interface Walk {
	reach: number;
	/** t, u, v at each stride. */
	path: number[];
	/** What stopped it: 0 its own shape, 1 a neighbour, 2 a machine, 3 the rim, 4 its limit, 5 something else to keep out of, 6 the drawing's edge. */
	why: number;
}


function walk(near: Near, me: number, u: number, v: number, dir: V3, fit: Fit, most = 9): Walk {
	const path = [0, u, v];
	let t = 0;
	let d = dir;
	let why = 0;
	const tone = near.tones[me];
	for (let step = 0; step < 90; step++) {
		shell(u, v, spot, face);
		near.measure(spot, me);
		const rho = Math.hypot(u, v);
		const seen = fit.drawn && tone ? fit.drawn(tone, spot, face) : null;
		let rooms: number[];
		if (seen !== null) {
			// In the drawing's sight the cushion's edge is the drawing's. A machine still has its clearance, and another cushion
			// of the same colour, where the drawing runs two together, its gap.
			// Near the edge of the drawing's sight, where a cushion beside it may be one the drawing cannot place, it also keeps
			// to its own side of the line between their two middles, as it does out of sight; well in sight that falls away.
			const edge = Math.max(0, (face[2] - FACING - 0.1) / 0.2);
			rooms = [9, Math.min((near.same - near.mine - fit.gap) / 2, (near.other - near.mine - fit.gap) / 2 + edge), near.machine - fit.clear, (fit.trim - rho) * 2.5, Math.min(most, WIDEST) - t, fit.keep ? fit.keep(spot) : 9, seen - fit.inset];
		} else {
			// Where it has grown past its designed shape it keeps further from the works, by more the further it has grown.
			const grown = Math.max(0, near.self) * 1.5;
			const works = grown < fit.slack ? (near.machine - fit.clear - grown) / 2.5 : near.machine - fit.clear - fit.slack;
			rooms = [fit.grow - near.self, (near.other - near.mine - fit.gap) / 2, works, (fit.trim - rho) * 2.5, most - t, fit.keep ? fit.keep(spot) : 9];
		}
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

/** The place a walk had reached at t; past its end, straight on the way it was going. */
function along(w: Walk, t: number): [number, number] {
	const p = w.path;
	const n = p.length;
	if (n >= 6 && t > p[n - 3]) {
		const k = (t - p[n - 3]) / (p[n - 3] - p[n - 6] || 1);
		return [p[n - 2] + (p[n - 2] - p[n - 5]) * k, p[n - 1] + (p[n - 1] - p[n - 4]) * k];
	}
	let i = 0;
	while (i + 6 < n && p[i + 3] < t) i += 3;
	if (i + 3 >= n) return [p[i + 1], p[i + 2]];
	const k = Math.min(1, Math.max(0, (t - p[i]) / (p[i + 3] - p[i] || 1)));
	return [p[i + 1] + (p[i + 4] - p[i + 1]) * k, p[i + 2] + (p[i + 5] - p[i + 2]) * k];
}

/**
 * The fair curve through a run of measurements: the one that stays closest to them while bending least (it minimises
 * the squares of its misses plus `stiff` times the squares of its second differences; Whittaker's smoother). A cushion's
 * width along its length is measured from the drawing place by place, and a measurement has grain in it; the width the
 * cushion is given is the fair curve through them, so its edge is one clean sweep and not the grain.
 */
export function fair(y: number[], stiff: number) {
	const n = y.length;
	if (n < 5) return y.slice();
	// A spike or a drop at one place is not the cushion's width: each measurement first gives way to the middle one of its five.
	const b = y.map((_, i) => [y[Math.max(0, i - 2)], y[Math.max(0, i - 1)], y[i], y[Math.min(n - 1, i + 1)], y[Math.min(n - 1, i + 2)]].sort((p, q) => p - q)[2]);
	// The equations have five diagonals and are symmetric: solved straight down and back up.
	const d = new Float64Array(n);
	const e = new Float64Array(n);
	const f = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		d[i] = 1 + stiff * (i === 0 || i === n - 1 ? 1 : i === 1 || i === n - 2 ? 5 : 6);
		if (i < n - 1) e[i] = stiff * (i === 0 || i === n - 2 ? -2 : -4);
		if (i < n - 2) f[i] = stiff;
	}
	for (let i = 0; i < n; i++) {
		if (i + 1 < n) {
			const m = e[i] / d[i];
			d[i + 1] -= m * e[i];
			if (i + 2 < n) e[i + 1] -= m * f[i];
			b[i + 1] -= m * b[i];
		}
		if (i + 2 < n) {
			const m = f[i] / d[i];
			d[i + 2] -= m * f[i];
			b[i + 2] -= m * b[i];
		}
	}
	const x = new Array<number>(n).fill(0);
	for (let i = n - 1; i >= 0; i--) x[i] = (b[i] - (i + 1 < n ? e[i] * x[i + 1] : 0) - (i + 2 < n ? f[i] * x[i + 2] : 0)) / d[i];
	return x;
}

/**
 * Makes a run of reaches a clean one without ever lengthening any: the fair curve through them, lowered just where it
 * would pass over one, by a bump that is itself smooth. Out of the drawing's sight a cushion's reach is set by what
 * stands near it, and must not grow; but its edge should be one sweep there too, and not the trace of every neighbour.
 */
function eased(reach: number[], closed: boolean, half = 4) {
	const n = reach.length;
	if (n < 5) return;
	// Round a closed run the curve is found with some of the run laid on at either end, so it has no ends.
	const lap = closed ? Math.min(n, 12) : 0;
	const long = closed ? [...reach.slice(n - lap), ...reach, ...reach.slice(0, lap)] : reach;
	const curve = fair(long, STIFF * (half / 4) ** 2);
	const over = long.map((r, i) => Math.max(0, curve[i] - r));
	const m = long.length;
	const pick = (list: number[], j: number) => list[Math.max(0, Math.min(m - 1, j))];
	const most = over.map((_, i) => {
		let top = 0;
		for (let k = -half; k <= half; k++) top = Math.max(top, pick(over, i + k));
		return top;
	});
	for (let i = 0; i < n; i++) {
		let sum = 0;
		for (let k = -half; k <= half; k++) sum += pick(most, i + lap + k);
		reach[i] = Math.max(0, Math.min(reach[i], curve[i + lap] - sum / (2 * half + 1)));
	}
}

/* ---- the plates ---- */

/**
 * A cushion's section, from its foot in to its crest: how far in from the edge, how high off its seat, and how high as a
 * share of the whole. A cushion is a panel, not a tube: a dark gasket at its foot, a short wall, a turn of one radius
 * at the top of the wall, and then a broad top that is only gently crowned. The turn is the same radius all the way
 * round every cushion, which is what makes an edge read as exact. Where a cushion narrows to a point the whole section
 * scales down with it.
 */
function section(reach: number, high: number): [number, number, number][] {
	const crown = Math.min(0.075, 0.25 * high, 0.3 * reach);
	const shoulder = high - crown;
	const turn = Math.min(0.11, 0.6 * shoulder, 0.4 * reach);
	const lean = 0.1 * turn;
	const wall = shoulder - turn;
	const gasket = Math.min(0.03, 0.4 * wall);
	const share = (h: number) => 0.06 + (0.94 * h) / (high || 1);
	// The gasket's top is two points in one place: the dark ends there and the colour begins, on a line.
	const out: [number, number, number][] = [
		[0, 0, 0],
		[0, gasket, 0.019],
		[0, gasket, 0.045],
		[lean, wall, share(wall)]
	];
	for (const a of [Math.PI / 8, Math.PI / 4, (Math.PI * 3) / 8, Math.PI / 2]) out.push([lean + turn * (1 - Math.cos(a)), wall + turn * Math.sin(a), share(wall + turn * Math.sin(a))]);
	const from = lean + turn;
	for (const t of [1 / 3, 2 / 3]) out.push([from + (reach - from) * t, shoulder + crown * (1 - (1 - t) * (1 - t)), share(shoulder + crown * (1 - (1 - t) * (1 - t)))]);
	return out;
}


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
export function solve(gyri: Gyrus[], every: Ball[], fit: Fit = FIT): Cushions {
	const balls = every.filter((b) => !b.low);
	const low = every.filter((b) => b.low);
	// What stands in the way of a middle line: the machines, and the rim.
	const guard = new Near();
	for (const b of balls) guard.add(b.at, b.r, -1);
	guard.add([0, 99, 0], 0.01, -1);
	guard.build();
	const room = (st: Station, tone: Tone) => {
		guard.measure(st.p, -2);
		// In the drawing's sight a middle line has room only inside a cushion of its own colour.
		const seen = fit.drawn ? fit.drawn(tone, st.p, st.n) : null;
		return Math.min(guard.machine - fit.clear, (fit.trim - Math.hypot(st.u, st.v)) * 4.4, fit.keep ? fit.keep(st.p) : 9, seen === null ? 9 : seen - fit.inset + 0.02);
	};
	let lines = gyri.flatMap((g) => stations(g, fit, room).map((run) => ({ ...run, g })));
	const gather = () => {
		const all = new Near();
		all.tones = lines.map((line) => line.g.tone);
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
		// (Where the drawing has it come to a point, it comes to a point.)
		const wide = (st: Station) => (fit.drawn && fit.drawn(line.g.tone, st.p, st.n) !== null) || Math.min(walk(near, me, st.u, st.v, st.b, fit, THIN * 1.2).reach, walk(near, me, st.u, st.v, [-st.b[0], -st.b[1], -st.b[2]], fit, THIN * 1.2).reach) >= THIN;
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
	const seatAt: number[] = [];
	const seatIndex: number[] = [];
	const plates: Plate[] = [];
	const outlines: Cushions['outlines'] = [];
	const crests: Cushions['crests'] = [];

	lines.forEach(({ list, cuts, g }, me) => {
		// Where both sides of the cushion are the drawing's, its middle line moves to the middle between them.
		for (let round = 0; round < CENTRE; round++) {
			const off = list.map((st) => {
				const l = walk(near, me, st.u, st.v, st.b, fit);
				const r = walk(near, me, st.u, st.v, [-st.b[0], -st.b[1], -st.b[2]], fit);
				return l.why === DRAWN && r.why === DRAWN ? (l.reach - r.reach) / 2 : 0;
			});
			// Shifts eased along the line, so the crest stays a smooth curve.
			for (let pass = 0; pass < 24; pass++) {
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
		// Where the drawing has the cushion run on past the end of its line, the line runs on with it, down its middle, to its
		// tip: so a cushion that is drawn coming to a point comes to that point.
		for (const far of [true, false]) {
			for (let k = 0; k < 14; k++) {
				const st = far ? list[list.length - 1] : list[0];
				if (!fit.drawn || fit.drawn(g.tone, st.p, st.n) === null) break;
				const on: V3 = far ? st.t : [-st.t[0], -st.t[1], -st.t[2]];
				const ahead = walk(near, me, st.u, st.v, on, fit, STATION * 2.4);
				if (ahead.why !== 4) break;
				let [u, v] = along(ahead, STATION);
				const at: V3 = [0, 0, 0];
				const n: V3 = [0, 0, 0];
				shell(u, v, at, n);
				const side = unit(cross(n, on));
				const l = walk(near, me, u, v, side, fit);
				const r = walk(near, me, u, v, [-side[0], -side[1], -side[2]], fit);
				if (l.why === DRAWN && r.why === DRAWN) {
					const off = Math.max(-STATION / 2, Math.min(STATION / 2, (l.reach - r.reach) / 2));
					const [du, dv] = chartStep(u, v, side[0] * off, side[1] * off, side[2] * off, jac);
					u += du;
					v += dv;
				}
				const next: Station = { u, v, w: st.w, p: [0, 0, 0], n: [0, 0, 0], t: [0, 0, 0], b: [0, 0, 0], s: 0 };
				if (far) {
					list.push(next);
					cuts[cuts.length - 1]++;
				} else {
					list.unshift(next);
					for (let c = 0; c < cuts.length; c++) cuts[c]++;
				}
				frame(list);
			}
		}

		// Moved here and there to sit in its cushion, the middle line is made one sweep again: the fair curve through its
		// stations, with the stations set evenly along it. (A cushion's edges are measured out from this line, square to it: a
		// kink in the line would be a tear in the cushion.)
		if (fit.drawn && list.length >= 5) {
			const us = fair(list.map((st) => st.u), SWEEP);
			const vs = fair(list.map((st) => st.v), SWEEP);
			const at: V3[] = us.map((u, i) => {
				shell(u, vs[i], spot, face);
				return [spot[0], spot[1], spot[2]];
			});
			const far = [0];
			for (let i = 1; i < at.length; i++) far.push(far[i - 1] + Math.hypot(at[i][0] - at[i - 1][0], at[i][1] - at[i - 1][1], at[i][2] - at[i - 1][2]));
			let j = 0;
			list.forEach((st, i) => {
				const want = (far[far.length - 1] * i) / (list.length - 1);
				while (j < far.length - 2 && far[j + 1] < want) j++;
				const k = Math.max(0, Math.min(1, (want - far[j]) / (far[j + 1] - far[j] || 1)));
				st.u = us[j] + (us[j + 1] - us[j]) * k;
				st.v = vs[j] + (vs[j + 1] - vs[j]) * k;
			});
			frame(list);
		}

		// A middle line that has come out of its own colour in the drawing has no cushion there: the cushion is its longest
		// stretch that has, and its plates are that stretch's.
		if (fit.drawn) {
			const has = list.map((st) => {
				if (fit.drawn!(g.tone, st.p, st.n) === null) return true;
				return Math.max(walk(near, me, st.u, st.v, st.b, fit).reach, walk(near, me, st.u, st.v, [-st.b[0], -st.b[1], -st.b[2]], fit).reach) > 0.03;
			});
			let from = 0;
			let to = 0;
			for (let i = 0, start = 0; i <= has.length; i++) {
				if (i < has.length && has[i]) continue;
				if (i - start > to - from) [from, to] = [start, i];
				start = i + 1;
			}
			if (to - from < list.length) {
				list.splice(to);
				list.splice(0, from);
				const kept = cuts.map((c) => Math.max(0, Math.min(list.length, c - from))).filter((c, k, all) => c >= 3 && c <= list.length - 3 && c !== all[k - 1]);
				cuts.splice(0, cuts.length, ...kept, list.length);
				frame(list);
			}
		}
		if (list.length < 4) {
			outlines.push({ name: g.name, tone: g.tone, edge: [], spine: [], why: [], walked: [], reach: [] });
			crests.push({ name: g.name, tone: g.tone, line: [] });
			return;
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
		// Where the drawing set a reach, it is a measurement of the drawn cushion. The rest, set by what stands near, are made a smooth run that is never longer.
		const exact = rays.map((r) => r.walk.why === DRAWN);
		eased(reach, true);
		const leftOf = (i: number) => 2 * n + FAN - 2 - i;
		// Along each side, every stretch the drawing set is given the fair curve through its measurements.
		for (const side of [(i: number) => i, leftOf]) {
			for (let i = 0; i < n; ) {
				if (!exact[side(i)]) {
					i++;
					continue;
				}
				let j = i;
				while (j < n && exact[side(j)]) j++;
				const raw = Array.from({ length: j - i }, (_, k) => rays[side(i + k)].walk.reach);
				const run = fair(raw, STIFF);
				// The fair curve may cut a corner of the drawing's, by a hair; it never goes further past the drawn edge than that.
				for (let k = i; k < j; k++) {
					const about = [raw[Math.max(0, k - i - 1)], raw[k - i], raw[Math.min(j - i - 1, k - i + 1)]].sort((p, q) => p - q)[1];
					reach[side(k)] = Math.max(0.015, Math.min(run[k - i], about + 0.015));
				}
				i = j;
			}
		}
		// Round an end the drawing can see, the cushion closes in half an oval: from one side's width, through how far it
		// runs on ahead, to the other side's. One curve, whatever the end's measurements were.
		const closeIn = (end: Station, at: number, a0: number, a1: number) => {
			if (!fit.drawn || fit.drawn(g.tone, end.p, end.n) === null) return;
			const ahead = Math.max(0.03, Math.min(rays[at + FAN / 2 - 1].walk.reach, 1.4 * Math.max(a0, a1)));
			for (let k = 1; k < FAN; k++) {
				const turnTo = (Math.PI * k) / FAN;
				const a = k < FAN / 2 ? a0 : a1;
				// (Never past what was found there, but by a hair: where the drawn end is sharper than an oval, it is the drawn end.)
				reach[at + k - 1] = Math.min(1 / Math.sqrt(Math.cos(turnTo) ** 2 / (a * a) + Math.sin(turnTo) ** 2 / (ahead * ahead)), rays[at + k - 1].walk.reach + 0.015);
				exact[at + k - 1] = true;
			}
		};
		closeIn(last, n, reach[n - 1], reach[leftOf(n - 1)]);
		closeIn(first, 2 * n + FAN - 1, reach[leftOf(0)], reach[0]);
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
					if (dot(sub(footOf(side(i + 1)), footOf(side(i))), step) / far < (exact[side(i)] && exact[side(i + 1)] ? 0.08 : 0.35) * far) {
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
		// Drawn in here and there, the run of reaches is made smooth again: only ever shorter.
		const folded = reach.slice();
		eased(reach, true, 3);
		rays.forEach((_, i) => exact[i] && (reach[i] = folded[i]));
		paired();
		// A cut's two faces are a seam apart at the middle line, and stay so out along the section only while the core does not
		// turn away under them. Where it does, round the roll into the fissure, the section there is drawn in until its two
		// faces are a seam apart at their feet as well.
		for (const i of starts)
			for (const side of [(k: number) => k, leftOf]) {
				for (let pass = 0; pass < 16; pass++) {
					const a = raised(...along(rays[side(i - 1)].walk, reach[side(i - 1)]), 0);
					const b = raised(...along(rays[side(i)].walk, reach[side(i)]), 0);
					if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > fit.seam * 0.75) break;
					reach[side(i)] = reach[side(i - 1)] = reach[side(i)] * 0.9;
				}
			}

		// How high it stands along its length: as high as designed where it is wide enough, lower where it narrows.
		const tall = g.height ?? 0.35;
		const high = list.map((_, i) => Math.min(tall, 0.06 + 1.1 * Math.min(reach[i], reach[2 * n + FAN - 2 - i])));
		eased(high, false);
		for (const i of starts) high[i] = high[i - 1] = Math.min(high[i], high[i - 1]);

		outlines.push({ name: g.name, tone: g.tone, edge: rays.map((r, i) => along(r.walk, reach[i])), spine: list.map((st) => [st.u, st.v]), why: rays.map((r) => r.walk.why), walked: rays.map((r) => r.walk.reach), reach: reach.slice() });

		// The seat round this cushion: out from each line's foot, as wide as there is room for before another cushion's foot
		// or a machine; then that width made one sweep round the cushion, never wider.
		{
			const other: Tone = g.tone === 'yellow' ? 'blue' : 'yellow';
			const wide = rays.map((ray, ri) => {
				let got = 0;
				for (let d = 0.025; d <= SEAT.wide + 1e-6; d += 0.0125) {
					const [u, v] = along(ray.walk, reach[ri] + d);
					shell(u, v, spot, face);
					near.measure(spot, me);
					if (near.machine < SEAT.off || Math.hypot(u, v) > fit.trim) break;
					const seen = fit.drawn ? fit.drawn(other, spot, face) : null;
					// (The same rules the cushions themselves were cut by, each a seat's standing-off short of the next cushion's foot.)
					const between = (near.other - near.mine - fit.gap) / 2;
					const edge = Math.max(0, (face[2] - FACING - 0.1) / 0.2);
					if (seen !== null ? seen > -SEAT.off || (near.same - near.mine - fit.gap) / 2 < -(fit.gap - SEAT.off) || between + edge < -(fit.gap - SEAT.off) : between < -(fit.gap - SEAT.off)) break;
					got = d;
				}
				return got;
			});
			eased(wide, true, 3);
			const m = rays.length;
			const base = seatAt.length / 3;
			// The seat stands its hair off the cushion's foot measured square to the foot's edge. Where the edge runs askew to
			// the lines out from the middle, as it does round a tip, that is further along the line.
			const feet = rays.map((ray, ri) => raised(...along(ray.walk, reach[ri]), 0));
			const off = rays.map((ray, ri) => {
				const edge = sub(feet[(ri + 1) % m], feet[(ri + m - 1) % m]);
				const out = sub(feet[ri], list[ray.st].p);
				const square = Math.hypot(...cross(edge, out)) / (Math.hypot(...edge) * Math.hypot(...out) || 1);
				return Math.min(0.07, SEAT.off / Math.max(0.17, square));
			});
			// And measured, not trusted: each place of the seat's inside wall against the whole edge of the foot. Where it comes
			// nearer than its hair, it stands further off along its line, until it does not.
			const toFoot = (q: V3) => {
				let least = Infinity;
				for (let k = 0; k < m; k++) {
					const a = feet[k];
					if (Math.abs(a[0] - q[0]) + Math.abs(a[1] - q[1]) + Math.abs(a[2] - q[2]) > 0.5) continue;
					const ab = sub(feet[(k + 1) % m], a);
					const t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / (dot(ab, ab) || 1)));
					least = Math.min(least, Math.hypot(q[0] - a[0] - ab[0] * t, q[1] - a[1] - ab[1] * t, q[2] - a[2] - ab[2] * t));
				}
				return least;
			};
			const wallAt = (ri: number) => raised(...along(rays[ri].walk, reach[ri] + off[ri]), 0);
			rays.forEach((_, ri) => {
				for (let pass = 0; pass < 8 && toFoot(wallAt(ri)) < SEAT.off * 0.92; pass++) off[ri] = off[ri] * 1.3 + 0.002;
			});
			// The other way about as well: each corner of the foot against the stretches of the wall beside it.
			for (let pass = 0; pass < 8; pass++) {
				let moved = false;
				const wall = rays.map((_, ri) => wallAt(ri));
				for (let k = 0; k < m; k++)
					for (let j = k - 3; j <= k + 2; j++) {
						const a = wall[(j + m) % m];
						const ab = sub(wall[(j + 1 + m) % m], a);
						const t = Math.max(0, Math.min(1, dot(sub(feet[k], a), ab) / (dot(ab, ab) || 1)));
						if (Math.hypot(feet[k][0] - a[0] - ab[0] * t, feet[k][1] - a[1] - ab[1] * t, feet[k][2] - a[2] - ab[2] * t) >= SEAT.off * 0.92) continue;
						for (const r of [(j + m) % m, (j + 1 + m) % m]) off[r] = off[r] * 1.25 + 0.002;
						moved = true;
					}
				if (!moved) break;
			}
			const bare: boolean[] = [];
			rays.forEach((ray, ri) => {
				const gone = (bare[ri] = wide[ri] < off[ri] + 0.02 || low.some((b) => Math.hypot(feet[ri][0] - b.at[0], feet[ri][1] - b.at[1], feet[ri][2] - b.at[2]) < b.r));
				const w = gone ? off[ri] : wide[ri];
				const top = gone ? 0 : Math.min(SEAT.high, FLOAT + 0.9 * high[ray.st]);
				const r = reach[ri];
				// Inside wall, top, and the slope down to the core: two points for each, so each face is its own.
				const section: [number, number][] = [
					[r + off[ri], 0],
					[r + off[ri], top],
					[r + off[ri], top],
					[r + off[ri] + (w - off[ri]) * 0.5, top],
					[r + off[ri] + (w - off[ri]) * 0.5, top],
					[r + w, 0.003]
				];
				for (const [out, up] of section) seatAt.push(...raised(...along(ray.walk, out), up, fit.face));
			});
			for (let ri = 0; ri < m; ri++) {
				const a = base + ri * 6;
				const b = base + ((ri + 1) % m) * 6;
				// (Where there is no seat on either hand, there is nothing.)
				if (bare[ri] && bare[(ri + 1) % m]) continue;
				for (const f of [0, 2, 4]) seatIndex.push(a + f, b + f, b + f + 1, a + f, b + f + 1, a + f + 1);
			}
		}
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
				for (const [inset, height, rise] of section(reach[ri], h)) {
					const [u, v] = along(ray.walk, reach[ri] - inset);
					col.push(mesh.vertex(raised(u, v, FLOAT + height, fit.face), rise, id));
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

	return { position: new Float32Array(mesh.position), rise: new Float32Array(mesh.rise), plate: new Uint16Array(mesh.plate), index: new Uint32Array(mesh.index), seat: { position: new Float32Array(seatAt), index: new Uint32Array(seatIndex) }, plates, outlines, crests };
}
