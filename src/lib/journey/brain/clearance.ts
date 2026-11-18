/*
 * How near two solids come: the least distance from any corner of one to the surface of the other, either way round.
 * Used to check that nothing in the brain touches anything else, at rest or anywhere in its motion.
 */
import type * as THREE from 'three';

/** A solid as bare numbers: its corners, and its triangles as triples of corners. */
export interface Soup {
	p: Float32Array;
	tri: Uint32Array;
}

/** A geometry's corners and triangles; with a matrix, where that puts it. */
export function soup(geo: THREE.BufferGeometry, at?: THREE.Matrix4): Soup {
	const g = at ? geo.clone().applyMatrix4(at) : geo;
	const p = Float32Array.from(g.getAttribute('position').array);
	const n = p.length / 3;
	const tri = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
	return { p, tri };
}

/** Several solids as one. */
export function together(list: Soup[]): Soup {
	const p = new Float32Array(list.reduce((s, a) => s + a.p.length, 0));
	const tri = new Uint32Array(list.reduce((s, a) => s + a.tri.length, 0));
	let at = 0;
	let ti = 0;
	for (const a of list) {
		p.set(a.p, at);
		for (let i = 0; i < a.tri.length; i++) tri[ti++] = a.tri[i] + at / 3;
		at += a.p.length;
	}
	return { p, tri };
}

/** The same solid moved by a step. */
export function shifted(a: Soup, d: [number, number, number]): Soup {
	const p = new Float32Array(a.p.length);
	for (let i = 0; i < p.length; i += 3) {
		p[i] = a.p[i] + d[0];
		p[i + 1] = a.p[i + 1] + d[1];
		p[i + 2] = a.p[i + 2] + d[2];
	}
	return { p, tri: a.tri };
}

/** How far a point is from a triangle. */
function toTriangle(px: number, py: number, pz: number, t: Float32Array, a: number, b: number, c: number) {
	const ax = t[a], ay = t[a + 1], az = t[a + 2];
	const abx = t[b] - ax, aby = t[b + 1] - ay, abz = t[b + 2] - az;
	const acx = t[c] - ax, acy = t[c + 1] - ay, acz = t[c + 2] - az;
	const apx = px - ax, apy = py - ay, apz = pz - az;
	const d1 = abx * apx + aby * apy + abz * apz;
	const d2 = acx * apx + acy * apy + acz * apz;
	let u: number, w: number;
	if (d1 <= 0 && d2 <= 0) [u, w] = [0, 0];
	else {
		const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
		const d3 = abx * bpx + aby * bpy + abz * bpz;
		const d4 = acx * bpx + acy * bpy + acz * bpz;
		if (d3 >= 0 && d4 <= d3) [u, w] = [1, 0];
		else {
			const vc = d1 * d4 - d3 * d2;
			if (vc <= 0 && d1 >= 0 && d3 <= 0) [u, w] = [d1 / (d1 - d3), 0];
			else {
				const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
				const d5 = abx * cpx + aby * cpy + abz * cpz;
				const d6 = acx * cpx + acy * cpy + acz * cpz;
				if (d6 >= 0 && d5 <= d6) [u, w] = [0, 1];
				else {
					const vb = d5 * d2 - d1 * d6;
					if (vb <= 0 && d2 >= 0 && d6 <= 0) [u, w] = [0, d2 / (d2 - d6)];
					else {
						const va = d3 * d6 - d5 * d4;
						if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
							w = (d4 - d3) / (d4 - d3 + (d5 - d6));
							u = 1 - w;
						} else {
							const k = 1 / (va + vb + vc);
							u = vb * k;
							w = vc * k;
						}
					}
				}
			}
		}
	}
	const dx = apx - abx * u - acx * w;
	const dy = apy - aby * u - acy * w;
	const dz = apz - abz * u - acz * w;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** A solid's triangles sorted into a grid, so the ones near a point can be found. */
class Sorted {
	private lo = [Infinity, Infinity, Infinity];
	private size = [1, 1, 1];
	private cells: number[][] = [];
	constructor(
		private s: Soup,
		private cell: number
	) {
		const hi = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < s.p.length; i++) {
			this.lo[i % 3] = Math.min(this.lo[i % 3], s.p[i]);
			hi[i % 3] = Math.max(hi[i % 3], s.p[i]);
		}
		for (let k = 0; k < 3; k++) this.size[k] = Math.floor((hi[k] - this.lo[k]) / cell) + 1;
		this.cells = Array.from({ length: this.size[0] * this.size[1] * this.size[2] }, () => []);
		for (let t = 0; t < s.tri.length; t += 3) {
			const lo = [Infinity, Infinity, Infinity];
			const top = [-Infinity, -Infinity, -Infinity];
			for (let c = 0; c < 3; c++)
				for (let k = 0; k < 3; k++) {
					const x = s.p[s.tri[t + c] * 3 + k];
					lo[k] = Math.min(lo[k], x);
					top[k] = Math.max(top[k], x);
				}
			const a = lo.map((x, k) => Math.floor((x - this.lo[k]) / cell));
			const b = top.map((x, k) => Math.floor((x - this.lo[k]) / cell));
			for (let i = a[0]; i <= b[0]; i++) for (let j = a[1]; j <= b[1]; j++) for (let k = a[2]; k <= b[2]; k++) this.cells[(i * this.size[1] + j) * this.size[2] + k].push(t);
		}
	}

	/** The least distance from a point to the solid's surface, if it is within `reach`; otherwise `reach`. */
	near(x: number, y: number, z: number, reach: number) {
		const c = this.cell;
		const a = [x - reach, y - reach, z - reach].map((q, k) => Math.max(0, Math.floor((q - this.lo[k]) / c)));
		const b = [x + reach, y + reach, z + reach].map((q, k) => Math.min(this.size[k] - 1, Math.floor((q - this.lo[k]) / c)));
		let best = reach;
		for (let i = a[0]; i <= b[0]; i++)
			for (let j = a[1]; j <= b[1]; j++)
				for (let k = a[2]; k <= b[2]; k++)
					for (const t of this.cells[(i * this.size[1] + j) * this.size[2] + k]) {
						const d = toTriangle(x, y, z, this.s.p, this.s.tri[t] * 3, this.s.tri[t + 1] * 3, this.s.tri[t + 2] * 3);
						if (d < best) best = d;
					}
		return best;
	}
}

const sorted = new WeakMap<Soup, Sorted>();
const sort = (s: Soup) => {
	let known = sorted.get(s);
	if (!known) sorted.set(s, (known = new Sorted(s, 0.2)));
	return known;
};

/**
 * The least distance between two solids, as far as corners and surfaces can tell, looking no further than `reach`.
 * Also where: the corner that came nearest.
 */
export function clearance(a: Soup, b: Soup, reach = 0.3): { gap: number; at: [number, number, number] } {
	let gap = reach;
	let at: [number, number, number] = [0, 0, 0];
	for (const [from, to] of [
		[a, b],
		[b, a]
	] as const) {
		if (!to.tri.length || !from.p.length) continue;
		const grid = sort(to);
		for (let i = 0; i < from.p.length; i += 3) {
			const d = grid.near(from.p[i], from.p[i + 1], from.p[i + 2], gap);
			if (d < gap) {
				gap = d;
				at = [from.p[i], from.p[i + 1], from.p[i + 2]];
			}
		}
	}
	return { gap, at };
}
