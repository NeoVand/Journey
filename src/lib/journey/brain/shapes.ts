/*
 * The few plain solids the chassis is made of: a rod between two points, a tube through some, and a turned part
 * (a solid of revolution) standing upright or lying across the brain.
 */
import * as THREE from 'three';
import type { V3 } from './shell';

const Y = new THREE.Vector3(0, 1, 0);
const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

export function rod(a: V3, b: V3, r: number, sides = 16, r2 = r) {
	const A = v(a);
	const B = v(b);
	const g = new THREE.CylinderGeometry(r2, r, A.distanceTo(B), sides, 1);
	const q = new THREE.Quaternion().setFromUnitVectors(Y, B.clone().sub(A).normalize());
	return g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

export function tube(points: V3[], r: number, sides = 12, closed = false) {
	return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v), closed, 'centripetal'), Math.max(8, points.length * 3), r, sides, closed);
}

/** A solid of revolution standing upright at a place: its outline is radius and height, running the way that faces out. Of a part of the way round, if asked. */
export function turned(at: V3, outline: [number, number][], sides = 48, from = 0, round = Math.PI * 2) {
	return new THREE.LatheGeometry(
		outline.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
		sides,
		from,
		round
	).translate(at[0], at[1], at[2]);
}

/** A solid of revolution about an axis that runs across the brain: its outline is radius and how far along the axis. */
export function turnedZ(at: V3, outline: [number, number][], sides = 28) {
	return new THREE.LatheGeometry(
		outline.map(([r, z]) => new THREE.Vector2(r, z)),
		sides
	)
		.rotateX(Math.PI / 2)
		.translate(at[0], at[1], at[2]);
}
