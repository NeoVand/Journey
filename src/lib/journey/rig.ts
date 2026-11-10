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
	/** How tall the subject is on a phone, when that isn't the same as how wide. */
	tallRy?: number;
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

	/**
	 * room: on a phone, how far down the screen the words begin, as a share of its height. A shot framed above the words
	 * then takes all the room there is, down to the words and no further, however long the chapter's card is.
	 */
	private solve(shot: Shot, aspect: number, room?: number, top?: number, ceiling = 0, own?: Region) {
		let region = own ?? (aspect < 0.9 ? shot.tall : shot.wide);
		const above = aspect < 0.9 && room !== undefined && region.y < 0.2 && region.y + region.h < 0.9;
		// From just under the header down to where the words start: nothing of the picture hides beneath either.
		if (above) {
			const y = Math.max(region.y, ceiling);
			region = { ...region, y, h: Math.max(0.24, room - y) };
		}
		// The title page is the other way up: its words are at the top, and the picture has the screen below them.
		const below = aspect < 0.9 && top !== undefined && region.y >= 0.3;
		if (below) region = { ...region, y: top, h: Math.max(0.24, 0.98 - top) };
		const halfV = Math.tan((this.camera.fov * DEG) / 2);
		const radius = aspect < 0.9 && shot.tallRadius ? shot.tallRadius : shot.radius;
		const ry = aspect < 0.9 && shot.tallRadius ? (shot.tallRy ?? shot.tallRadius) : (shot.ry ?? shot.radius);
		const dist = Math.max(ry / (region.h * halfV), radius / (region.w * aspect * halfV));
		// On the shortest phones the words take more of the screen, so the subject sits a little higher.
		const lift = aspect < 0.9 && !above && !below ? Math.max(0, Math.min(1, (aspect - 0.47) / 0.09)) * 0.035 : 0;
		return {
			dist,
			fill: Math.min(region.h, region.w * aspect),
			shiftX: region.x + region.w / 2 - 0.5,
			shiftY: region.y + region.h / 2 - 0.5 - lift
		};
	}

	/** The part of the screen the picture has at a moment of the story: between two shots, part way from one to the next. */
	private regionAt(T: number, aspect: number): Region {
		const { shots } = this;
		let i = 0;
		while (i < shots.length - 2 && T >= shots[i + 1].T) i++;
		const k = smoother(Math.min(1, Math.max(0, (T - shots[i].T) / (shots[i + 1].T - shots[i].T))));
		const a = aspect < 0.9 ? shots[i].tall : shots[i].wide;
		const b = aspect < 0.9 ? shots[i + 1].tall : shots[i + 1].wide;
		return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
	}

	/**
	 * On a phone: room is where the words start, top where the title page's words end, and ceiling where the header
	 * ends, each as a share of the screen's height. home, during a peek at another moment, is the moment the reader is
	 * at: the picture shows the other moment, in the part of the screen the reader's own card leaves it.
	 */
	update(T: number, width: number, height: number, parallaxX = 0, parallaxY = 0, time = 0, room?: number, top?: number, ceiling?: number, home?: number) {
		const aspect = width / height;
		const { shots } = this;
		let i = 0;
		while (i < shots.length - 2 && T >= shots[i + 1].T) i++;
		const a = shots[i];
		const b = shots[i + 1];
		const k = smoother(Math.min(1, Math.max(0, (T - a.T) / (b.T - a.T))));
		const own = home === undefined ? undefined : this.regionAt(home, aspect);
		const A = this.solve(a, aspect, room, top, ceiling, own);
		const B = this.solve(b, aspect, room, top, ceiling, own);

		// The camera never quite stops: a slow drift keeps depth alive while the reader is reading.
		const az = lerp(a.az, b.az, k) * DEG + parallaxX * 0.018 + Math.sin(time * 0.31) * 0.0045;
		const el = lerp(a.el, b.el, k) * DEG + parallaxY * 0.012 + Math.sin(time * 0.23 + 1.1) * 0.0028;
		const dist = Math.exp(lerp(Math.log(A.dist), Math.log(B.dist), k));
		const sx = lerp(A.shiftX, B.shiftX, k);
		// On a phone the picture keeps its place above the words even while no card is up. Sliding it down to fill the
		// screen between cards, and back up as the next arrives, bobbed the whole picture at every turn of the page.
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
		// And it has to reach past the subject: a tall phone backs a long way off to fit the whole world across.
		this.camera.far = Math.max(500, dist + 160);

		// Lens shift: slides the image without rotating the camera, so verticals stay true.
		this.camera.aspect = aspect;
		this.camera.setViewOffset(width, height, -sx * width, -sy * height, width, height);
		this.camera.updateProjectionMatrix();
		// How much of the screen's height the picture has to itself, beside or above the words: whatever else moves the
		// camera for a moment (a visit, say) frames things to fit that, not the whole screen.
		this.camera.userData.fill = lerp(A.fill, B.fill, k);
	}
}
