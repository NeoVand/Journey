import * as THREE from 'three';
import { Batch } from './batch';
import { extrude, rbox, roundedRect } from './geometry';
import { Label } from './print';
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

/** A printed plate: the plate is sized from its text, so every sign has the same margins. */
export function createSign(text: string, height = 0.2, ink = '#111a2e', material?: THREE.Material) {
	const group = new THREE.Group();
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
