import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** Rounded box centred on the origin. The radius is clamped so thin parts never self-intersect. */
export function rbox(w: number, h: number, d: number, r = 0.04, seg = 3) {
	const radius = Math.min(r, Math.min(w, h, d) * 0.49);
	return new RoundedBoxGeometry(w, h, d, seg, radius);
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
export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number) {
	const p = curve.getPointAt(u);
	const t = curve.getTangentAt(u).normalize();
	const side = new THREE.Vector3(0, 1, 0).cross(t).normalize();
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
