import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];
export interface Place {
	p?: V3;
	r?: V3;
	s?: V3 | number;
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

/**
 * Collects static parts and merges them per material. A machine made of two hundred
 * little parts costs a handful of draw calls, so modelling detail stays cheap.
 */
export class Batch {
	private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

	add(geo: THREE.BufferGeometry, mat: THREE.Material, { p = [0, 0, 0], r = [0, 0, 0], s = 1 }: Place = {}) {
		const g = geo.index ? geo.toNonIndexed() : geo.clone();
		for (const key of Object.keys(g.attributes)) {
			if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
		}
		if (!g.attributes.uv) {
			g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
		}
		const scale = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
		m.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), scale);
		g.applyMatrix4(m);
		const list = this.parts.get(mat);
		if (list) list.push(g);
		else this.parts.set(mat, [g]);
		return this;
	}

	build(name = 'batch') {
		const group = new THREE.Group();
		group.name = name;
		for (const [mat, list] of this.parts) {
			const merged = mergeGeometries(list, false);
			if (!merged) continue;
			const mesh = new THREE.Mesh(merged, mat);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			group.add(mesh);
			list.forEach((g) => g.dispose());
		}
		this.parts.clear();
		return group;
	}
}
