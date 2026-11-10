/**
 * A voyage: the long way between two far-apart moments of the story, from the map, the rail or the ends of the story,
 * flown instead of cut. The camera lifts away from the shot it was in until it can see both where it is and where it's
 * going, crosses over, and comes down into the new shot. On the way, the story itself passes underneath: in the same
 * part of the world it plays through quickly, seen from up there; between parts that can't be drawn at once, the
 * first half of the trip and the second, or the sky and the halls inside the model, it changes behind a veil, cloud
 * in the sky and the dark of the machine inside it. Coming up out of the model, the camera comes out above it.
 *
 * The page keeps the time: how far up, how far down, and what moment of the story is shown. This places the camera.
 */
import * as THREE from 'three';
import { lerp, smoother } from './kit/math';
import type { Rig } from './rig';

export interface Flight {
	/** Changes whenever the top of the flight does: a new flight, or the far side swapped in behind a veil. */
	id: number;
	/** The two moments of the story the top of the flight looks down on: both ends, or, either side of a veil, one. */
	over: [number, number];
	/** 0 to 1: up and away from the shot it left. */
	rise: number;
	/** 0 to 1: down into the shot it's going to. Above 0, the flight is on its way down. */
	fall: number;
	/** Somewhere else the top must see as well. */
	also?: [number, number, number];
	/**
	 * The top is close over this instead, the model say: going into it, the flight closes in on it as the dark comes;
	 * coming up out of it, the dark clears over it, so it's seen from outside before the flight goes on.
	 */
	near?: [number, number, number];
}

const DEG = Math.PI / 180;
/** How much of the screen, either way, the top of the flight fills with both its ends. */
const FILL = 0.6;
/** The least room round what the top looks down on, in world units, and the angle it looks down from. */
const LEAST = 6.5;
const EL = 33 * DEG;

export class Voyage {
	private id = -1;
	private apexPos = new THREE.Vector3();
	private apexLook = new THREE.Vector3();
	/** How big the top's view is, for the light's shadows. */
	reach = 10;
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private box = new THREE.Box3();
	private look = new THREE.Vector3();

	constructor(private rig: Rig) {}

	/** Where the top of a flight is: high over the middle of its two ends, far enough back to see them both. */
	private top(f: Flight, cam: THREE.PerspectiveCamera, aspect: number) {
		const A = this.rig.subjectAt(f.over[0], aspect, this.a);
		const B = this.rig.subjectAt(f.over[1], aspect, this.b);
		this.box.makeEmpty().expandByPoint(this.a).expandByPoint(this.b);
		if (f.also) this.box.expandByPoint(this.look.set(...f.also));
		const centre = this.box.getCenter(this.apexLook);
		const size = Math.max(A.radius, B.radius);
		const span = this.box.getSize(this.look).length() / 2 + size * 0.8;
		let R = Math.max(LEAST, span, size * 1.7);
		let el = EL;
		if (f.near) {
			centre.set(...f.near);
			R = LEAST;
			el = 48 * DEG;
		}
		this.reach = R;
		const halfV = Math.tan((cam.fov * DEG) / 2);
		const dist = R / (FILL * halfV * Math.min(1, aspect));
		// From the side the shots look from, a little higher: the world is laid out to be seen from its front.
		const az = (A.az + B.az) / 2;
		this.apexPos.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(centre);
	}

	/**
	 * Called once the rig has placed the camera for the moment the page is showing, before drawing: the flight goes on
	 * top of that shot, between it and the top.
	 */
	apply(cam: THREE.PerspectiveCamera, f: Flight, width: number, height: number) {
		if (f.id !== this.id) {
			this.id = f.id;
			this.top(f, cam, width / height);
		}
		const shot = cam.position;
		const focus = this.rig.focus;
		// Like a crane, and always through the open sky in front of the world, where nothing stands: going up, it draws
		// back out of the shot first and then rises; coming down, it comes down out there first, then glides in level
		// to the shot. Never straight up or down through whatever is stacked above or below a place.
		let across: number;
		let up: number;
		let turn: number;
		if (f.fall > 0) {
			up = 1 - smoother(Math.min(1, f.fall * 1.3));
			across = 1 - smoother(Math.max(0, (f.fall - 0.18) / 0.82));
			turn = 1 - smoother(Math.min(1, f.fall * 1.05));
		} else {
			across = smoother(Math.min(1, f.rise * 1.3));
			up = smoother(Math.max(0, (f.rise - 0.18) / 0.82));
			turn = smoother(Math.min(1, f.rise * 1.15));
		}
		const x = lerp(shot.x, this.apexPos.x, across);
		const y = lerp(shot.y, this.apexPos.y, up);
		const z = lerp(shot.z, this.apexPos.z, across);
		this.look.copy(focus).lerp(this.apexLook, turn);
		const ox = cam.view?.offsetX ?? 0;
		const oy = cam.view?.offsetY ?? 0;
		cam.position.set(x, y, z);
		cam.lookAt(this.look);
		const dist = cam.position.distanceTo(this.look);
		cam.near = Math.max(0.5, (dist - 60) * 0.2);
		cam.far = Math.max(500, dist + 200);
		// The shot's framing beside the words gives way to the middle of the screen at the top, and comes back on the way down.
		const lens = 1 - Math.max(across, turn);
		cam.setViewOffset(width, height, ox * lens, oy * lens, width, height);
		cam.updateProjectionMatrix();
		return { look: this.look, reach: lerp(this.rig.radius, this.reach, Math.max(across, up)) };
	}
}
