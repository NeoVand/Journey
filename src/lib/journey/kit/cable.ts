import * as THREE from 'three';
import { leaving } from './parts';
import type { Batch } from './batch';
import { rbox } from './geometry';
import { mats } from './materials';

type V3 = [number, number, number];

/** Where a cable is plugged in: a point on a surface, the way the fitting points, and whether it is a low one. */
export type Plug = { at: V3; out: V3; low?: boolean; bare?: boolean };

/**
 * What a cable can rest on. An island is its outline, seen from above, between a top and a bottom; a box is a box.
 */
export type Solid =
	| { outline: [number, number][]; top: number; bottom: number }
	| { min: V3; max: V3 }
	| { roller: V3; axis: V3; radius: number; half: number };

/** A hold on the way: where it is, and how much slack the cable has from the last hold to here. */
export type Hold = { at: V3; slack?: number };

export type Hang = {
	from: Plug;
	to: Plug;
	/** The cable's radius: it rests on things by its skin, not its middle. */
	r: number;
	/** Clips it is held by on the way, in order. */
	via?: Hold[];
	/** How much longer than a taut line between its holds it is: 1.04 hangs a little, 1.2 droops. */
	slack?: number;
	/** The tightest it will bend, as a radius: a hose's is bigger than a lead's. */
	bend?: number;
	on?: Solid[];
};

/**
 * A real cable: held at its ends square to its fittings and by any clips, and free between them to hang under its own
 * weight, resting on what it meets. Settled once, as a rope of short links, and handed back as a smooth curve.
 */
/** How many links a cable is settled as, and for how long: few and short enough to cost little as the page opens. */
const LINKS = 48;
const STEPS = 350;
const ITERATIONS = 20;

export function hang(h: Hang) {
	const r = h.r;
	// A bare end is where the cable carries on as something rigid: no fitting, just the way it's pointing.
	const a = h.from.bare ? [h.from.at, h.from.at, h.from.at] : leaving(h.from.at, h.from.out, r, h.from.low);
	const b = (h.to.bare ? [h.to.at, h.to.at, h.to.at] : leaving(h.to.at, h.to.out, r, h.to.low)).reverse();
	const na = new THREE.Vector3(...h.from.out).normalize();
	const nb = new THREE.Vector3(...h.to.out).normalize();
	const slack = h.slack ?? 1.06;
	const via = h.via ?? [];
	const holds = [a[2], ...via.map((v) => v.at), b[0]].map((p) => new THREE.Vector3(...p));
	const slacks = [...via.map((v) => v.slack ?? slack), slack];
	// Short links where it's short, longer where it's long: a long rope of tiny links stretches before it settles.
	let total = 0;
	for (let i = 0; i < holds.length - 1; i++) total += holds[i].distanceTo(holds[i + 1]) * slacks[i];
	const link = Math.min(0.8, Math.max(0.07, total / LINKS));

	// The rope: links of about one length, as many to each span as its share of the length needs.
	const p: THREE.Vector3[] = [];
	const rest: number[] = [];
	const pinned = new Set<number>();
	for (let s = 0; s < holds.length - 1; s++) {
		const from = holds[s];
		const to = holds[s + 1];
		const len = from.distanceTo(to) * slacks[s];
		const n = Math.max(3, Math.ceil(len / link));
		if (s === 0) {
			pinned.add(0);
			p.push(from.clone());
		}
		for (let i = 1; i <= n; i++) {
			// Start it as a shallow arc, so it falls the same way every time.
			const t = i / n;
			p.push(from.clone().lerp(to, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * 0.02 * len, 0)));
			rest.push(len / n);
		}
		pinned.add(p.length - 1);
	}
	const N = p.length;
	// One link square out of each fitting, so the cable leaves it straight.
	p[1].copy(holds[0]).addScaledVector(na, rest[0]);
	p[N - 2].copy(holds[holds.length - 1]).addScaledVector(nb, rest[N - 2]);
	pinned.add(1);
	pinned.add(N - 2);

	// Settled in flat arrays: this runs once per cable while the page opens, so it has to be quick.
	const P = new Float64Array(N * 3);
	const Q = new Float64Array(N * 3);
	const inv = new Float64Array(N);
	for (let i = 0; i < N; i++) {
		P[i * 3] = Q[i * 3] = p[i].x;
		P[i * 3 + 1] = Q[i * 3 + 1] = p[i].y;
		P[i * 3 + 2] = Q[i * 3 + 2] = p[i].z;
		inv[i] = pinned.has(i) ? 0 : 1;
	}
	const bend = h.bend ?? 0.5;
	const least = rest.map((l) => 2 * l * Math.cos(Math.min(1.2, l / (2 * bend))));
	const on = (h.on ?? []).map((s) => ({ s, box: bounds(s, r) }));
	const at = new THREE.Vector3();
	// Pulls two points of the rope to a distance, or apart to at least it, each as far as it is free to move.
	const pair = (i: number, j: number, length: number, apartOnly: boolean) => {
		const w = inv[i] + inv[j];
		if (!w) return;
		const dx = P[j * 3] - P[i * 3];
		const dy = P[j * 3 + 1] - P[i * 3 + 1];
		const dz = P[j * 3 + 2] - P[i * 3 + 2];
		const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
		if (apartOnly && d >= length) return;
		const k = (d - length) / (d * w);
		P[i * 3] += dx * k * inv[i];
		P[i * 3 + 1] += dy * k * inv[i];
		P[i * 3 + 2] += dz * k * inv[i];
		P[j * 3] -= dx * k * inv[j];
		P[j * 3 + 1] -= dy * k * inv[j];
		P[j * 3 + 2] -= dz * k * inv[j];
	};
	for (let step = 0; step < STEPS; step++) {
		for (let i = 0; i < N; i++) {
			if (!inv[i]) continue;
			for (let c = 0; c < 3; c++) {
				const o = i * 3 + c;
				const vel = (P[o] - Q[o]) * 0.94;
				Q[o] = P[o];
				P[o] += vel + (c === 1 ? -0.0016 : 0);
			}
		}
		for (let it = 0; it < ITERATIONS; it++) {
			for (let j = 0; j < N - 1; j++) {
				const i = it % 2 ? N - 2 - j : j;
				pair(i, i + 1, rest[i], false);
			}
			// It bends freely, but no tighter than its bend radius: the links either side of one can't fold closer than that.
			for (let i = 0; i < N - 2; i++) pair(i, i + 2, least[i], true);
			for (let i = 0; i < N; i++) {
				if (!inv[i]) continue;
				const x = P[i * 3];
				const y = P[i * 3 + 1];
				const z = P[i * 3 + 2];
				for (const { s, box } of on) {
					if (x < box[0] || x > box[3] || y < box[1] || y > box[4] || z < box[2] || z > box[5]) continue;
					at.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
					push(at, s, r);
					P[i * 3] = at.x;
					P[i * 3 + 1] = at.y;
					P[i * 3 + 2] = at.z;
				}
			}
		}
	}
	for (let i = 0; i < N; i++) p[i].set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);

	// A first curve through the links; the fittings' own points keep the ends square.
	const pts: THREE.Vector3[] = h.from.bare ? [] : [new THREE.Vector3(...a[0]), new THREE.Vector3(...a[1])];
	for (let i = 0; i < N; i++) pts.push(p[i]);
	if (!h.to.bare) pts.push(new THREE.Vector3(...b[1]), new THREE.Vector3(...b[2]));
	const rough = new THREE.CatmullRomCurve3(pts, false, 'centripetal');

	// Long links can cut a corner where the cable goes over an edge. Walk the curve in short steps, and push each step
	// out of whatever it rests on, smoothing as it goes, so the skin never dips into a floor or a roller.
	const len = rough.getLength();
	const n = Math.max(40, Math.ceil(len / 0.05));
	const fine = rough.getSpacedPoints(n);
	const keep = (i: number) => {
		const d = (Math.min(i, n - i) / n) * len;
		return d < (h.from.bare && i < n / 2 ? 0.05 : h.to.bare && i >= n / 2 ? 0.05 : 0.6);
	};
	const mid = new THREE.Vector3();
	for (let pass = 0; pass < 4; pass++) {
		for (let i = 1; i < n; i++) {
			if (keep(i)) continue;
			mid.addVectors(fine[i - 1], fine[i + 1]).multiplyScalar(0.5);
			fine[i].lerp(mid, 0.5);
			for (const { s } of on) push(fine[i], s, r);
		}
	}
	const c = new THREE.CatmullRomCurve3(fine.filter((_, i) => i % 2 === 0 || i === n), false, 'centripetal');
	c.arcLengthDivisions = Math.max(400, Math.ceil(len / 0.02));
	return c;
}

const TMP = new THREE.Vector3();

/** A box round a solid, grown by the cable's radius: a point outside it can't touch the solid. */
function bounds(s: Solid, r: number): number[] {
	if ('roller' in s) {
		const e = s.radius + r + s.half;
		return [s.roller[0] - e, s.roller[1] - e, s.roller[2] - e, s.roller[0] + e, s.roller[1] + e, s.roller[2] + e];
	}
	if ('min' in s) return [s.min[0] - r, s.min[1] - r, s.min[2] - r, s.max[0] + r, s.max[1] + r, s.max[2] + r];
	const xs = s.outline.map((o) => o[0]);
	const zs = s.outline.map((o) => o[1]);
	return [Math.min(...xs) - r, s.bottom - r, Math.min(...zs) - r, Math.max(...xs) + r, s.top + r, Math.max(...zs) + r];
}

/**
 * A roller on a bracket at an island's edge, for a cable to go over instead of round the rim: `rim` is a point on the
 * island's edge at its top, `out` the way off it, level. The cable is held lying on the floor just before it.
 */
export function roller(rim: V3, out: [number, number], radius = 0.22, r = 0.1) {
	const o = new THREE.Vector2(...out).normalize();
	const c: V3 = [rim[0] + o.x * (radius + 0.06), rim[1] - radius, rim[2] + o.y * (radius + 0.06)];
	const axis: V3 = [-o.y, 0, o.x];
	const hold: V3 = [rim[0] - o.x * 0.25, rim[1] + r, rim[2] - o.y * 0.25];
	/** The roller's crown, and its far side level with its axle: where a cable that hangs straight down leaves it. */
	const top: V3 = [c[0], c[1] + radius + r, c[2]];
	const past: V3 = [c[0] + o.x * (radius + r), c[1], c[2] + o.y * (radius + r)];
	return { c, axis, o, radius, hold, top, past, solid: { roller: c, axis, radius, half: 0.3 } as Solid };
}

/** Builds a roller: the wheel on its axle, two cheeks bolted to the island's edge, and a plate on its top. */
export function buildRoller(b: Batch, w: ReturnType<typeof roller>) {
	const m = mats();
	const turn = (n: V3): V3 => {
		const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n)));
		return [e.x, e.y, e.z];
	};
	const ry = Math.atan2(-w.o.y, w.o.x);
	const [cx, cy, cz] = w.c;
	b.add(new THREE.CylinderGeometry(w.radius, w.radius, 0.5, 28), m.rubber, { p: w.c, r: turn(w.axis) });
	b.add(new THREE.CylinderGeometry(w.radius * 0.35, w.radius * 0.35, 0.76, 16), m.steel, { p: w.c, r: turn(w.axis) });
	const reach = w.radius + 0.06 + 0.3;
	for (const side of [-1, 1]) {
		const p: V3 = [cx - w.o.x * (reach / 2 - 0.06) + w.axis[0] * side * 0.34, cy + 0.02, cz - w.o.y * (reach / 2 - 0.06) + w.axis[2] * side * 0.34];
		b.add(rbox(reach + 0.12, w.radius * 2 + 0.1, 0.05, 0.02, 2), m.steelSoft, { p, r: [0, ry, 0] });
	}
	const top: V3 = [cx - w.o.x * (reach - 0.1), cy + w.radius + 0.02, cz - w.o.y * (reach - 0.1)];
	b.add(rbox(0.36, 0.04, 0.78, 0.015, 2), m.steelSoft, { p: top, r: [0, ry, 0] });
}

/** A pulley: a grooved wheel on an axle along z, with a flange either side. `radius` is the groove's, where the cable sits. */
export function buildWheel(b: Batch, c: V3, radius: number, width: number) {
	const m = mats();
	const r: V3 = [Math.PI / 2, 0, 0];
	b.add(new THREE.CylinderGeometry(radius, radius, width, 40), m.rubber, { p: c, r });
	const flange = new THREE.CylinderGeometry(radius + 0.16, radius + 0.16, 0.06, 40);
	for (const s of [-1, 1]) b.add(flange, m.steel, { p: [c[0], c[1], c[2] + (s * (width + 0.06)) / 2], r });
	b.add(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, width + 0.3, 20), m.steelSoft, { p: c, r });
}

/** Moves a point of the cable out of something solid, the shortest way. */
function push(p: THREE.Vector3, s: Solid, r: number) {
	if ('roller' in s) {
		const d = TMP.set(p.x - s.roller[0], p.y - s.roller[1], p.z - s.roller[2]);
		const along = d.x * s.axis[0] + d.y * s.axis[1] + d.z * s.axis[2];
		if (Math.abs(along) > s.half) return;
		d.x -= s.axis[0] * along;
		d.y -= s.axis[1] * along;
		d.z -= s.axis[2] * along;
		const dist = d.length();
		if (dist >= s.radius + r || dist < 1e-6) return;
		d.multiplyScalar((s.radius + r) / dist);
		p.set(s.roller[0] + s.axis[0] * along + d.x, s.roller[1] + s.axis[1] * along + d.y, s.roller[2] + s.axis[2] * along + d.z);
		return;
	}
	if ('min' in s) {
		const lo = [s.min[0] - r, s.min[1] - r, s.min[2] - r];
		const hi = [s.max[0] + r, s.max[1] + r, s.max[2] + r];
		const x = [p.x, p.y, p.z];
		if (x.some((c, i) => c <= lo[i] || c >= hi[i])) return;
		let best = Infinity;
		let axis = 0;
		let to = 0;
		for (let i = 0; i < 3; i++) {
			for (const edge of [lo[i], hi[i]]) {
				const d = Math.abs(x[i] - edge);
				if (d < best) {
					best = d;
					axis = i;
					to = edge;
				}
			}
		}
		p.setComponent(axis, to);
		return;
	}
	if (p.y > s.top + r || p.y < s.bottom - r) return;
	const { inside, dist, nx, nz } = edge(s.outline, p.x, p.z);
	const side = inside ? dist + r : r - dist;
	if (side <= 0) return;
	const up = s.top + r - p.y;
	const down = p.y - (s.bottom - r);
	// Down only when it's clearly the way out: a cable lying on an island mustn't be pushed out through its underside.
	if (up <= side && up <= down * 3) p.y = s.top + r;
	else if (down * 3 <= side) p.y = s.bottom - r;
	else {
		p.x += nx * side;
		p.z += nz * side;
	}
}

/** Whether a point is inside an outline, how far it is from its edge, and the edge's outward normal there. */
function edge(o: [number, number][], x: number, z: number) {
	let inside = false;
	let best = Infinity;
	let cx = 0;
	let cz = 0;
	for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
		const x1 = o[j][0];
		const z1 = o[j][1];
		const x2 = o[i][0];
		const z2 = o[i][1];
		if (z2 > z !== z1 > z && x < ((x1 - x2) * (z - z2)) / (z1 - z2) + x2) inside = !inside;
		const ex = x2 - x1;
		const ez = z2 - z1;
		const t = Math.max(0, Math.min(1, ((x - x1) * ex + (z - z1) * ez) / (ex * ex + ez * ez)));
		const px = x1 + ex * t;
		const pz = z1 + ez * t;
		const d = (x - px) * (x - px) + (z - pz) * (z - pz);
		if (d < best) {
			best = d;
			cx = px;
			cz = pz;
		}
	}
	const dist = Math.sqrt(best);
	const l = dist || 1;
	// The normal points from the edge to the point: outward when it's outside, inward when inside, so flip it inside.
	const sign = inside ? -1 : 1;
	return { inside, dist, nx: ((x - cx) / l) * sign, nz: ((z - cz) / l) * sign };
}
