/*
 * The drawing, asked: is this place of the brain yellow, or blue, in Neo Mohsenvand's side drawing, and how far is it
 * to the edge of that cushion? The cushions' outlines were traced from the drawing (traced.ts); this lays a point of the
 * brain into the drawing and measures it against them. So the cushions on the side of the brain are not shapes of ours
 * that resemble the drawing: their edges are the drawing's edges.
 */
import { TRACED } from './traced';
import type { V3 } from './shell';

export type Tone = 'yellow' | 'blue';

/** The side drawing's scale and middle: its pixels to the brain's units. */
export const PX = 97.7;
export const MID_X = 834.5;
export const MID_Y = 416;
/** The drawing shows a cushion's edge where its top turns over into its side: about this far off the core. */
const EDGE = 0.2;
/** The drawing sees a place only while it faces the drawing at least this much; nearer the horizon it is not to be trusted. */
const FACING = 0.3;
/** Nothing is ever said to be further from an edge than this, in pixels. */
const FAR = 90;
const CELL = 30;

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

	constructor(outlines: number[][]) {
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
		const reach = FAR;
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
		let far = FAR;
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

const fields: Record<Tone, Field> = { yellow: new Field(TRACED.yellow), blue: new Field(TRACED.blue) };

/** Whether the drawing can be trusted about a place of the core that faces this way. */
export const sees = (n: V3) => n[2] > FACING;

/**
 * How far inside the drawing's cushions of one colour a place of the core is, in the brain's units (below zero, outside
 * them), or null where the drawing cannot say because the place is turned too far from it. Distances are measured in the
 * drawing, flat, so on the core they are never less than this.
 */
export function drawn(tone: Tone, p: V3, n: V3): number | null {
	if (!sees(n)) return null;
	return fields[tone].inside(MID_X + PX * (p[0] + n[0] * EDGE), MID_Y - PX * (p[1] + n[1] * EDGE)) / PX;
}

/** How far outside every drawn cushion a place is (below zero, under one), or null where the drawing cannot say. */
export function clearOfDrawn(p: V3, n: V3): number | null {
	if (!sees(n)) return null;
	const x = MID_X + PX * (p[0] + n[0] * EDGE);
	const y = MID_Y - PX * (p[1] + n[1] * EDGE);
	return -Math.max(fields.yellow.inside(x, y), fields.blue.inside(x, y)) / PX;
}
