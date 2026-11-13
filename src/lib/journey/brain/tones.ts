/*
 * The drawings, asked: is this place of the brain yellow, or blue, in Neo Mohsenvand's drawings, and how far is it to the
 * edge of that cushion? The cushions' outlines were traced from the four drawings (traced.ts); this lays a point of the
 * brain into them and measures it against them. So the cushions are not shapes of ours that resemble the drawings: their
 * edges are the drawings' edges.
 *
 * There are four drawings (from the side, from above, from the front and from the back) and they do not agree: each is
 * believed where it looks at the brain most squarely, the side one, the master, furthest. Between two of them the
 * distance to the edge is a blend of theirs, by how squarely each looks, so the cushions of one pass over into the
 * cushions of the other as a level line does between two heights, with no seam.
 */
import { TRACED } from './traced';
import type { V3 } from './shell';

export type Tone = 'yellow' | 'blue';

/** The side drawing's scale and middle: its pixels to the brain's units. */
export const PX = 97.7;
export const MID_X = 834.5;
export const MID_Y = 416;
/** A drawing shows a cushion's edge where its top turns over into its side: about this far off the core. */
const EDGE = 0.2;
/** A drawing sees a place only while the place faces it at least this much; nearer its horizon it is not to be trusted. */
export const FACING = 0.2;
/** Nothing is ever said to be further from an edge than this, in the brain's units. */
const FAR = 0.92;
const CELL = 30;
/** The side drawing is the master: where it sees a place at all, it has this many times the say of another that sees it as well. */
const MASTER = 2;
/** How sharply one drawing hands over to the next: the higher, the narrower the band in which both have a say. */
const HANDOVER = 8;
/** In that band no drawing says a place is further than this from an edge, so that the blend has no steep places. */
const BLENDED = 0.3;

interface Region {
	box: [number, number, number, number];
	/** x, y of each point, in pixels. */
	at: number[];
}

class Field {
	private regions: Region[] = [];
	/** The cushions' own edges (not the horizon's), sorted into a grid: x0, y0, x1, y1 of each. */
	private edges: number[] = [];
	private grid = new Map<number, number[]>();

	constructor(
		outlines: number[][],
		private far: number
	) {
		for (const o of outlines) {
			const at: number[] = [];
			const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
			const n = o.length / 3;
			for (let i = 0; i < n; i++) {
				const x = o[i * 3] / 2;
				const y = o[i * 3 + 1] / 2;
				at.push(x, y);
				box[0] = Math.min(box[0], x);
				box[1] = Math.min(box[1], y);
				box[2] = Math.max(box[2], x);
				box[3] = Math.max(box[3], y);
				if (o[i * 3 + 2]) continue;
				const j = (i + 1) % n;
				this.edge(x, y, o[j * 3] / 2, o[j * 3 + 1] / 2);
			}
			this.regions.push({ box, at });
		}
	}

	private edge(x0: number, y0: number, x1: number, y1: number) {
		const id = this.edges.length / 4;
		this.edges.push(x0, y0, x1, y1);
		const reach = this.far;
		for (let i = Math.floor((Math.min(x0, x1) - reach) / CELL); i <= Math.floor((Math.max(x0, x1) + reach) / CELL); i++)
			for (let j = Math.floor((Math.min(y0, y1) - reach) / CELL); j <= Math.floor((Math.max(y0, y1) + reach) / CELL); j++) {
				const key = i * 4096 + j;
				const list = this.grid.get(key);
				if (list) list.push(id);
				else this.grid.set(key, [id]);
			}
	}

	/** How far inside this colour a pixel is (below zero, outside), by the nearest edge that is a cushion's own. */
	inside(x: number, y: number) {
		let far = this.far;
		const e = this.edges;
		for (const id of this.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(y / CELL)) ?? []) {
			const ax = e[id * 4];
			const ay = e[id * 4 + 1];
			const dx = e[id * 4 + 2] - ax;
			const dy = e[id * 4 + 3] - ay;
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
			const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
			if (d < far) far = d;
		}
		for (const r of this.regions) {
			if (x < r.box[0] || x > r.box[2] || y < r.box[1] || y > r.box[3]) continue;
			let odd = false;
			const p = r.at;
			for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if (p[i + 1] > y !== p[j + 1] > y && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) odd = !odd;
			if (odd) return far;
		}
		return -far;
	}
}

/** One drawing: how squarely a place facing some way faces it, where a point of the brain falls in it, and its cushions. */
interface Drawing {
	facing: (n: V3) => number;
	/** How much its word counts beside the others'. */
	weight: number;
	x: (p: V3) => number;
	y: (p: V3) => number;
	/** Its pixels to the brain's units (the finer of its two scales, so a distance in it is never said longer than it is). */
	scale: number;
	yellow: Field;
	blue: Field;
}

const drawing = (traced: { yellow: number[][]; blue: number[][] }, scale: number, weight: number, facing: Drawing['facing'], x: Drawing['x'], y: Drawing['y']): Drawing => ({
	facing,
	weight,
	x,
	y,
	scale,
	yellow: new Field(traced.yellow, FAR * scale),
	blue: new Field(traced.blue, FAR * scale)
});

/**
 * The drawings that show both halves show them closed up, with a hairline between; the halves of the build stand apart,
 * with works between them. So what those drawings have beside the fissure is laid onto the core moved out from it: by
 * half the fissure at the fissure itself, and by less and less out to SPREAD from it.
 */
const SHUT = 0.5;
const SPREAD = 2.2;
const shut = (z: number) => z - SHUT * Math.max(0, 1 - z / SPREAD);

/*
 * The drawings from the front and from the back look at the brain level: of a place that faces down they see little, and
 * what they show there is the brainstem and what hangs under the brain, not the brain. (Of the drawings that show both
 * halves the right-hand half was traced, and this is the half with z above zero: so z goes to the right in all three.)
 */
const DRAWINGS: Drawing[] = [
	drawing(TRACED, PX, MASTER, (n) => n[2], (p) => MID_X + PX * p[0], (p) => MID_Y - PX * p[1]),
	drawing(TRACED.top, 54, 1, (n) => n[1], (p) => 548.5 + 53.4 * shut(p[2]), (p) => 307 - 54 * p[0]),
	drawing(TRACED.front, 72.2, 1, (n) => n[0] + Math.min(0, n[1]), (p) => 551 + 72.2 * shut(p[2]), (p) => 18 + (3.92 - p[1]) * 64.9),
	drawing(TRACED.back, 66.7, 1, (n) => -n[0] + Math.min(0, n[1]), (p) => 550 + 66.7 * shut(p[2]), (p) => 20 + (3.92 - p[1]) * 64.9)
];

const say = [0, 0, 0, 0];
const raised: V3 = [0, 0, 0];

/** How much each drawing has to say about a place that faces this way (into `say`); the sum, or zero where none sees it. */
function weigh(n: V3) {
	let most = 0;
	for (let k = 0; k < 4; k++) {
		const w = Math.max(0, DRAWINGS[k].facing(n) - FACING) * DRAWINGS[k].weight;
		say[k] = w;
		if (w > most) most = w;
	}
	if (most <= 0) return 0;
	let sum = 0;
	for (let k = 0; k < 4; k++) {
		// A drawing with under a hundredth of the say of the best has none: so most places are one drawing's alone.
		const w = Math.max(0, (say[k] / most) ** HANDOVER - 0.01);
		say[k] = w;
		sum += w;
	}
	return sum;
}

/** How surely the drawings see a place that faces this way: nought at the edge of what any of them sees, more inside it. */
export function sight(n: V3) {
	let most = 0;
	for (const d of DRAWINGS) most = Math.max(most, d.facing(n) - FACING);
	return most;
}

/** Whether the drawings can be trusted about a place of the core that faces this way. */
export const sees = (n: V3) => sight(n) > 0;

function measure(tone: Tone | null, p: V3, n: V3): number | null {
	const sum = weigh(n);
	if (!sum) return null;
	raised[0] = p[0] + n[0] * EDGE;
	raised[1] = p[1] + n[1] * EDGE;
	raised[2] = p[2] + n[2] * EDGE;
	let alone = -1;
	for (let k = 0; k < 4; k++) if (say[k] === sum) alone = k;
	let all = 0;
	for (let k = 0; k < 4; k++) {
		if (!say[k]) continue;
		const d = DRAWINGS[k];
		const x = d.x(raised);
		const y = d.y(raised);
		const far = (tone ? d[tone].inside(x, y) : Math.max(d.yellow.inside(x, y), d.blue.inside(x, y))) / d.scale;
		if (k === alone) return far;
		all += say[k] * Math.max(-BLENDED, Math.min(BLENDED, far));
	}
	return all / sum;
}

/**
 * How far inside the drawings' cushions of one colour a place of the core is, in the brain's units (below zero, outside
 * them), or null where no drawing can say because the place is turned too far from all of them. Distances are measured
 * in a drawing, flat, so on the core they are never less than this.
 */
export const drawn = (tone: Tone, p: V3, n: V3): number | null => measure(tone, p, n);

/** How far outside every drawn cushion a place is (below zero, under one), or null where no drawing can say. */
export function clearOfDrawn(p: V3, n: V3): number | null {
	const far = measure(null, p, n);
	return far === null ? null : -far;
}
