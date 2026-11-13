/*
 * The cerebellum under the back of each half, built from the drawing's own curves (traced.ts) and not from a circle:
 * a lobe of wound copper whose outline, seen from the side, is the outline Neo Mohsenvand drew, and over it a blue brim
 * that is the drawn crescent, thick in the middle and running out to a point at either end. Seen from above, both are
 * ovals, longer than they are wide, as the drawing from behind has them.
 *
 * The lobe is a stack of windings, each an oval whose length at its height is the drawn outline's; the brim is swept
 * round the top of the lobe, as tall at each place along the brain as the drawn crescent is there. Its faces meet in
 * edges, not in rounds.
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
/** How thick the brim is, from its face in towards the lobe; the lobe is drawn this much smaller, to clear it. */
const THICK = 0.14;
const SLIM = 0.965;
/** How far the lobe dips as a pass comes down to it. */
export const DIP = 0.06;

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

/** The brim as drawn: where along the brain it runs from and to, and its highest point. */
const SPAN = (() => {
	const xs = BRIM.map((p) => p[0]);
	const from = Math.min(...xs);
	const to = Math.max(...xs);
	return { from, to, mid: (from + to) / 2, half: (to - from) / 2, crest: Math.max(...BRIM.map((p) => p[1])) };
})();

/**
 * The recess the cerebellum sits up in: the drawing has the brim tucked up under the back of the brain, higher than the
 * core's own underside, so the core is hollowed there. Seen from below it is an oval a little larger than the brim, and
 * it goes up to a flat ceiling just over the brim's crest.
 */
export const RECESS = { x: SPAN.mid, z: OUT, a: SPAN.half + 0.06, b: (SPAN.half + 0.06) * WIDE, top: SPAN.crest + 0.05 };

/** The recess's own skin: its ceiling, and its wall from the ceiling down to where the core's underside begins. */
export function recess() {
	const pos: number[] = [];
	const idx: number[] = [];
	const p: V3 = [0, 0, 0];
	const n: V3 = [0, 0, 0];
	const steps = 96;
	// Only where the recess is in the core's own body: not through its flat inner face.
	const from = Math.asin(Math.max(-1, (FISSURE + 0.004 - RECESS.z) / RECESS.b));
	for (let s = 0; s <= steps; s++) {
		const a = from + ((Math.PI - 2 * from) * s) / steps;
		const x = RECESS.x + RECESS.a * Math.cos(a);
		const z = RECESS.z + RECESS.b * Math.sin(a);
		const under = beneath(x, z);
		if (under) shell(under[0], under[1], p, n);
		pos.push(x, RECESS.top, z, x, under ? Math.min(RECESS.top, p[1]) : RECESS.top, z);
		if (s) idx.push(s * 2 - 2, s * 2, s * 2 + 1, s * 2 - 2, s * 2 + 1, s * 2 - 1);
	}
	const hub = pos.length / 3;
	pos.push(RECESS.x, RECESS.top, RECESS.z);
	for (let s = 1; s <= steps; s++) idx.push(hub, s * 2, s * 2 - 2);
	idx.push(hub, 0, steps * 2);
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	const flat = g.toNonIndexed();
	flat.computeVertexNormals();
	return flat;
}

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
	const copper: P2[] = [[0, top], [reach[0] - 0.03, top]];
	for (let i = 0; i <= turns * per; i++) copper.push(along(i / (turns * per), 0.03 * Math.sin(((i % per) / per) * Math.PI)));
	const band: P2[] = [];
	for (let i = 0; i <= 4; i++) band.push(along(0.5 + (0.03 * i) / 4, i === 0 || i === 4 ? 0.015 : 0.04));
	return { copper: stacked(copper), dark: stacked(band) };
}

/** The brim: the drawn crescent swept round the top of the lobe, with its lights; and the dark cap inside it. */
export function brim() {
	const { from, to, mid, half } = SPAN;
	// Seen from above it is an oval round the lobe; how far it reaches along the brain is the drawn crescent's length.
	const steps = 96;
	// How high its crest and its underside are at each place along the brain: the drawn crescent's two edges, each the fair
	// curve through what was measured of it (see solve.ts), and meeting in a point at either end.
	const samples = 60;
	const measured = Array.from({ length: samples + 1 }, (_, k) => across(BRIM, from + 0.02 + ((to - from - 0.04) * k) / samples, true) ?? [0, 0]);
	const low = fair(measured.map((m) => m[0]), 6);
	const high = fair(measured.map((m) => m[1]), 6);
	const edges = (x: number): P2 => {
		const k = Math.max(0, Math.min(samples - 1e-6, ((x - from - 0.02) / (to - from - 0.04)) * samples));
		const i = Math.floor(k);
		const bottom = low[i] + (low[i + 1] - low[i]) * (k - i);
		const crest = high[i] + (high[i + 1] - high[i]) * (k - i);
		// Towards a tip the two edges close on the middle between them.
		const close = Math.min(1, (Math.max(0, Math.min(x - from, to - x)) / 0.22) ** 0.75);
		return [(bottom + crest) / 2 - ((crest - bottom) / 2) * close, (bottom + crest) / 2 + ((crest - bottom) / 2) * close];
	};
	// Its section at each place round: from its inside foot, out along its underside, up its face to a crease, in over its
	// shoulder and back down its inside. Each face has points of its own, so the faces meet in edges.
	const faces = 6;
	const strips: number[][] = Array.from({ length: faces }, () => []);
	const index: number[][] = Array.from({ length: faces }, () => []);
	for (let s = 0; s <= steps; s++) {
		const a = (s / steps) * Math.PI * 2;
		const x = mid - half * Math.cos(a);
		const [bottom, crest] = edges(x);
		const h = crest - bottom;
		const bevel = Math.min(0.028, h / 5);
		const thick = Math.min(THICK, h * 1.2);
		const out = half;
		const section: P2[] = [
			[out - thick, bottom],
			[out - bevel, bottom],
			[out, bottom + bevel],
			[out + 0.02, bottom + h * 0.56],
			[out - thick * 0.42, crest - bevel],
			[out - thick * 0.42 - bevel, crest],
			[out - thick, crest - bevel * 0.5]
		];
		const at = ([r, y]: P2) => [mid - r * Math.cos(a), y, LOBE.z + r * WIDE * Math.sin(a)];
		for (let f = 0; f < faces; f++) {
			strips[f].push(...at(section[f]), ...at(section[f + 1]));
			if (s) {
				const p = (s - 1) * 2;
				index[f].push(p, p + 3, p + 1, p, p + 2, p + 3);
			}
		}
	}
	const parts = strips.map((pos, f) => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setIndex(index[f]);
		g.computeVertexNormals();
		return g.toNonIndexed();
	});
	// The row of lights in its face, where the drawing has them: a third of the way along from the back.
	const lights: THREE.BufferGeometry[] = [];
	for (let k = 0; k < 4; k++) {
		const x = from + (to - from) * (0.36 + 0.036 * k);
		const a = Math.acos((mid - x) / half);
		const [bottom, crest] = edges(x);
		const out = half;
		// Facing out of the oval there: its outward way is (-cos a, sin a / WIDE), laid flat.
		const place = new THREE.Matrix4().makeRotationY(-Math.atan2(Math.sin(a) / WIDE, -Math.cos(a))).setPosition(mid - (out + 0.012) * Math.cos(a), bottom + (crest - bottom) * 0.3, LOBE.z + (out + 0.012) * WIDE * Math.sin(a));
		lights.push(rbox(0.014, 0.1, 0.035, 0.006, 1).applyMatrix4(place));
	}
	// Inside the brim, over the lobe's flat top, a dark cap: what the lobe hangs from.
	const cap = new THREE.CircleGeometry(1, 56).rotateX(Math.PI / 2).scale(half - THICK, 1, (half - THICK) * WIDE).translate(mid, LOBE.top + 0.05, LOBE.z);
	return { blue: parts, lights, cap };
}
