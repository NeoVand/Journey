import * as THREE from 'three';
import { Batch } from './batch';
import { extrude, rbox, roundedRect } from './geometry';
import { isPhone, Label } from './print';
import { mats } from './materials';

/** Louvred vent on a face whose normal is +X. Slats tilt so they catch the light. */
export function ventX(b: Batch, x: number, y: number, z: number, h: number, d: number, n: number) {
	const m = mats();
	const pitch = h / n;
	b.add(rbox(0.03, h + 0.08, d + 0.08, 0.012, 2), m.recess, { p: [x - 0.012, y, z] });
	const slat = rbox(0.05, pitch * 0.52, d, 0.012, 2);
	for (let i = 0; i < n; i++) {
		b.add(slat, m.steelSoft, { p: [x + 0.01, y - h / 2 + pitch * (i + 0.5), z], r: [0, 0, -0.3] });
	}
}

/** Vent on a face whose normal is +Z. */
export function ventZ(b: Batch, x: number, y: number, z: number, w: number, h: number, n: number) {
	const m = mats();
	const pitch = h / n;
	b.add(rbox(w + 0.06, h + 0.06, 0.03, 0.012, 2), m.recess, { p: [x, y, z - 0.012] });
	const slat = rbox(w, pitch * 0.5, 0.04, 0.012, 2);
	for (let i = 0; i < n; i++) {
		b.add(slat, m.steelSoft, { p: [x, y - h / 2 + pitch * (i + 0.5), z + 0.008], r: [0.28, 0, 0] });
	}
}

const screwGeo = () => new THREE.CylinderGeometry(0.028, 0.032, 0.022, 14);

/** Screw head seated on a face. `axis` is the direction the face looks. */
export function screw(b: Batch, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'z') {
	const r: [number, number, number] =
		axis === 'z' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, 0, -Math.PI / 2] : [0, 0, 0];
	b.add(screwGeo(), mats().steel, { p: [x, y, z], r });
}

/** Low plinth under a machine, slightly proud of its footprint. */
export function plinth(b: Batch, w: number, d: number, h = 0.14) {
	const m = mats();
	b.add(rbox(w, h, d, 0.05, 3), m.steelSoft, { p: [0, h / 2, 0] });
	b.add(rbox(w - 0.16, 0.02, d - 0.16, 0.01, 2), m.recess, { p: [0, h + 0.005, 0] });
}

type V3 = [number, number, number];

/** How far a fitting stands proud of its surface. A low one has no nose, for where a cable has to turn straight after it. */
const fittingLength = (r: number, low = false) => r * (low ? 2 : 3.6);

/**
 * Where a cable meets something solid: a flange on the surface, a barrel, and a nose that tapers onto the cable.
 * `at` is on the surface, `out` points away from it, and r is the cable's radius. Every end of every cable gets one of these.
 */
export function fitting(b: Batch, at: V3, out: V3, r: number, { low = false, flange = 2 }: { low?: boolean; flange?: number } = {}) {
	const m = mats();
	const n = new THREE.Vector3(...out).normalize();
	const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
	const turn: V3 = [e.x, e.y, e.z];
	const along = (d: number): V3 => [at[0] + n.x * d, at[1] + n.y * d, at[2] + n.z * d];
	const plate = r * 0.5;
	const barrel = r * 1.5;
	const nose = fittingLength(r, low) - plate - barrel;
	b.add(new THREE.CylinderGeometry(r * flange, r * (flange + 0.15), plate, 28), m.steelSoft, { p: along(plate / 2), r: turn });
	b.add(new THREE.CylinderGeometry(r * 1.62, r * 1.72, barrel, 24), m.steel, { p: along(plate + barrel / 2), r: turn });
	if (!low) b.add(new THREE.CylinderGeometry(r * 1.12, r * 1.62, nose, 24), m.steel, { p: along(plate + barrel + nose / 2), r: turn });
}

/** The points a cable needs to leave a fitting square to it, before it's free to bend. Reverse them to arrive at one. */
export function leaving(at: V3, out: V3, r: number, low = false): V3[] {
	const n = new THREE.Vector3(...out).normalize();
	const L = fittingLength(r, low);
	return [at, [at[0] + n.x * L, at[1] + n.y * L, at[2] + n.z * L], [at[0] + n.x * L * 1.7, at[1] + n.y * L * 1.7, at[2] + n.z * L * 1.7]];
}

/**
 * Posts under a sign, so it stands on what's below it and doesn't hover. `height` is what the sign was made with, and `drop`
 * is how far below the plate the surface is. A sign wider than `one` gets a post either side, since one would look top-heavy.
 */
export function standSign(sign: THREE.Group, height: number, drop: number, one = 2.2) {
	const plate = sign.children[0].children[0] as THREE.Mesh;
	plate.geometry.computeBoundingBox();
	const w = plate.geometry.boundingBox!.max.x - plate.geometry.boundingBox!.min.x;
	// Printed larger on a phone: the plate rises so its bottom edge still sits on the posts.
	const lift = (plate.geometry.boundingBox!.max.y - plate.geometry.boundingBox!.min.y) / 2 - height;
	if (SIGN_PHONE > 1 && lift > 0.001) for (const part of sign.children.slice(0, 2)) part.position.y += lift;
	const b = new Batch();
	const m = mats();
	for (const x of w > one ? [-w * 0.3, w * 0.3] : [0]) {
		// Into the plate at the top and into whatever it stands on at the bottom, so there's no daylight at either end.
		b.add(rbox(0.09, drop + 0.06, 0.06, 0.02, 2), m.steelSoft, { p: [x, -height - drop / 2 + 0.01, -0.012] });
	}
	sign.add(b.build('sign-post'));
	return sign;
}

/** On a phone the whole scene is small, so signs are printed larger there to stay readable. */
export const SIGN_PHONE = isPhone ? 1.5 : 1;
/** How much further a sign of this size reaches from its centre on a phone, each way. Lift a sign that rests on
 * something by this much, so its bottom edge stays put. */
export const grown = (size: number) => size * (SIGN_PHONE - 1);

/** A sign's plate width, as printed here. */
export function signWidth(sign: THREE.Group) {
	const plate = sign.children[0].children[0] as THREE.Mesh;
	plate.geometry.computeBoundingBox();
	return plate.geometry.boundingBox!.max.x - plate.geometry.boundingBox!.min.x;
}

/**
 * A printed plate: the plate is sized from its text, so every sign has the same margins. On phones it grows by
 * SIGN_PHONE about its centre, unless it's `fitted` to something that can't take a bigger plate.
 */
export function createSign(text: string, size = 0.2, ink = '#111a2e', material?: THREE.Material, fitted = false) {
	const height = fitted ? size : size * SIGN_PHONE;
	const group = new THREE.Group();
	// Named for its words, so the conversation can point at it: see pointer.svelte.ts.
	group.name = `sign:${text}`;
	const label = new Label(text, height, { color: ink, weight: 700 });
	const w = label.worldWidth + height * 1.2;
	const h = height * 2;
	const b = new Batch();
	b.add(extrude(roundedRect(w, h, h * 0.32), 0.08, 0.022, 3, 10), material ?? mats().creamLight);
	group.add(b.build('sign'));
	label.mesh.position.z = 0.044;
	group.add(label.mesh);
	return group;
}
