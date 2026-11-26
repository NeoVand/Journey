import * as THREE from 'three';

/** Something in the scene that answers when pressed. */
interface Pokeable {
	targets: THREE.Object3D[];
	/** Only while the story is about it, so nothing out of frame can be pressed by accident. */
	when: (T: number) => boolean;
	press: (index: number) => void;
	/** What it sounds like when pressed, by the name the sound score knows it by. */
	sound?: string;
	/** What pressing it does, said beside the pointer when it's over it: a side trip's name, say. */
	tip?: string | ((index: number) => string);
}

/** A simple shape to aim at, standing in for something too detailed to test every frame. */
export function hitBox(w: number, h: number, d: number) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
	mesh.visible = false;
	return mesh;
}

/**
 * A box round everything something is made of, in its own space, as its child: a stand-in to aim at that goes wherever
 * it goes.
 */
export function hitAround(object: THREE.Object3D, pad = 0.1) {
	const box = new THREE.Box3();
	const part = new THREE.Box3();
	const into = new THREE.Matrix4();
	object.updateMatrixWorld(true);
	const inverse = object.matrixWorld.clone().invert();
	object.traverse((o) => {
		const g = (o as THREE.Mesh).geometry;
		if (!g) return;
		if (!g.boundingBox) g.computeBoundingBox();
		box.union(part.copy(g.boundingBox!).applyMatrix4(into.multiplyMatrices(inverse, o.matrixWorld)));
	});
	const size = box.getSize(new THREE.Vector3()).addScalar(pad * 2);
	const hit = hitBox(size.x, size.y, size.z);
	box.getCenter(hit.position);
	object.add(hit);
	return hit;
}

export function hitBall(radius: number) {
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial());
	mesh.visible = false;
	return mesh;
}

/** Finds what's under the pointer. Visibility doesn't stop a ray, which is what lets the stand-ins work. */
export class Poker {
	private list: Pokeable[] = [];
	private ray = new THREE.Raycaster();
	private at = new THREE.Vector2();
	private hits: THREE.Intersection[] = [];

	add(p: Pokeable) {
		this.list.push(p);
	}

	/** x and y run from -1 to 1 across the screen. */
	pick(T: number, x: number, y: number, camera: THREE.Camera) {
		this.at.set(x, y);
		this.ray.setFromCamera(this.at, camera);
		let found: { p: Pokeable; index: number } | null = null;
		let nearest = Infinity;
		for (const p of this.list) {
			if (!p.when(T)) continue;
			p.targets.forEach((target, index) => {
				this.hits.length = 0;
				this.ray.intersectObject(target, false, this.hits);
				const hit = this.hits[0];
				if (hit && hit.distance < nearest) {
					nearest = hit.distance;
					found = { p, index };
				}
			});
		}
		return found as { p: Pokeable; index: number } | null;
	}
}
