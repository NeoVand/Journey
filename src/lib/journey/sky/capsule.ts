import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { hash, outBack, seg } from '../kit/math';
import { Label } from '../kit/print';
import { palette } from './palette';

/*
 * The request's capsule: how your request crosses the internet. A glass pod with brass ends, in two halves: its lid
 * swings up off its side so the rolled-up page can be dropped in, swings shut, and a padlock on its seam snaps shut over
 * a brass hasp. Then the glass clouds over with ciphertext, little blue blocks that no longer look like anything
 * readable, so no one along the way can read a word of it (TLS). It rides the aqueduct's left lane to the provider's
 * front door, where the first check decrypts it: the blocks clear, the padlock opens, and the paper is paper again.
 *
 * Its own frame: its axis along x, the way it travels towards +x; its lid hinged along its right side (+z); its foot on
 * the lane's belt at y = 0, its axis R above it.
 */

/** Its glass: half its length between the brass ends, and its radius. */
export const CAPSULE = { half: 0.95, r: 0.4 };
const R = CAPSULE.r;
const HALF = CAPSULE.half;
/** How far its lid swings open. */
const OPEN = 2.05;

/** Half a glass pod along x: its shell, and a quarter-sphere of brass at each end. upper: the top half, or the bottom. */
function half(b: Batch, glass: THREE.Material, brass: THREE.Material, upper: boolean) {
	const shell = new THREE.CylinderGeometry(R, R, HALF * 2, 40, 1, true, upper ? 0 : Math.PI, Math.PI);
	const g = new THREE.Mesh(shell, glass);
	g.rotation.z = Math.PI / 2;
	g.renderOrder = 5;
	const theta = upper ? 0 : Math.PI / 2;
	b.add(new THREE.SphereGeometry(R + 0.02, 28, 12, Math.PI / 2, Math.PI, theta, Math.PI / 2), brass, { p: [HALF, 0, 0] });
	b.add(new THREE.SphereGeometry(R + 0.02, 28, 12, -Math.PI / 2, Math.PI, theta, Math.PI / 2), brass, { p: [-HALF, 0, 0] });
	// Brass bands round its glass at either end and in the middle, a half ring each.
	for (const x of [-HALF + 0.02, 0, HALF - 0.02]) b.add(new THREE.TorusGeometry(R + 0.015, 0.045, 10, 24, Math.PI), brass, { p: [x, 0, 0], r: [0, Math.PI / 2, upper ? 0 : Math.PI] });
	// A brass rim along its open edge, either side.
	for (const s of [-1, 1]) b.add(rbox(HALF * 2, 0.05, 0.05, 0.02), brass, { p: [0, upper ? 0.02 : -0.02, s * R] });
	return g;
}

export class Capsule {
	group = new THREE.Group();
	/** Its top half, hinged along its right side, which swings up to let the page in and out. */
	private lid = new THREE.Group();
	private lockBody = new THREE.Group();
	private shackle = new THREE.Group();
	private bricks: THREE.InstancedMesh;
	private glass: THREE.MeshPhysicalMaterial;
	private dummy = new THREE.Object3D();

	constructor() {
		this.group.name = 'capsule';
		const c = palette();
		const m = mats();
		const body = new THREE.Group();
		body.position.y = R;
		this.group.add(body);

		// The glass, faintly amber: the request is yours until the provider reads it.
		this.glass = new THREE.MeshPhysicalMaterial({ color: '#fff1d6', transparent: true, opacity: 0.3, roughness: 0.06, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
		const b = new Batch();
		body.add(half(b, this.glass, c.brass, false));
		// Its runners: two brass skids along its foot, so it sits on the belt rather than rolling on it.
		for (const s of [-1, 1]) b.add(rbox(HALF * 2 - 0.2, 0.06, 0.08, 0.025), c.brass, { p: [0, -R + 0.03, s * R * 0.55] });
		// The hinge along its right side, and the staple the padlock goes through on its left.
		b.add(new THREE.CylinderGeometry(0.035, 0.035, HALF * 2 - 0.3, 12), c.gold, { p: [0, 0, R + 0.03], r: [0, 0, Math.PI / 2] });
		b.add(rbox(0.2, 0.12, 0.06, 0.02), c.brass, { p: [-0.3, -0.07, -R - 0.03] });
		body.add(b.build('capsule'));

		// The lid: the top half, its hinge along the right side.
		const lb = new Batch();
		const lidGlass = half(lb, this.glass, c.brass, true);
		// Its hasp, on the left, coming down over the staple.
		lb.add(rbox(0.18, 0.16, 0.04, 0.02), c.brass, { p: [-0.3, 0.02, -R - 0.06] });
		const lidParts = lb.build('capsule-lid');
		for (const part of [lidGlass, lidParts]) {
			part.position.z -= R;
			this.lid.add(part);
		}
		this.lid.position.set(0, 0, R);
		body.add(this.lid);

		// The padlock on its seam: the same as on every connection that is encrypted, facing out to its left.
		const lock = new Batch();
		const w = 0.3;
		const h = 0.24;
		lock.add(extrude(roundedRect(w, h, 0.07), 0.13, 0.025, 4, 10), m.cobalt);
		lock.add(extrude(roundedRect(w - 0.1, h - 0.1, 0.04), 0.01, 0.003, 1, 8), m.steel, { p: [0, 0, 0.066] });
		lock.add(new THREE.CircleGeometry(0.027, 20), m.recess, { p: [0, 0.02, 0.073] });
		this.lockBody.add(lock.build('lock-body'));
		const sh = new Batch();
		sh.add(new THREE.TorusGeometry(0.095, 0.024, 12, 28, Math.PI), m.steel, { p: [0, 0.105, 0] });
		for (const s of [-1, 1]) sh.add(new THREE.CylinderGeometry(0.024, 0.024, 0.11, 14), m.steel, { p: [s * 0.095, 0.05, 0] });
		this.shackle.add(sh.build('lock-shackle'));
		this.shackle.position.y = h / 2 - 0.025;
		this.lockBody.add(this.shackle);
		// Hung high on the seam, so it rides clear of the lane's kerb.
		this.lockBody.position.set(-0.3, -0.14, -R - 0.11);
		this.lockBody.rotation.y = Math.PI;
		body.add(this.lockBody);

		// The ciphertext inside: blocks that no longer look like anything.
		const brickMat = new THREE.MeshStandardMaterial({ color: '#2f74f0', roughness: 0.3, emissive: '#0f55ff', emissiveIntensity: 1.5 });
		this.bricks = new THREE.InstancedMesh(rbox(0.085, 0.045, 0.045, 0.01, 2), brickMat, 90);
		this.bricks.frustumCulled = false;
		body.add(this.bricks);
	}

	/** Where the page's roll lies inside it, in the world: on its axis, its middle. */
	middle(target: THREE.Vector3) {
		return this.group.localToWorld(target.set(0, R, 0));
	}

	/**
	 * Stands it on a lane at a point, its axis along the lane's direction there, its foot on the belt, level across.
	 */
	sit(at: THREE.Vector3, along: THREE.Vector3) {
		const x = along.clone().normalize();
		const y = new THREE.Vector3(0, 1, 0).addScaledVector(x, -x.y).normalize();
		const z = x.clone().cross(y);
		this.group.position.copy(at);
		this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
	}

	/**
	 * open: 0 shut, 1 its lid right up. lock: 0 open, 1 snapped shut. cipher: 0 the glass clear, 1 clouded and full of
	 * ciphertext, the blocks churning as it rides.
	 */
	update(open: number, lock: number, cipher: number, time: number) {
		this.lid.rotation.x = outBack(seg(open, 0, 1), 1.4) * OPEN;
		// The shackle drops into the body with one small bounce, through the hasp.
		const k = outBack(seg(lock, 0, 1), 3);
		this.shackle.position.y = 0.115 + (0.1 - k * 0.1);
		this.shackle.rotation.y = (1 - seg(lock, 0, 0.5)) * -0.5;
		const nudge = Math.sin(seg(lock, 0.5, 1) * Math.PI) * 0.04;
		this.lockBody.scale.set(1 + nudge, 1 - nudge, 1 + nudge);
		// Behind the ciphertext the glass goes cloudy, so nothing can be made out through it.
		this.glass.opacity = 0.3 + cipher * 0.4;
		this.glass.color.set('#fff1d6').lerp(new THREE.Color('#bcd2ff'), cipher);
		const d = this.dummy;
		const n = this.bricks.count;
		for (let i = 0; i < n; i++) {
			const show = seg(cipher, hash(i + 13) * 0.6, hash(i + 13) * 0.6 + 0.4);
			if (show <= 0) d.scale.setScalar(0);
			else {
				const u = (hash(i + 1) + time * 0.12 * (0.8 + hash(i + 7) * 0.5)) % 1;
				const a = hash(i + 3) * Math.PI * 2 + time * (0.6 + hash(i + 5));
				const rad = (R - 0.08) * Math.sqrt(hash(i + 11));
				d.position.set(-HALF + 0.08 + u * (HALF * 2 - 0.16), Math.cos(a) * rad, Math.sin(a) * rad);
				d.rotation.set(hash(i + 5) * 6 + time * 0.8, hash(i + 9) * 6 + time * 0.5, 0);
				d.scale.setScalar(show * (0.7 + hash(i + 2) * 0.8));
			}
			d.updateMatrix();
			this.bricks.setMatrixAt(i, d.matrix);
		}
		this.bricks.instanceMatrix.needsUpdate = true;
		this.bricks.visible = cipher > 0;
	}
}

/**
 * GitHub's own front door, only there when the reader picked Copilot: a cobalt arch over the aqueduct's deck, standing on
 * its kerbs, with its name on a plate and a lamp that turns green as the capsule goes under. Its frame: its foot on the
 * deck's middle line, the lanes running through it along z.
 */
export class CopilotArch {
	group = new THREE.Group();
	private lamp: Lamp;
	private shown = 0;

	constructor(span: number) {
		this.group.name = 'GitHub Copilot API';
		const m = mats();
		const c = palette();
		const b = new Batch();
		const h = 2.3;
		for (const s of [-1, 1]) {
			b.add(rbox(0.32, h, 0.42, 0.07, 3), m.cobalt, { p: [s * (span / 2), h / 2, 0] });
			b.add(rbox(0.5, 0.12, 0.6, 0.04), c.brass, { p: [s * (span / 2), 0.06, 0] });
		}
		b.add(rbox(span + 0.32, 0.46, 0.42, 0.07, 3), m.cobalt, { p: [0, h + 0.2, 0] });
		b.add(extrude(roundedRect(2.3, 0.44, 0.14), 0.1, 0.026, 3, 10), c.cream, { p: [0, h + 0.2, 0.24] });
		this.group.add(b.build('copilot-arch'));
		const label = new Label('GitHub Copilot API', 0.19, { weight: 700 });
		label.mesh.position.set(-0.08, h + 0.196, 0.343);
		this.group.add(label.mesh);
		this.lamp = new Lamp(rbox(0.09, 0.09, 0.03, 0.03, 3), color.amber, 1);
		this.lamp.mesh.position.set(1.0, h + 0.196, 0.344);
		this.group.add(this.lamp.mesh);
		this.group.visible = false;
	}

	/** wanted: whether the reader picked Copilot; it springs up, or drops away. passed: 0..1 its lamp going green. */
	update(wanted: boolean, passed: number, dt: number) {
		this.shown += ((wanted ? 1 : 0) - this.shown) * (1 - Math.exp(-dt * 9));
		this.group.visible = this.shown > 0.01;
		this.group.scale.setScalar(Math.max(0.001, this.shown));
		this.lamp.mix(color.amber, color.green, passed, 1.8);
	}
}
