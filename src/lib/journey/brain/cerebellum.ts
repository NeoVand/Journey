/*
 * The cerebellum under the back of each half, built from the drawing's own curves (traced.ts) and not from a circle:
 * a lobe of wound copper whose outline, seen from the side, is the outline Neo Mohsenvand drew, and on it a blue lid
 * whose lower edge is the lower edge of the drawn crescent. Seen from above, both are ovals, longer than they are wide,
 * as the drawing from behind has them.
 *
 * The lobe is a stack of windings, each an oval whose length at its height is the drawn outline's. The lid is one closed
 * piece that sits on the lobe all the way round, stands a little proud of it, and goes on up into the body of the brain:
 * the brain is solid there and the lid passes into it, so there is no opening between them from any side, and what shows
 * of the lid is what is below the brain's own underside. Lid and lobe are one thing, and dip together.
 */
import * as THREE from 'three';
import { rbox } from '../kit/geometry';
import { beneath, CEREBELLUM } from './design';
import { FISSURE, shell, type V3 } from './shell';
import { fair } from './solve';
import { MID_X, MID_Y, PX } from './tones';
import { TRACED } from './traced';

type P2 = [number, number];
/** A traced outline in the brain's own units, in the fissure's plane: x forward, y up. */
const outline = (o: number[]): P2[] => {
	const pts: P2[] = [];
	for (let i = 0; i < o.length; i += 2) pts.push([(o[i] / 2 - MID_X) / PX, (MID_Y - o[i + 1] / 2) / PX]);
	return pts;
};
/** Where a level line (at height y) or an upright one (at x) crosses an outline: the least and the most of the crossings. */
function across(pts: P2[], at: number, upright: boolean): P2 | null {
	const a = upright ? 0 : 1;
	let lo = Infinity;
	let hi = -Infinity;
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const q = pts[(i + 1) % pts.length];
		if (p[a] <= at === q[a] <= at) continue;
		const v = p[1 - a] + ((at - p[a]) / (q[a] - p[a])) * (q[1 - a] - p[1 - a]);
		lo = Math.min(lo, v);
		hi = Math.max(hi, v);
	}
	return lo <= hi ? [lo, hi] : null;
}

const COPPER = outline(TRACED.copper);
const BRIM = outline(TRACED.brim);

/** How far out from the fissure's middle the lobe's own middle is, and how wide it is for its length (from the drawing from behind). */
const OUT = CEREBELLUM.out;
export const WIDE = CEREBELLUM.wide;
/** How far the lid's face stands off the lobe. */
const THICK = 0.14;
const SLIM = 0.965;
/** How far the lobe dips as a pass comes down to it. */
export const DIP = 0.06;
/** How far up inside its lid the lobe goes on, above its top as drawn. */
const NECK = 0.3;

/** The lobe as drawn: where its lowest point is, how high its flat top is, and how far it reaches at each of a run of heights from the top down. */
export const LOBE = (() => {
	const low = Math.min(...COPPER.map((p) => p[1]));
	const under = COPPER.filter((p) => p[1] < low + 0.03);
	const x = under.reduce((s, p) => s + p[0], 0) / under.length;
	const top = Math.max(...COPPER.map((p) => p[1])) - 0.02;
	// The drawing shows the lobe's back whole and hides its front behind the brainstem: its back is its outline, both ways.
	const levels = 26;
	const reach: number[] = [];
	for (let k = 0; k <= levels; k++) {
		const y = top - ((top - low) * Math.min(k, levels - 0.25)) / levels;
		reach.push(k === levels ? 0 : (x - (across(COPPER, y, false)?.[0] ?? x)) * SLIM);
	}
	// Never narrower higher up than lower down (the drawing's brim hides the very top of the lobe: it is as wide there as
	// just below), and no step from one height to the next: the drawn curve, without the grain of its pixels.
	for (let k = levels; k >= 1; k--) reach[k - 1] = Math.max(reach[k - 1], reach[k]);
	for (let pass = 0; pass < 2; pass++) for (let k = 1; k < levels; k++) reach[k] = (reach[k - 1] + 2 * reach[k] + reach[k + 1]) / 4;
	return { x, z: OUT, top, low, reach, levels };
})();

/** The drawn crescent: where along the brain it runs from and to. */
const SPAN = (() => {
	const xs = BRIM.map((p) => p[0]);
	return { from: Math.min(...xs), to: Math.max(...xs) };
})();

/** Rings stacked into a skin: each ring an oval about the lobe's axis, given by how far it reaches and how high it is. */
function stacked(rings: P2[], sides = 72) {
	const pos: number[] = [];
	const idx: number[] = [];
	rings.forEach(([r, y], i) => {
		for (let j = 0; j < sides; j++) {
			const a = (j / sides) * Math.PI * 2;
			pos.push(LOBE.x + r * Math.cos(a), y, LOBE.z + r * WIDE * Math.sin(a));
		}
		if (!i) return;
		for (let j = 0; j < sides; j++) {
			const p = (i - 1) * sides + j;
			const q = (i - 1) * sides + ((j + 1) % sides);
			idx.push(p, q, q + sides, p, q + sides, p + sides);
		}
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** The lobe: copper wound round it turn on turn, from under its brim to its foot, with one dark band across the windings as the drawing has. */
export function lobe() {
	const { top, low, reach, levels } = LOBE;
	const curve = new THREE.SplineCurve(reach.map((r, k) => new THREE.Vector2(r, top - ((top - low) * k) / levels)));
	const turns = 21;
	const per = 5;
	const along = (t: number, proud: number): P2 => {
		const p = curve.getPointAt(t);
		const d = curve.getTangentAt(t);
		// Out from the lobe: the curve runs down and inwards, so its outward side is to its left.
		return [Math.max(0, p.x - d.y * proud), p.y + d.x * proud];
	};
	// (Under its lid it goes on up a little way, plain: the lid's lower edge is nowhere above copper.)
	const copper: P2[] = [[0, top + NECK], [reach[0] - 0.03, top + NECK]];
	for (let i = 0; i <= turns * per; i++) copper.push(along(i / (turns * per), 0.03 * Math.sin(((i % per) / per) * Math.PI)));
	const band: P2[] = [];
	for (let i = 0; i <= 4; i++) band.push(along(0.5 + (0.03 * i) / 4, i === 0 || i === 4 ? 0.015 : 0.04));
	return { copper: stacked(copper), dark: stacked(band) };
}

/** How far the lobe reaches at a height: its drawn outline, and above its top as far as at its top. */
function reachAt(y: number) {
	const k = Math.max(0, Math.min(LOBE.levels, ((LOBE.top - y) / (LOBE.top - LOBE.low)) * LOBE.levels));
	const i = Math.min(LOBE.levels - 1, Math.floor(k));
	return LOBE.reach[i] + (LOBE.reach[i + 1] - LOBE.reach[i]) * (k - i);
}

/** How high the lid goes: over its whole footprint it is well up inside the body of the brain, dipped or not. */
const LID_TOP = (() => {
	const p: V3 = [0, 0, 0];
	const n: V3 = [0, 0, 0];
	let top = LOBE.top + NECK + 0.1;
	for (let k = 1; k <= 6; k++)
		for (let s = 0; s < 48; s++) {
			const a = (s / 48) * Math.PI * 2;
			const r = ((LOBE.reach[0] + THICK + 0.03) * k) / 6;
			const under = beneath(LOBE.x - r * Math.cos(a), LOBE.z + r * WIDE * Math.sin(a));
			if (!under) continue;
			shell(under[0], under[1], p, n);
			top = Math.max(top, p[1] + DIP + 0.12);
		}
	return top;
})();

/**
 * The lid: from its lower edge, which is the drawn crescent's, up its face and over a flat top that is never seen. Its
 * section at each place round: in under its edge to the lobe, out along the edge's underside, up a bevel, up the face
 * (which stands off the lobe by the lid's thickness, and a little more in its middle, as a cushion does), and in over
 * the top. Each of those has points of its own, so they meet in edges. Where it would come through the flat inner face of
 * its half into the fissure it is cut off flat, as the cushions are. And its lights.
 */
export function lid() {
	const { from, to } = SPAN;
	// How high its lower edge is at each place along the brain: the fair curve through what was measured of the drawn
	// crescent's (see solve.ts), and nowhere above the copper it sits on.
	// (At its very ends the crescent comes to a point, and its lower edge curls up into it: that is the lid going out of
	// sight round the lobe, not its edge rising, so the edge is taken from between the points and runs level into them.)
	const samples = 60;
	const measured = Array.from({ length: samples + 1 }, (_, k) => across(BRIM, from + 0.02 + ((to - from - 0.04) * k) / samples, true)?.[0] ?? LOBE.top);
	const ends = Math.round(samples * 0.09);
	for (let k = 0; k < ends; k++) {
		measured[k] = measured[ends];
		measured[samples - k] = measured[samples - ends];
	}
	const low = fair(measured, 40);
	const edge = (x: number) => {
		const k = Math.max(0, Math.min(samples - 1e-6, ((x - from - 0.02) / (to - from - 0.04)) * samples));
		const i = Math.floor(k);
		return Math.min(low[i] + (low[i + 1] - low[i]) * (k - i), LOBE.top + NECK - 0.1);
	};
	const far = reachAt(LOBE.top) + THICK;
	const bevel = 0.028;
	const rows = 14;
	const steps = 144;
	const section = (a: number): P2[] => {
		const bottom = edge(LOBE.x - far * Math.cos(a));
		const face: P2[] = [];
		for (let j = 0; j <= rows; j++) {
			const y = bottom + bevel + ((LID_TOP - bevel - bottom - bevel) * j) / rows;
			face.push([reachAt(y) + THICK + 0.022 * Math.sin(Math.PI * Math.min(1, (y - bottom) / 0.62)), y]);
		}
		return [[reachAt(bottom) - 0.09, bottom], [reachAt(bottom) + THICK - bevel, bottom], ...face, [face[rows][0] - bevel, LID_TOP], [0, LID_TOP]];
	};
	const at = (a: number, [r, y]: P2): V3 => [LOBE.x - r * Math.cos(a), y, Math.max(FISSURE + 0.004, LOBE.z + r * WIDE * Math.sin(a))];
	// Its faces, each a band round the lid between two of the section's points (the face itself between a run of them).
	const bands: [number, number][] = [
		[0, 1],
		[1, 2],
		[2, rows + 2],
		[rows + 2, rows + 3],
		[rows + 3, rows + 4]
	];
	const blue = bands.map(([first, last]) => {
		const pos: number[] = [];
		const idx: number[] = [];
		const count = last - first + 1;
		for (let s = 0; s < steps; s++) {
			const a = (s / steps) * Math.PI * 2;
			const pts = section(a);
			for (let j = first; j <= last; j++) pos.push(...at(a, pts[j]));
			const next = ((s + 1) % steps) * count;
			for (let j = 0; j < count - 1; j++) idx.push(s * count + j, next + j, next + j + 1, s * count + j, next + j + 1, s * count + j + 1);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setIndex(idx);
		g.computeVertexNormals();
		return g.toNonIndexed();
	});
	// The row of lights in its face, where the drawing has them: on the side, a little back of the middle.
	const lights: THREE.BufferGeometry[] = [];
	for (let k = 0; k < 4; k++) {
		const a = Math.acos(0.26 - 0.085 * k);
		const pts = section(a);
		const [r, y] = pts[2 + Math.round(rows * 0.2)];
		// Facing out of the oval there: its outward way is (-cos a, sin a / WIDE), laid flat.
		const place = new THREE.Matrix4().makeRotationY(-Math.atan2(Math.sin(a) / WIDE, -Math.cos(a))).setPosition(LOBE.x - (r + 0.008) * Math.cos(a), y, LOBE.z + (r + 0.008) * WIDE * Math.sin(a));
		lights.push(rbox(0.014, 0.1, 0.035, 0.006, 1).applyMatrix4(place));
	}
	return { blue, lights };
}
