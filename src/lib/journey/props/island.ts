import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { blobShape, extrude } from '../kit/geometry';
import { mats } from '../kit/materials';

/** A floating slab of porcelain. Top surface sits at y = 0 in its own space. */
export function createIsland(outline: [number, number][], thickness = 0.62) {
	const m = mats();
	const b = new Batch();
	const top = blobShape(outline);
	const lip = extrude(top, thickness, 0.17, 7, 12);
	b.add(lip, m.porcelain, { r: [-Math.PI / 2, 0, 0], p: [0, -thickness / 2, 0] });

	// A second, narrower slab below the lip: the underside tapers away instead of ending flat.
	const inner = blobShape(outline.map(([x, y]) => shrink(x, y, outline, 0.86)));
	const under = extrude(inner, 0.5, 0.2, 6, 12);
	b.add(under, m.porcelain, { r: [-Math.PI / 2, 0, 0], p: [0, -thickness - 0.14, 0] });

	const group = b.build('island');
	group.traverse((o) => (o.castShadow = false));
	return group;
}

function shrink(x: number, y: number, outline: [number, number][], k: number): [number, number] {
	const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
	const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
	return [cx + (x - cx) * k, cy + (y - cy) * k];
}

/**
 * Soft blob on a plane far below, giving the sky a sense of a surface beneath the islands.
 * Because it really is further away, it drifts with parallax as the camera travels.
 */
export function createCastShadow(w: number, d: number, opacity = 0.2) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 256;
	const c = canvas.getContext('2d')!;
	// Opaque: alpha maps read the green channel, so transparency here would give a hard edge.
	const g = c.createRadialGradient(128, 128, 8, 128, 128, 126);
	g.addColorStop(0, '#fff');
	g.addColorStop(0.45, '#9e9e9e');
	g.addColorStop(0.8, '#1c1c1c');
	g.addColorStop(1, '#000');
	c.fillStyle = g;
	c.fillRect(0, 0, 256, 256);
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(w, d),
		new THREE.MeshBasicMaterial({
			color: '#2c6fbd',
			alphaMap: new THREE.CanvasTexture(canvas),
			transparent: true,
			opacity,
			depthWrite: false,
			fog: false
		})
	);
	mesh.rotation.x = -Math.PI / 2;
	return mesh;
}
