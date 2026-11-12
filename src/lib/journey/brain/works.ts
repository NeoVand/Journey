/*
 * The works, built: every machine in the design as real parts, each in the frame its place on the core gives it.
 * Parts are gathered by finish (chrome, copper, the dark of the electronics, the lit ambers and cyans) so a whole half's
 * machinery is a handful of meshes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rbox } from '../kit/geometry';
import { from, seat, spread, trace, type Machine, type Seat } from './machines';
import type { V3 } from './shell';
import type { Cushions, Station } from './solve';

export type Finish = 'chrome' | 'copper' | 'dark' | 'amber' | 'cyan' | 'glass';

/** What a coil's windings carry besides their shape: the point of the coil's axis each turns about, and the way the axis runs there. */
export interface Wound {
	hub: number[];
	spin: number[];
}

/** Parts gathered by finish. */
export class Parts {
	private by = new Map<Finish, THREE.BufferGeometry[]>();

	add(finish: Finish, geo: THREE.BufferGeometry, at?: THREE.Matrix4) {
		const g = geo.index ? geo.toNonIndexed() : geo;
		for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
		if (at) g.applyMatrix4(at);
		const list = this.by.get(finish);
		if (list) list.push(g);
		else this.by.set(finish, [g]);
		return this;
	}

	/** One geometry for a finish, or nothing if it has no parts. */
	take(finish: Finish) {
		const list = this.by.get(finish);
		if (!list?.length) return null;
		const merged = mergeGeometries(list, false);
		list.forEach((g) => g.dispose());
		this.by.delete(finish);
		return merged;
	}
}

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const Y = new THREE.Vector3(0, 1, 0);

/** The frame of a seat as a matrix: x along it, y out of the core, z across. */
export function frameOf(s: Seat, up = 0) {
	const x = v(s.t);
	const y = v(s.n);
	const z = new THREE.Vector3().crossVectors(x, y);
	return new THREE.Matrix4().makeBasis(x, y, z).setPosition(v(from(s, 0, up)));
}

/** A round rod from one point to another. */
function rod(a: V3, b: V3, r: number, sides = 14, r2 = r) {
	const A = v(a);
	const B = v(b);
	const g = new THREE.CylinderGeometry(r2, r, A.distanceTo(B), sides, 1);
	const q = new THREE.Quaternion().setFromUnitVectors(Y, B.clone().sub(A).normalize());
	return g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

/** A tube through points. */
function tube(points: V3[], r: number, sides = 10) {
	const curve = new THREE.CatmullRomCurve3(points.map(v), false, 'centripetal');
	return new THREE.TubeGeometry(curve, Math.max(4, points.length * 2), r, sides, false);
}

/** A solid of revolution about a seat's normal: the outline is radius and height off the core, running the way that faces out. */
function turned(s: Seat, outline: [number, number][], sides = 40) {
	const g = new THREE.LatheGeometry(
		outline.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
		sides
	);
	return g.applyMatrix4(frameOf(s));
}

/** Points raised off the core along a traced line. */
const raised = (line: Station[], up: number): V3[] => line.map((st) => [st.p[0] + st.n[0] * up, st.p[1] + st.n[1] * up, st.p[2] + st.n[2] * up]);

/* ---- eyes ---- */

/** How far an eye may turn from straight ahead, in radians: its housing is built to hide everything past this. */
export const EYE_TURN = 0.26;
/** How high an eye's dish stands off the core at most: the cushions float over it. */
export const DISH = 0.024;

export interface EyeBuilt {
	/** Where the eye sits: z is the way it looks at rest. */
	frame: THREE.Matrix4;
	/** The ball, in that frame, by finish. */
	ball: Partial<Record<Finish, THREE.BufferGeometry>>;
	radius: number;
}

/**
 * An eye. The housing is a chrome bezel turned about the eye's axis, whose inside is part of a sphere; the ball is a
 * slightly smaller sphere about the same middle. So the ball can turn any way at all and never meet the housing: the gap
 * between them is the same everywhere, always. The bezel's lip comes far enough over the ball that the chrome of the
 * iris never runs out, however far the eye turns.
 */
function eye(parts: Parts, m: Extract<Machine, { kind: 'eye' }>): EyeBuilt {
	const s = seat(m.at);
	const R = m.r;
	const ball = R * 0.76;
	const socket = ball + 0.014;
	const lip = (50 * Math.PI) / 180;
	// Up the outside from the core, over the lip, and down the inside of the socket to its equator.
	const outline: [number, number][] = [
		[R, 0],
		[R, 0.05],
		[R - 0.035, 0.085],
		[R - 0.035, 0.12],
		[R - 0.075, 0.16],
		[socket * Math.sin(lip) + 0.07, socket * Math.cos(lip) + 0.03],
		[socket * Math.sin(lip) + 0.025, socket * Math.cos(lip) + 0.035]
	];
	for (let i = 0; i <= 8; i++) {
		const a = lip + ((Math.PI / 2 - lip) * i) / 8;
		outline.push([socket * Math.sin(a), socket * Math.cos(a)]);
	}
	parts.add('chrome', turned(s, outline, 56));
	if (m.dish) {
		// The dish the housing stands in: a low chrome skirt that lies on the core, however the core curves, and runs out
		// under the cushions round the eye, which float just over it. Two shallow steps, turned.
		const D = m.dish;
		const skirt: [number, number][] = [
			[R - 0.02, DISH],
			[R + 0.07, DISH],
			[R + 0.085, DISH - 0.007],
			[D - 0.1, DISH - 0.007],
			[D - 0.085, DISH - 0.012],
			[D - 0.012, DISH - 0.012],
			[D, 0.002]
		];
		const sides = 64;
		const rays = spread(
			m.at,
			skirt.map(([r]) => r),
			sides
		);
		const pos: number[] = [];
		const idx: number[] = [];
		rays.forEach((ray, k) => {
			ray.forEach((q, j) => pos.push(q.p[0] + q.n[0] * skirt[j][1], q.p[1] + q.n[1] * skirt[j][1], q.p[2] + q.n[2] * skirt[j][1]));
			const next = ((k + 1) % sides) * skirt.length;
			const here = k * skirt.length;
			for (let j = 0; j < skirt.length - 1; j++) idx.push(here + j, here + j + 1, next + j + 1, here + j, next + j + 1, next + j);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setIndex(idx);
		// Each step keeps its own edge: corners are not shared between the flats and the risers.
		const flat = g.toNonIndexed();
		flat.computeVertexNormals();
		parts.add('chrome', flat);
	} else {
		// A dark seal on the core round the housing's foot.
		parts.add('dark', turned(s, [[R + 0.035, 0], [R + 0.035, 0.03], [R, 0.03]], 56));
	}

	// The ball: about its own middle, looking along z. Glass over the pupil, a lit ring, the chrome iris, and dark behind.
	const zone = (r: number, a: number, b: number, rings: number) => new THREE.SphereGeometry(r, 48, rings, 0, Math.PI * 2, (a * Math.PI) / 180, ((b - a) * Math.PI) / 180).rotateX(Math.PI / 2);
	const deg = (EYE_TURN * 180) / Math.PI;
	const iris = Math.min(50 + deg + 4, 80);
	return {
		frame: new THREE.Matrix4().makeBasis(v(s.t), new THREE.Vector3().crossVectors(v(s.n), v(s.t)), v(s.n)).setPosition(v(s.p)),
		ball: {
			glass: zone(ball, 0, 27, 8),
			amber: zone(ball + 0.003, 27, 31, 2),
			chrome: mergeGeometries([zone(ball, 31, 42, 4), zone(ball, 44, iris, 8)])!,
			dark: mergeGeometries([zone(ball - 0.004, 42, 44, 1), zone(ball, iris, 112, 6)])!
		},
		radius: ball
	};
}

/* ---- coils ---- */

/** A copper wire's radius, and how far along the coil each turn advances. */
const WIRE = 0.036;
const PITCH = 0.09;

function coil(parts: Parts, wound: { geo: THREE.BufferGeometry[] }, m: Extract<Machine, { kind: 'coil' }>) {
	const line = trace(m.path, 0.04);
	const up = m.r + 0.035;
	const axis = raised(line, up);
	const length = line[line.length - 1].s;
	const Rw = m.r - WIRE;
	// The winding: a helix about the axis, drawn as a tube of its own.
	const per = 16;
	const sides = 7;
	const lead = 0.1;
	const turns = (length - 2 * lead) / PITCH;
	const steps = Math.round(turns * per);
	const pos: number[] = [];
	const nor: number[] = [];
	const hub: number[] = [];
	const spin: number[] = [];
	const idx: number[] = [];
	const at = (s: number) => {
		let i = 0;
		while (i < line.length - 2 && line[i + 1].s < s) i++;
		const k = Math.min(1, Math.max(0, (s - line[i].s) / (line[i + 1].s - line[i].s || 1)));
		const mix = (a: V3, b: V3) => new THREE.Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
		return { c: mix(axis[i], axis[i + 1]), n: mix(line[i].n, line[i + 1].n).normalize(), t: mix(line[i].t, line[i + 1].t).normalize() };
	};
	const point = (k: number) => {
		const s = lead + ((length - 2 * lead) * k) / steps;
		const a = (k / per) * Math.PI * 2;
		const f = at(s);
		const b = new THREE.Vector3().crossVectors(f.n, f.t);
		const out = f.n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
		return { p: f.c.clone().addScaledVector(out, Rw), out, c: f.c, t: f.t };
	};
	for (let k = 0; k <= steps; k++) {
		const here = point(k);
		const along = point(Math.min(steps, k + 1))
			.p.sub(point(Math.max(0, k - 1)).p)
			.normalize();
		const side = new THREE.Vector3().crossVectors(along, here.out).normalize();
		for (let j = 0; j < sides; j++) {
			const a = (j / sides) * Math.PI * 2;
			const n = here.out.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
			pos.push(here.p.x + n.x * WIRE, here.p.y + n.y * WIRE, here.p.z + n.z * WIRE);
			nor.push(n.x, n.y, n.z);
			hub.push(here.c.x, here.c.y, here.c.z);
			spin.push(here.t.x, here.t.y, here.t.z);
		}
		if (k < steps)
			for (let j = 0; j < sides; j++) {
				const a = k * sides + j;
				const b = k * sides + ((j + 1) % sides);
				idx.push(a, b + sides, a + sides, a, b, b + sides);
			}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
	g.setAttribute('hub', new THREE.Float32BufferAttribute(hub, 3));
	g.setAttribute('spin', new THREE.Float32BufferAttribute(spin, 3));
	g.setIndex(idx);
	wound.geo.push(g);
	// The former it is wound on, dark between the turns, and a chrome flange and a dark gland at each end, down to the core.
	parts.add('dark', tube(axis.filter((_, i) => i % 3 === 0 || i === axis.length - 1), Rw - WIRE + 0.004, 14));
	for (const end of [0, 1]) {
		const st = line[end ? line.length - 1 : 0];
		const dir = end ? 1 : -1;
		const c = axis[end ? axis.length - 1 : 0];
		const along = (d: number): V3 => [c[0] + st.t[0] * d * dir, c[1] + st.t[1] * d * dir, c[2] + st.t[2] * d * dir];
		parts.add('chrome', rod(along(-lead + 0.01), along(-lead + 0.07), m.r + 0.02, 28));
		parts.add('dark', rod(along(-lead + 0.07), along(0), m.r * 0.62, 20));
		// A foot under the gland, standing on the core.
		parts.add('dark', rod(from({ ...st, p: [st.p[0] + st.t[0] * -0.04 * dir, st.p[1] + st.t[1] * -0.04 * dir, st.p[2] + st.t[2] * -0.04 * dir] }, 0, 0), along(-0.04), m.r * 0.4, 12));
	}
}

/* ---- pipes ---- */

function pipe(parts: Parts, m: Extract<Machine, { kind: 'pipe' }>) {
	const line = trace(m.path, 0.06);
	const up = m.r + 0.045;
	const mid = raised(line, up);
	const length = line[line.length - 1].s;
	// It comes up out of the core at one end and goes back into it at the other, through a gland: all within its own length,
	// so its pocket holds the whole of it.
	const ends = 4;
	const first = line[ends];
	const last = line[line.length - 1 - ends];
	const dive = (st: Station, dir: number): V3[] => [from(st, dir * 0.19, -0.06), from(st, dir * 0.16, up * 0.45), from(st, dir * 0.08, up * 0.93)];
	parts.add('chrome', tube([...dive(first, -1), ...mid.slice(ends, -ends), ...dive(last, 1).reverse()], m.r, 12));
	for (const [st, dir] of [[first, -1], [last, 1]] as const) parts.add('dark', turned({ ...st, p: from(st, dir * 0.18, 0) }, [[m.r + 0.035, 0], [m.r + 0.035, 0.035], [m.r + 0.012, 0.05], [m.r + 0.012, 0]], 24));
	// Sleeves along it, and one stretch of lit glass between two of them.
	const sleeve = (s: number, half: number, r: number, finish: Finish) => {
		let i = 0;
		while (i < line.length - 2 && line[i + 1].s < s) i++;
		const st = line[i];
		const c: V3 = [mid[i][0], mid[i][1], mid[i][2]];
		parts.add(finish, rod([c[0] - st.t[0] * half, c[1] - st.t[1] * half, c[2] - st.t[2] * half], [c[0] + st.t[0] * half, c[1] + st.t[1] * half, c[2] + st.t[2] * half], r, 18));
	};
	const lit = m.lit ?? [2, 2];
	const count = Math.max(2, Math.round(length / 0.42));
	for (let k = 1; k < count; k++) {
		const share = k / count;
		if (share > lit[0] - 0.04 && share < lit[1] + 0.04) continue;
		sleeve(length * share, 0.055, m.r + 0.03, 'dark');
	}
	if (m.lit) {
		const a = Math.round(lit[0] * (line.length - 1));
		const b = Math.round(lit[1] * (line.length - 1));
		parts.add('amber', tube(mid.slice(a, b + 1), m.r + 0.012, 12));
		sleeve(line[a].s, 0.045, m.r + 0.032, 'dark');
		sleeve(line[b].s, 0.045, m.r + 0.032, 'dark');
	}
}

/* ---- arms and links ---- */

/** A flat bar along a line: its section is a low table with chamfered shoulders, as wide at each station as asked. */
function bar(line: Station[], half: (share: number) => number, foot: number, thick: number) {
	const pos: number[] = [];
	const idx: number[] = [];
	const ch = Math.min(0.02, thick * 0.4);
	const length = line[line.length - 1].s || 1;
	line.forEach((st, i) => {
		const w = half(st.s / length);
		const ring: [number, number][] = [
			[-w, foot],
			[-w, foot + thick - ch],
			[-w + ch, foot + thick],
			[w - ch, foot + thick],
			[w, foot + thick - ch],
			[w, foot]
		];
		for (const [left, up] of ring) pos.push(...from(st, 0, up, left));
		if (i < line.length - 1)
			for (let j = 0; j < 5; j++) {
				const a = i * 6 + j;
				idx.push(a, a + 6, a + 7, a, a + 7, a + 1);
			}
	});
	// Its two ends.
	for (const [i, flip] of [[0, false], [line.length - 1, true]] as const) {
		const o = i * 6;
		for (let j = 1; j < 5; j++) idx.push(...(flip ? [o, o + j + 1, o + j] : [o, o + j, o + j + 1]));
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	const flat = g.toNonIndexed();
	flat.computeVertexNormals();
	return flat;
}

/** A pivot: a round boss standing on a post, with a pin through it. */
function pivot(parts: Parts, s: Seat, r: number, foot: number, thick: number) {
	parts.add('chrome', turned(s, [[r, foot], [r, foot + thick - 0.015], [r - 0.015, foot + thick], [r * 0.5, foot + thick], [r * 0.5, foot + thick + 0.02], [r * 0.36, foot + thick + 0.035], [0, foot + thick + 0.035]], 28));
	parts.add('dark', turned(s, [[r * 0.55, 0], [r * 0.55, foot]], 16));
}

function arm(parts: Parts, m: Extract<Machine, { kind: 'arm' }>) {
	const line = trace(m.path, 0.07);
	const foot = 0.07;
	const thick = 0.075;
	const half = (k: number) => m.w[0] + (m.w[1] - m.w[0]) * k;
	parts.add('chrome', bar(line, (k) => half(k) * 0.9, foot, thick));
	// The strip of light let into its top.
	parts.add('amber', bar(line.slice(2, -2), () => 0.022, foot + thick, 0.008));
	pivot(parts, line[0], m.w[0] * 0.96, foot - 0.02, thick + 0.04);
	// Its far end has a pivot of its own, unless a link's pivot holds it there.
	if (!m.held) pivot(parts, line[line.length - 1], m.w[1] * 0.96, foot - 0.02, thick + 0.04);
}

/** Links: flat bars from pivot to pivot, one pivot at each joint however many bars meet there. */
function link(parts: Parts, m: Extract<Machine, { kind: 'link' }>) {
	const foot = 0.17;
	const thick = 0.07;
	const seats = m.pins.map((at, i) => seat(at, m.pins[i + 1] ?? m.pins[i - 1]));
	seats.forEach((s) => pivot(parts, s, m.r, foot - 0.025, thick + 0.05));
	for (let j = 0; j < seats.length - 1; j++) {
		const a = seats[j];
		const b = seats[j + 1];
		// A bar runs straight from pivot to pivot, in space: a few stations along that line, each with the core's frame near it.
		// Bars that meet at a pivot lie one above the other, as the leaves of a hinge do.
		const count = 5;
		const line: Station[] = [];
		const far = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
		const t: V3 = [(b.p[0] - a.p[0]) / far, (b.p[1] - a.p[1]) / far, (b.p[2] - a.p[2]) / far];
		for (let i = 0; i <= count; i++) {
			const k = i / count;
			const n: V3 = [a.n[0] + (b.n[0] - a.n[0]) * k, a.n[1] + (b.n[1] - a.n[1]) * k, a.n[2] + (b.n[2] - a.n[2]) * k];
			const l = Math.hypot(...n);
			const nn: V3 = [n[0] / l, n[1] / l, n[2] / l];
			line.push({ u: 0, v: 0, w: 0, p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k], n: nn, t, b: [nn[1] * t[2] - nn[2] * t[1], nn[2] * t[0] - nn[0] * t[2], nn[0] * t[1] - nn[1] * t[0]], s: far * k });
		}
		parts.add('chrome', bar(line, () => m.r * 0.62, foot + (j % 2) * 0.012, thick * 0.55 - 0.004));
	}
}

/* ---- electronics ---- */

function block(parts: Parts, m: Extract<Machine, { kind: 'block' }>) {
	const s = seat(m.at, m.toward);
	const [along, across, tall] = m.size;
	const foot = 0.05;
	const at = (x: number, y: number, z: number) => frameOf(s).multiply(new THREE.Matrix4().makeTranslation(x, y, z));
	// A plinth on the core, and the block standing on it.
	parts.add('dark', rbox(along - 0.08, foot + 0.02, across - 0.08, 0.02, 1), at(0, (foot + 0.02) / 2, 0));
	if (m.face === 'fins') {
		// A heat sink: thin chrome plates in a row, on a dark spine.
		parts.add('dark', rbox(along - 0.04, tall * 0.3, across * 0.5, 0.02, 1), at(0, foot + tall * 0.15, 0));
		for (let i = 0; i < m.count; i++) {
			const x = -along / 2 + 0.04 + ((along - 0.08) * (i + 0.5)) / m.count;
			parts.add('chrome', rbox(((along - 0.08) / m.count) * 0.5, tall - 0.02, across - 0.04, 0.008, 1), at(x, foot + (tall - 0.02) / 2, 0));
		}
		return;
	}
	parts.add('dark', rbox(along, tall - foot, across, 0.035, 2), at(0, foot + (tall - foot) / 2, 0));
	const top = tall + 0.003;
	if (m.face === 'bars') {
		// Lit bars across its top, in a shallow chrome tray.
		parts.add('chrome', rbox(along * 0.66, 0.012, across * 0.8, 0.005, 1), at(-along * 0.1, top, 0));
		for (let i = 0; i < m.count; i++) {
			const x = -along * 0.1 + along * 0.66 * ((i + 0.5) / m.count - 0.5);
			parts.add('amber', rbox(Math.min(0.07, (along * 0.4) / m.count), 0.016, across * 0.58, 0.007, 1), at(x, top + 0.012, 0));
		}
		// A chrome bracket over one end.
		parts.add('chrome', rbox(along * 0.14, tall - foot + 0.03, across + 0.03, 0.012, 1), at(along * 0.38, foot + (tall - foot) / 2 + 0.008, 0));
	} else {
		for (let i = 0; i < m.count; i++) {
			const z = across * 0.6 * ((i + 0.5) / m.count - 0.5);
			parts.add('cyan', rbox(along * 0.5, 0.014, Math.min(0.05, (across * 0.34) / m.count), 0.006, 1), at(0, top + 0.005, z));
		}
	}
}

/* ---- the lights let into the blue cushions ---- */

/** A row of little lights on a cushion's crest: where along which cushion, as a share of its length. */
export interface Row {
	gyrus: string;
	at: number;
}

/**
 * Each row is a dark strip of glass let into the top of a cushion with four lights in it. It rides on its plate, so its
 * parts come back with the plate they belong to.
 */
export function rows(solved: Cushions, list: Row[]) {
	const out: { finish: Finish; geo: THREE.BufferGeometry; plate: number }[] = [];
	for (const row of list) {
		const crest = solved.crests.find((c) => c.name === row.gyrus);
		if (!crest) continue;
		let i = Math.round(row.at * (crest.line.length - 1));
		for (let k = Math.max(3, i - 8); k <= Math.min(crest.line.length - 4, i + 8); k++) if (crest.line[k].half > crest.line[i].half && crest.line[k].plate === crest.line[i].plate) i = k;
		const st = crest.line[i];
		const s: Seat = { p: st.p, n: st.n, t: st.t, b: st.b };
		const up = st.high;
		// No wider than the flat of the cushion's top.
		const wide = Math.min(0.16, st.half * 0.5);
		const m = (x: number, y: number) => frameOf(s).multiply(new THREE.Matrix4().makeTranslation(x, up + y, 0));
		out.push({ finish: 'dark', geo: rbox(0.46, 0.012, wide, 0.006, 1).applyMatrix4(m(0, 0.002)), plate: st.plate });
		for (let k = 0; k < 4; k++) out.push({ finish: 'cyan', geo: rbox(0.04, 0.012, wide * 0.62, 0.006, 1).applyMatrix4(m((k - 1.5) * 0.09, 0.008)), plate: st.plate });
	}
	return out;
}

/** Builds every machine of one half. */
export function build(machines: Machine[]) {
	const parts = new Parts();
	const wound = { geo: [] as THREE.BufferGeometry[] };
	const eyes: EyeBuilt[] = [];
	for (const m of machines) {
		if (m.kind === 'eye') eyes.push(eye(parts, m));
		else if (m.kind === 'coil') coil(parts, wound, m);
		else if (m.kind === 'pipe') pipe(parts, m);
		else if (m.kind === 'arm') arm(parts, m);
		else if (m.kind === 'link') link(parts, m);
		else block(parts, m);
	}
	return { parts, coils: wound.geo.length ? mergeGeometries(wound.geo, false) : null, eyes };
}
