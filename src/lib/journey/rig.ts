import * as THREE from 'three';
import { lerp, smoother } from './kit/math';

/** Part of the viewport, in fractions, that the subject must sit inside. */
export interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Shot {
	T: number;
	az: number;
	el: number;
	target: [number, number, number];
	radius: number;
	/** Vertical extent, when the subject is far wider than it is tall. Defaults to radius. */
	ry?: number;
	wide: Region;
	tall: Region;
	/** Narrow screens can get their own subject, e.g. following one part of something wide. */
	tallTarget?: [number, number, number];
	tallRadius?: number;
}

const DEG = Math.PI / 180;
const v = new THREE.Vector3();

/**
 * Art direction for the camera. Each shot says what to look at and where on screen it
 * must land. Distance and lens shift are solved from that, so a subject stays put in its
 * region on every viewport, and never sits under the text beside it.
 */
export class Rig {
	focus = new THREE.Vector3();
	radius = 5;

	constructor(
		private camera: THREE.PerspectiveCamera,
		private shots: Shot[]
	) {}

	private solve(shot: Shot, aspect: number) {
		const region = aspect < 0.9 ? shot.tall : shot.wide;
		const halfV = Math.tan((this.camera.fov * DEG) / 2);
		const radius = aspect < 0.9 && shot.tallRadius ? shot.tallRadius : shot.radius;
		const ry = aspect < 0.9 && shot.tallRadius ? shot.tallRadius : (shot.ry ?? shot.radius);
		const dist = Math.max(ry / (region.h * halfV), radius / (region.w * aspect * halfV));
		// On the shortest phones the words take more of the screen, so the subject sits a little higher.
		const lift = aspect < 0.9 ? Math.max(0, Math.min(1, (aspect - 0.47) / 0.09)) * 0.035 : 0;
		return {
			dist,
			shiftX: region.x + region.w / 2 - 0.5,
			shiftY: region.y + region.h / 2 - 0.5 - lift
		};
	}

	update(T: number, width: number, height: number, parallaxX = 0, parallaxY = 0, time = 0) {
		const aspect = width / height;
		const { shots } = this;
		let i = 0;
		while (i < shots.length - 2 && T >= shots[i + 1].T) i++;
		const a = shots[i];
		const b = shots[i + 1];
		const k = smoother(Math.min(1, Math.max(0, (T - a.T) / (b.T - a.T))));
		const A = this.solve(a, aspect);
		const B = this.solve(b, aspect);

		// The camera never quite stops: a slow drift keeps depth alive while the reader is reading.
		const az = lerp(a.az, b.az, k) * DEG + parallaxX * 0.018 + Math.sin(time * 0.31) * 0.0045;
		const el = lerp(a.el, b.el, k) * DEG + parallaxY * 0.012 + Math.sin(time * 0.23 + 1.1) * 0.0028;
		const dist = Math.exp(lerp(Math.log(A.dist), Math.log(B.dist), k));
		const sx = lerp(A.shiftX, B.shiftX, k);
		const sy = lerp(A.shiftY, B.shiftY, k);

		const ta = aspect < 0.9 && a.tallTarget ? a.tallTarget : a.target;
		const tb = aspect < 0.9 && b.tallTarget ? b.tallTarget : b.target;
		this.focus.set(lerp(ta[0], tb[0], k), lerp(ta[1], tb[1], k), lerp(ta[2], tb[2], k));
		this.radius = lerp(a.radius, b.radius, k);

		v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(this.focus);
		this.camera.position.copy(v);
		this.camera.lookAt(this.focus);
		// From far away the depth buffer needs its precision out there, or decals start to fight the faces they sit on.
		this.camera.near = Math.max(0.5, (dist - 60) * 0.2);

		// Lens shift: slides the image without rotating the camera, so verticals stay true.
		this.camera.aspect = aspect;
		this.camera.setViewOffset(width, height, -sx * width, -sy * height, width, height);
		this.camera.updateProjectionMatrix();
	}
}
