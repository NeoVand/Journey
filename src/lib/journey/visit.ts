/**
 * A visit: the conversation names something, and the camera goes to it. It flies there from wherever the shot had it,
 * up and over rather than through anything, frames the thing in the picture and drifts slowly round it while it's
 * talked about, then comes back to the shot. Meanwhile the thing glows the token's amber and the rest of the scene goes
 * a little into shade. Inside a room, where flying could cross a wall, it only turns and comes closer.
 *
 * Things are found by the names they're built with: a machine or a sign by its words, a label by its text, a batch by
 * its build name, a drawer by its own.
 */
import * as THREE from 'three';
import { smooth, smoother } from './kit/math';
import { color } from './kit/materials';
import type { Stage } from './stage';

export interface VisitCue {
	/** Names of things in the scene: the biggest one in view, or all of them together. */
	names: string[];
	together?: boolean;
	/** Seconds to stay. */
	hold?: number;
	/** Done once the camera has arrived: a drawer slides out, a wheel spins. */
	act?: () => void;
	/** Fly there through open air, or only turn and come closer, inside a room. */
	fly: boolean;
	/** A peek at another moment of the story: no way back by camera; the page cuts back once it has stayed. */
	cutBack?: boolean;
	/** For reduced motion: it glows, and what happens happens, but the camera stays with the shot. */
	still?: boolean;
	/**
	 * Pulls back to show a whole, the loop say: the one kind of visit that may go further away than the shot. It rises
	 * high to see the shape of it, takes its time, and lights nothing in particular, since the whole is the point.
	 */
	wide?: boolean;
}

/** Seconds to get there, and to come back; a pull back to see a whole takes longer, so the reveal can be read. */
const GO = 1.5;
const BACK = 1.3;
const WIDE_GO = 2.6;
const WIDE_BACK = 2.1;
const QUICK = 0.6;
/** How far the camera drifts round the thing while it stays, in radians. */
const DRIFT = 0.16;
/** Seconds for a glow left behind to die away, when a visit hands over to the next. */
const FADE = 0.45;
/** How quickly the scene's shade follows the visits, per second: it never jumps when one hands over to the next. */
const SHADE = 5;
/** Smaller across than this, in world units, and a thing has shrunk out of sight. */
const SHRUNK = 0.05;
const GLOW = new THREE.Color(color.amber);

type Phase = 'go' | 'stay' | 'held' | 'back';

export class Visits {
	private v: {
		cue: VisitCue;
		things: THREE.Object3D[];
		centre: THREE.Vector3;
		phase: Phase;
		t: number;
		go: number;
		hold: number;
		back: number;
		fromPos: THREE.Vector3;
		fromLook: THREE.Vector3;
		toPos: THREE.Vector3;
		/** Where the camera was, and was looking, as it turned to come back. */
		leftPos: THREE.Vector3;
		leftLook: THREE.Vector3;
		acted: boolean;
		/** How far in shade the scene was as this visit began: one visit handing to the next keeps it there. */
		carry: number;
	} | null = null;
	/** Each glowing mesh wears a copy of its material; its own is kept here. */
	private glowing = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
	/** Meshes a visit has moved on from: their glow dies away from where it was, rather than going out at once. */
	private fading = new Map<THREE.Mesh, { own: THREE.Material | THREE.Material[]; level: number }>();
	/** How strongly the things glowed last frame, and how far the rest of the scene is in shade. */
	private lit = 0;
	private shade = 0;
	/** Which way round the next visit drifts: it alternates, so no two feel the same. */
	private turn = 1;
	/** The pose drawn last frame, so a visit or a way back starts from exactly there. */
	private lastPos = new THREE.Vector3();
	private lastLook = new THREE.Vector3();
	private box = new THREE.Box3();
	private part = new THREE.Box3();
	private piece = new THREE.Box3();
	private sphere = new THREE.Sphere();
	private v1 = new THREE.Vector3();
	private v2 = new THREE.Vector3();
	private v3 = new THREE.Vector3();
	private pos = new THREE.Vector3();
	private look = new THREE.Vector3();
	private ahead = new THREE.Vector3();
	private up = new THREE.Vector3(0, 1, 0);
	private ray = new THREE.Raycaster();

	constructor(
		private stage: Stage,
		/** Where to look for things: the scenes being drawn now. */
		private scenes: () => (THREE.Object3D | undefined)[]
	) {}

	/** A visit is going, staying or coming back. */
	get busy() {
		return !!this.v;
	}

	/** A peek has stayed its time and is waiting for the page to cut back. */
	get waiting() {
		return this.v?.phase === 'held';
	}

	/** Whether something by one of these names is in the scene now, shot or not. */
	has(names: string[]) {
		return this.find(names, false).length > 0;
	}

	/** Starts a visit to the things named, from wherever the camera is now. False if there's nothing by those names. */
	start(cue: VisitCue) {
		const things = this.find(cue.names, !!cue.together);
		if (!things.length) return false;
		const cam = this.stage.camera;
		this.boundsOf(things).getBoundingSphere(this.sphere);
		const centre = this.sphere.center.clone();
		const radius = Math.max(0.7, this.sphere.radius);
		const fromPos = this.v ? this.lastPos.clone() : cam.position.clone();
		const fromLook = this.v ? this.lastLook.clone() : this.lookOf(cam, centre, new THREE.Vector3());
		// Close enough that it fills a good part of the picture, and never further than the camera was: a visit always
		// comes closer. From the side the camera sees it from now, at a comfortable height, turned a little, the other way
		// from last time; and if something stands in the way, from the nearest side where nothing does.
		// To fit the part of the screen the picture has beside the words. A small thing wants room round it to be read
		// in its place; a whole machine can fill more of it.
		const fill = Math.min(1, Math.max(0.25, cam.userData.fill ?? 1));
		const margin = 2.2 - 0.9 * Math.min(1, Math.max(0, (radius - 1) / 1.5));
		const fit = (radius / (fill * Math.tan((cam.fov * Math.PI) / 360))) * margin;
		const away = this.v1.copy(fromPos).sub(centre);
		// Coming closer than the shot, but never so close the thing overflows the picture: a shot already near it stays.
		const dist = cue.wide ? fit : Math.max(fit * 0.8, Math.min(fit, away.length() * 0.85));
		const toPos = new THREE.Vector3();
		if (cue.fly && cue.wide) {
			// High over it, from the side the camera is on: from up there nothing stands in the way of a whole.
			const az = Math.atan2(away.x, away.z);
			const el = 0.78;
			toPos.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(centre);
		} else if (cue.fly) {
			const el0 = Math.min(0.62, Math.max(0.24, Math.asin(Math.max(-1, Math.min(1, away.y / Math.max(1e-6, away.length()))))));
			const az0 = Math.atan2(away.x, away.z) + 0.2 * this.turn;
			const at = (az: number, el: number) => toPos.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(centre);
			let found = false;
			for (const el of [el0, Math.min(0.85, el0 + 0.3)]) {
				for (const turn of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
					if (this.clear(centre, at(az0 + turn * this.turn, el), radius, things)) {
						found = true;
						break;
					}
				}
				if (found) break;
			}
			if (!found) at(az0, el0);
		} else {
			toPos.copy(away.normalize()).multiplyScalar(Math.min(fromPos.distanceTo(centre) * 0.75, fit)).add(centre);
		}
		// What glowed for the last visit fades as this one's glow comes up, and the shade carries on from where it is.
		this.fadeGlow();
		if (!cue.wide) this.glowOn(things);
		this.v = {
			cue,
			things,
			centre,
			phase: 'go',
			t: 0,
			go: cue.wide ? WIDE_GO : GO,
			hold: cue.hold ?? 3.6,
			back: cue.wide ? WIDE_BACK : BACK,
			fromPos,
			fromLook,
			toPos,
			leftPos: new THREE.Vector3(),
			leftLook: new THREE.Vector3(),
			acted: false,
			carry: this.shade
		};
		this.turn *= -1;
		return true;
	}

	/** Goes back now: the talk stopped, or the reader moved on. quick gives the shot back in a moment. */
	release(quick = false) {
		const v = this.v;
		if (!v || v.phase === 'back') return;
		v.leftPos.copy(this.lastPos);
		v.leftLook.copy(this.lastLook);
		v.phase = 'back';
		v.t = 0;
		v.back = quick ? QUICK : v.cue.wide ? WIDE_BACK : BACK;
	}

	/** Drops the visit at once, with nothing to animate: the page has cut away, so nobody sees the jump. */
	end() {
		this.v = null;
		this.unglow();
		this.lit = 0;
		this.shade = 0;
		this.stage.dimmed = 0;
	}

	/**
	 * Called each frame once the shot has placed the camera, just before drawing: the visit goes on top of the shot.
	 * clock drives the glow's slow breath.
	 */
	apply(dt: number, clock: number) {
		const cam = this.stage.camera;
		const v = this.v;
		this.fadeOut(dt);
		if (!v) {
			this.ease(0, dt);
			this.lastPos.copy(cam.position);
			return;
		}
		// The shot as the story has it this frame: where coming back goes to.
		const livePos = this.v2.copy(cam.position);
		const liveLook = this.lookOf(cam, v.centre, this.v3);
		v.t += dt;
		let k = 1;
		const pos = this.pos;
		const look = this.look;
		if (v.phase === 'go') {
			const e = smoother(Math.min(1, v.t / v.go));
			this.arc(v.fromPos, v.toPos, e, pos);
			look.lerpVectors(v.fromLook, v.centre, e);
			k = e;
			if (v.t >= v.go) {
				v.phase = 'stay';
				v.t = 0;
			}
		} else if (v.phase === 'stay' || v.phase === 'held') {
			// A slow drift round it, so it's seen as a thing with sides.
			const drift = this.turn * -DRIFT * smooth(Math.min(1, v.t / Math.max(1, v.hold)));
			pos.copy(v.toPos).sub(v.centre).applyAxisAngle(this.up, drift).add(v.centre);
			look.copy(v.centre);
			if (!v.acted && v.t > 0.2) {
				v.acted = true;
				v.cue.act?.();
			}
			if (v.phase === 'stay' && v.t >= v.hold) {
				if (v.cue.cutBack) v.phase = 'held';
				else {
					v.leftPos.copy(pos);
					v.leftLook.copy(look);
					v.phase = 'back';
					v.t = 0;
				}
			}
		} else {
			const e = smoother(Math.min(1, v.t / v.back));
			this.arc(v.leftPos, livePos, e, pos);
			look.lerpVectors(v.leftLook, liveLook, e);
			k = 1 - e;
			if (v.t >= v.back) {
				// Home: the glow has all but gone, and the last of the shade lifts on its own.
				this.v = null;
				this.fadeGlow();
				this.ease(0, dt);
				this.lastPos.copy(cam.position);
				return;
			}
		}
		if (v.cue.still) {
			pos.copy(livePos);
			look.copy(liveLook);
		} else {
			cam.position.copy(pos);
			cam.lookAt(look);
			cam.updateMatrixWorld();
		}
		this.lastPos.copy(pos);
		this.lastLook.copy(look);
		// A slow breath, not a pulse: anything quicker reads as a flicker.
		const glow = smooth(k) * (0.9 + 0.1 * Math.sin(clock * 2.4));
		this.lit = glow;
		// A look at a whole singles nothing out, so nothing goes into shade either.
		this.ease(v.cue.wide ? 0 : Math.max(smooth(k), v.phase === 'go' ? v.carry : 0), dt);
		for (const mesh of this.glowing.keys()) {
			for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
				// What already shines, a lamp or a screen, keeps its own light; the rest warms towards amber.
				if (!m.emissive || !m.userData.glows) continue;
				m.emissive.copy(m.userData.glow);
				m.emissiveIntensity = 0.38 * glow;
			}
		}
	}

	/**
	 * Whether the camera at a place would see the thing's middle with nothing in between: no other drawn thing, only
	 * the thing itself, and nothing see-through like cloud counts.
	 */
	private clear(centre: THREE.Vector3, from: THREE.Vector3, radius: number, things: THREE.Object3D[]) {
		const dir = this.v3.copy(from).sub(centre);
		const far = dir.length();
		this.ray.set(centre, dir.normalize());
		// Sprites need to know the camera to be tested at all.
		this.ray.camera = this.stage.camera;
		this.ray.far = far;
		this.ray.near = radius * 0.6;
		for (const scene of this.scenes()) {
			if (!scene) continue;
			for (const hit of this.ray.intersectObject(scene, true)) {
				const o = hit.object as THREE.Mesh;
				if (!o.isMesh) continue;
				let shown = true;
				let own = false;
				for (let p: THREE.Object3D | null = o; p; p = p.parent) {
					if (!p.visible) shown = false;
					if (things.includes(p)) own = true;
				}
				const m = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material;
				if (!shown || own || (m.transparent && m.opacity < 0.6)) continue;
				return false;
			}
		}
		return true;
	}

	/** On open ground the way is up and over, never straight through what's between. */
	private arc(a: THREE.Vector3, b: THREE.Vector3, e: number, out: THREE.Vector3) {
		out.lerpVectors(a, b, e);
		if (this.v?.cue.fly) out.y += a.distanceTo(b) * 0.2 * Math.sin(Math.PI * e);
		return out;
	}

	/** What the camera is looking at: straight ahead, as far away as the thing it's about to visit. */
	private lookOf(cam: THREE.Camera, centre: THREE.Vector3, out: THREE.Vector3) {
		cam.getWorldDirection(this.ahead);
		return out.copy(this.ahead).multiplyScalar(cam.position.distanceTo(centre)).add(cam.position);
	}

	private find(names: string[], together: boolean) {
		const found: { o: THREE.Object3D; size: number }[] = [];
		for (const scene of this.scenes()) {
			if (!scene) continue;
			for (const name of names) {
				for (const o of scene.getObjectsByProperty('name', name)) {
					let on = true;
					for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) on = false;
					if (!on) continue;
					// A sign shrunk away to nothing until its moment is as good as not there.
					const box = this.boundsOf([o], this.part);
					const size = box.isEmpty() ? 0 : box.getSize(this.v1).length();
					if (size > SHRUNK) found.push({ o, size });
				}
			}
		}
		if (together) return found.map((f) => f.o);
		found.sort((a, b) => b.size - a.size);
		return found.slice(0, 1).map((f) => f.o);
	}

	/** The box round what's drawn of some things: a hidden stand-in for pressing doesn't count. */
	private boundsOf(things: THREE.Object3D[], box = this.box) {
		box.makeEmpty();
		for (const t of things) {
			t.traverseVisible((m) => {
				const g = (m as THREE.Mesh).geometry;
				if (!g) return;
				if (!g.boundingBox) g.computeBoundingBox();
				box.union(this.piece.copy(g.boundingBox!).applyMatrix4(m.matrixWorld));
			});
		}
		return box;
	}

	/** Each mesh of the things takes a copy of its material, so it can glow without lighting anything else. */
	private glowOn(things: THREE.Object3D[]) {
		for (const t of things) {
			t.traverseVisible((o) => {
				const mesh = o as THREE.Mesh;
				if (!mesh.isMesh || this.glowing.has(mesh)) return;
				const own = mesh.material;
				const copy = (m: THREE.Material) => {
					const c = m.clone();
					const own = m as THREE.MeshStandardMaterial;
					// A lamp or a screen already shines; a label or a picture keeps its print sharp. The rest lights up in its
					// own colour, warmed a little towards the token's amber, so a blue box glows blue.
					c.userData.glows = !!own.emissive && own.emissive.getHex() === 0 && !own.map;
					if (c.userData.glows) c.userData.glow = own.color.clone().lerp(GLOW, 0.3);
					return c;
				};
				// Still fading from the last visit: it takes up its glow again from where it is.
				const left = this.fading.get(mesh);
				if (left) {
					this.fading.delete(mesh);
					this.glowing.set(mesh, left.own);
					return;
				}
				this.glowing.set(mesh, own);
				mesh.material = Array.isArray(own) ? own.map(copy) : copy(own);
			});
		}
	}

	/** Each glowing mesh starts to fade, from however bright it is now. */
	private fadeGlow() {
		for (const [mesh, own] of this.glowing) this.fading.set(mesh, { own, level: this.lit });
		this.glowing.clear();
		this.lit = 0;
	}

	/** Fading glows die down, and each gets its own material back once it's dark. */
	private fadeOut(dt: number) {
		for (const [mesh, f] of this.fading) {
			f.level -= dt / FADE;
			if (f.level <= 0) {
				this.restore(mesh, f.own);
				this.fading.delete(mesh);
				continue;
			}
			for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
				if (m.emissive && m.userData.glows) m.emissiveIntensity = 0.38 * f.level;
			}
		}
	}

	/** The rest of the scene goes into shade, or comes out of it, smoothly. */
	private ease(to: number, dt: number) {
		this.shade += (to - this.shade) * Math.min(1, dt * SHADE);
		if (to === 0 && this.shade < 0.002) this.shade = 0;
		this.stage.dimmed = this.shade;
	}

	private restore(mesh: THREE.Mesh, own: THREE.Material | THREE.Material[]) {
		const worn = mesh.material;
		mesh.material = own;
		for (const m of Array.isArray(worn) ? worn : [worn]) m.dispose();
	}

	private unglow() {
		for (const [mesh, material] of this.glowing) this.restore(mesh, material);
		for (const [mesh, f] of this.fading) this.restore(mesh, f.own);
		this.glowing.clear();
		this.fading.clear();
	}
}
