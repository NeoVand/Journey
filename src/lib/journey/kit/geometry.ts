import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const boxes = new Map<string, THREE.BufferGeometry>();

/**
 * Rounded box centred on the origin. The radius is clamped so thin parts never self-intersect.
 * Many parts share a size, and building one is slow, so each caller gets its own copy of a shared original.
 */
export function rbox(w: number, h: number, d: number, r = 0.04, seg = 3) {
	const radius = Math.min(r, Math.min(w, h, d) * 0.49);
	const key = `${w}/${h}/${d}/${radius}/${seg}`;
	let box = boxes.get(key);
	if (!box) {
		box = new RoundedBoxGeometry(w, h, d, seg, radius);
		boxes.set(key, box);
	}
	return box.clone();
}

/** Polygon whose corners are rounded by `r` (per corner or uniform). Points run counter-clockwise. */
export function roundedPoly(pts: [number, number][], r: number | number[]) {
	const s = new THREE.Shape();
	const n = pts.length;
	for (let i = 0; i < n; i++) {
		const p = pts[i];
		const prev = pts[(i + n - 1) % n];
		const next = pts[(i + 1) % n];
		const rad = typeof r === 'number' ? r : r[i];
		const toPrev = new THREE.Vector2(prev[0] - p[0], prev[1] - p[1]);
		const toNext = new THREE.Vector2(next[0] - p[0], next[1] - p[1]);
		const a = toPrev.clone().setLength(Math.min(rad, toPrev.length() * 0.49));
		const b = toNext.clone().setLength(Math.min(rad, toNext.length() * 0.49));
		if (i === 0) s.moveTo(p[0] + a.x, p[1] + a.y);
		else s.lineTo(p[0] + a.x, p[1] + a.y);
		s.quadraticCurveTo(p[0], p[1], p[0] + b.x, p[1] + b.y);
	}
	s.closePath();
	return s;
}

export const roundedRect = (w: number, h: number, r: number) =>
	roundedPoly(
		[
			[-w / 2, -h / 2],
			[w / 2, -h / 2],
			[w / 2, h / 2],
			[-w / 2, h / 2]
		],
		r
	);

/** Rectangle with chamfered top corners: the silhouette every machine in the journey shares. */
export function chamferRect(w: number, h: number, ch: number, r: number) {
	return roundedPoly(
		[
			[-w / 2, -h / 2],
			[w / 2, -h / 2],
			[w / 2, h / 2 - ch],
			[w / 2 - ch, h / 2],
			[-w / 2 + ch, h / 2],
			[-w / 2, h / 2 - ch]
		],
		r
	);
}

/**
 * Extrudes along Z, centred, with the bevel kept inside the outline so stated sizes stay true.
 * Creased normals make the bevels read as one smooth soft edge.
 */
/** A flat collar with a real bore, standing on the y axis. */
export function ring(outer: number, bore: number, h: number, segments = 48) {
	const profile = [
		new THREE.Vector2(bore, -h / 2),
		new THREE.Vector2(outer, -h / 2),
		new THREE.Vector2(outer, h / 2),
		new THREE.Vector2(bore, h / 2),
		new THREE.Vector2(bore, -h / 2)
	];
	return new THREE.LatheGeometry(profile, segments);
}

export function extrude(
	shape: THREE.Shape,
	depth: number,
	bevel = 0.03,
	bevelSegments = 3,
	curveSegments = 10
) {
	const g = new THREE.ExtrudeGeometry(shape, {
		depth: depth - bevel * 2,
		bevelEnabled: bevel > 0,
		bevelThickness: bevel,
		bevelSize: bevel,
		bevelOffset: -bevel,
		bevelSegments,
		curveSegments
	});
	g.translate(0, 0, -(depth - bevel * 2) / 2);
	return toCreasedNormals(g, 0.7);
}

/** Smooth closed outline through control points, for islands. */
export function blobShape(points: [number, number][], samples = 180) {
	const curve = new THREE.CatmullRomCurve3(
		points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
		true,
		'centripetal'
	);
	const pts = curve.getSpacedPoints(samples).slice(0, -1);
	const s = new THREE.Shape();
	pts.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
	s.closePath();
	return s;
}

/** Frame used by both the swept ribbon and whatever rides on it, so the two can never disagree. */
export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number, fixedSide?: THREE.Vector3) {
	const p = curve.getPointAt(u);
	const t = curve.getTangentAt(u).normalize();
	// A path that runs straight up has no side of its own: one in a single plane can be given its side instead.
	const side = fixedSide ? fixedSide.clone() : new THREE.Vector3(0, 1, 0).cross(t).normalize();
	const up = t.clone().cross(side).normalize();
	return { p, t, side, up };
}

/** Sweeps a 2D profile (x = side, y = up) along a curve. */
export function sweep(
	curve: THREE.Curve<THREE.Vector3>,
	profile: [number, number][],
	segments: number,
	closed = true
) {
	const n = profile.length;
	const pos: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];
	const length = curve.getLength();
	const minA = Math.min(...profile.map((q) => q[0]));
	const maxA = Math.max(...profile.map((q) => q[0]));
	for (let i = 0; i <= segments; i++) {
		const u = i / segments;
		const { p, side, up } = frameAt(curve, u);
		for (let j = 0; j < n; j++) {
			const [a, b] = profile[j];
			pos.push(p.x + side.x * a + up.x * b, p.y + side.y * a + up.y * b, p.z + side.z * a + up.z * b);
			uv.push(u * length, (a - minA) / (maxA - minA));
		}
	}
	const rows = closed ? n : n - 1;
	for (let i = 0; i < segments; i++) {
		for (let j = 0; j < rows; j++) {
			const a = i * n + j;
			const b = i * n + ((j + 1) % n);
			const c = (i + 1) * n + j;
			const d = (i + 1) * n + ((j + 1) % n);
			idx.push(a, c, b, b, c, d);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** Sheet of paper with a gentle sag and a curled top-right corner. Faces +Z, UVs cover the sheet. */
export function paper(w: number, h: number, curl = 0.1, sag = 0.02, rows = 30) {
	const g = new THREE.PlaneGeometry(w, h, 24, rows);
	const p = g.attributes.position as THREE.BufferAttribute;
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i) / w + 0.5;
		const y = p.getY(i) / h + 0.5;
		const corner = Math.max(0, x + y - 1.45) / 0.55;
		const bend = Math.sin(x * Math.PI) * sag;
		p.setZ(i, bend + corner * corner * curl);
	}
	g.computeVertexNormals();
	return g;
}

/** A circular arc in 3D: from centre + u, turning towards centre + v, through angle radians. u and v are square and as long as the radius. */
class Arc3 extends THREE.Curve<THREE.Vector3> {
	constructor(
		private centre: THREE.Vector3,
		private u: THREE.Vector3,
		private v: THREE.Vector3,
		private angle: number
	) {
		super();
	}
	getPoint(t: number, target = new THREE.Vector3()) {
		const a = this.angle * t;
		return target.copy(this.centre).addScaledVector(this.u, Math.cos(a)).addScaledVector(this.v, Math.sin(a));
	}
}

/**
 * A pipe drawn with a ruler and a compass: straight from corner to corner, and round every corner on a circular arc of
 * one radius (or each corner's own, from a list). The first and last points are the pipe's ends.
 */
export function bends(points: [number, number, number][], radius: number | number[]) {
	const path = new THREE.CurvePath<THREE.Vector3>();
	const p = points.map((q) => new THREE.Vector3(...q));
	let from = p[0].clone();
	for (let i = 1; i < p.length - 1; i++) {
		const r = Array.isArray(radius) ? radius[i - 1] : radius;
		const d1 = p[i].clone().sub(p[i - 1]).normalize();
		const d2 = p[i + 1].clone().sub(p[i]).normalize();
		const turn = Math.acos(Math.min(1, Math.max(-1, d1.dot(d2))));
		if (turn < 1e-4 || r <= 0) continue;
		const cut = r * Math.tan(turn / 2);
		const start = p[i].clone().addScaledVector(d1, -cut);
		const end = p[i].clone().addScaledVector(d2, cut);
		const inward = d2.clone().addScaledVector(d1, -d1.dot(d2)).normalize();
		const centre = start.clone().addScaledVector(inward, r);
		if (start.distanceTo(from) > 1e-6) path.add(new THREE.LineCurve3(from, start));
		path.add(new Arc3(centre, start.clone().sub(centre), d1.clone().multiplyScalar(r), turn));
		from = end;
	}
	path.add(new THREE.LineCurve3(from, p[p.length - 1].clone()));
	return path;
}

/** A stretch of a curve, from one share of its length to another. */
export class PartOf extends THREE.Curve<THREE.Vector3> {
	constructor(
		private base: THREE.Curve<THREE.Vector3>,
		private from: number,
		private to: number
	) {
		super();
	}
	getPoint(t: number, target = new THREE.Vector3()) {
		return this.base.getPointAt(this.from + (this.to - this.from) * t, target);
	}
}
