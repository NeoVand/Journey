import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { Label, Surface, font } from '../kit/print';
import { createSign, screw, ventZ } from '../kit/parts';
import { shadowOn } from '../kit/machines';
import { bell, outBack } from '../kit/math';
import type { TOKENS } from '../content';

export const TILE_D = 0.8;
export const TILE_H = 0.26;
export const STRIP_H = 0.024;

type TokenDef = (typeof TOKENS)[number];

function faceSurface(w: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void) {
	const H = 180;
	const W = Math.round((H * w) / TILE_D);
	const s = new Surface(W, H);
	s.draw(draw);
	return s;
}

function facePlane(w: number, surface: Surface) {
	const m = new THREE.Mesh(
		new THREE.PlaneGeometry(w - 0.04, TILE_D - 0.06),
		new THREE.MeshStandardMaterial({
			map: surface.texture,
			transparent: true,
			roughness: 0.4,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		})
	);
	m.renderOrder = 3;
	return m;
}

/**
 * One piece of the prompt. Starts life as a thin, uncut stretch of a paper strip; the cutter
 * turns it into a thick amber tile; a flip reveals the number on its other face.
 */
export class Tile {
	group = new THREE.Group();
	body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
	private top: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
	private bottom: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
	readonly width: number;
	private paper = new THREE.Color(color.paper);
	private amber = new THREE.Color(color.amber);
	private amberE = new THREE.Color('#ff9600');
	private cut = -1;

	constructor(public token: TokenDef) {
		this.width = token.width;
		if (token.special) {
			// Markers the chat template added: not your words, and blue from the moment they are printed.
			this.paper.set('#2f6ff0');
			this.amber.set(color.cobalt);
			this.amberE.set('#0d3fd6');
		}
		const material = (mats().amber as THREE.MeshPhysicalMaterial).clone();
		this.body = new THREE.Mesh(rbox(this.width, TILE_H, TILE_D, 0.055, 3), material);
		this.body.castShadow = true;
		this.body.receiveShadow = true;
		this.group.add(this.body);

		const pretty = token.text.trimStart();
		const leading = token.text.length !== pretty.length;
		const s = faceSurface(this.width, (c, W, H) => {
			c.textBaseline = 'middle';
			c.textAlign = 'center';
			c.font = `600 56px ${font.mono}`;
			const tw = c.measureText(pretty).width;
			c.fillStyle = token.special ? '#ffffff' : color.ink;
			const nudge = leading ? 18 : 0;
			c.fillText(pretty, W / 2 + nudge, H * 0.53);
			if (leading) {
				// The space belongs to the token. A small tray glyph marks it, as a type-setter would.
				const x = W / 2 + nudge - tw / 2 - H * 0.2;
				const y = H * 0.68;
				c.strokeStyle = 'rgba(17,26,46,.5)';
				c.lineWidth = H * 0.028;
				c.lineCap = 'round';
				c.beginPath();
				c.moveTo(x, y - H * 0.05);
				c.lineTo(x, y);
				c.lineTo(x + H * 0.13, y);
				c.lineTo(x + H * 0.13, y - H * 0.05);
				c.stroke();
			}
		});
		this.top = facePlane(this.width, s);
		this.top.rotation.x = -Math.PI / 2;
		this.top.position.y = TILE_H / 2 + 0.002;
		this.group.add(this.top);

		const idFace = faceSurface(this.width, (c, W, H) => {
			c.textBaseline = 'middle';
			c.textAlign = 'center';
			c.font = `700 56px ${font.mono}`;
			c.fillStyle = token.special ? '#ffffff' : color.ink;
			c.fillText(String(token.id), W / 2, H * 0.53);
		});
		this.bottom = facePlane(this.width, idFace);
		this.bottom.rotation.x = Math.PI / 2;
		this.bottom.position.y = -TILE_H / 2 - 0.002;
		this.group.add(this.bottom);
	}

	setClip(planes: THREE.Plane[]) {
		this.body.material.clippingPlanes = planes;
		this.top.material.clippingPlanes = planes;
		this.bottom.material.clippingPlanes = planes;
		// Whatever the plane hides must not cast a shadow either.
		this.body.material.clipShadows = true;
	}

	/** cut: 0 paper strip → 1 amber tile. flip: 0 text up → 1 number up. */
	update(cut: number, flip: number) {
		const k = Math.round(cut * 60) / 60;
		if (k !== this.cut) {
			this.cut = k;
			const m = this.body.material;
			m.color.copy(this.paper).lerp(this.amber, k);
			m.emissive.copy(this.amberE);
			m.emissiveIntensity = 0.4 * k;
			m.roughness = 0.75 - 0.49 * k;
			m.clearcoat = k;
		}
		const thick = THREE.MathUtils.lerp(STRIP_H / TILE_H, 1, outBack(Math.min(1, cut * 1.1), 2.2));
		this.body.scale.y = thick;
		const faceY = (TILE_H * thick) / 2 + 0.002;
		this.top.position.y = faceY;
		this.bottom.position.y = -faceY;
		this.group.rotation.x = Math.PI * flip;
	}
}

/** The conveyor the strip rides. Spans x0..x1 at its own y = 0 top surface. */
export function createBelt(x0: number, x1: number) {
	const m = mats();
	const b = new Batch();
	const len = x1 - x0;
	const cx = (x0 + x1) / 2;
	const W = 1.1;
	// Bed sits below the surface, so y = 0 here is exactly where tiles rest.
	b.add(rbox(len, 0.14, W + 0.22, 0.05, 3), m.creamLight, { p: [cx, -0.14, 0] });
	b.add(rbox(len + 0.02, 0.05, W, 0.02, 2), m.rubber, { p: [cx, -0.026, 0] });
	for (const s of [-1, 1]) {
		b.add(rbox(len, 0.07, 0.07, 0.03, 3), m.steel, { p: [cx, -0.005, s * (W / 2 + 0.07)] });
	}
	const legs = Math.round(len / 2.2);
	for (let i = 0; i <= legs; i++) {
		const x = x0 + 0.4 + ((len - 0.8) * i) / legs;
		b.add(rbox(0.5, 0.42, W - 0.1, 0.08, 3), m.steelSoft, { p: [x, -0.29, 0] });
	}
	return b.build('belt');
}

/**
 * Bridge over the belt carrying the cutter. Parked over the gateway's slot,
 * it walks down the strip and drops its stamp at every token boundary.
 */
/** How far behind the belt the gantry's column stands, and how far below the belt its foot is, both before its scale. */
export const GANTRY_REAR = -0.86;
export const GANTRY_FLOOR = -0.375;

export class Gantry {
	group = new THREE.Group();
	head = new THREE.Group();
	private lamp: Lamp;

	constructor() {
		const m = mats();
		const b = new Batch();
		const REAR = GANTRY_REAR;
		const H = 1.5;
		// One column behind the belt, running on a rail on the island, and an arm reaching over the belt.
		const floor = GANTRY_FLOOR;
		b.add(rbox(0.62, 0.12, 0.5, 0.04, 3), m.steelSoft, { p: [0, floor + 0.06, REAR] });
		b.add(rbox(0.3, H - floor, 0.24, 0.07, 3), m.steel, { p: [0, (H + floor) / 2, REAR] });
		b.add(rbox(0.42, 0.34, 1.5, 0.1, 4), m.cream, { p: [0, H + 0.02, REAR + 0.56] });
		for (const x of [-0.17, 0.17]) screw(b, x, H + 0.195, REAR + 0.2, 'y');
		this.group.add(b.build('gantry'));

		const hb = new Batch();
		hb.add(rbox(0.3, 0.42, 0.84, 0.07, 3), m.creamDeep, { p: [0, 0.27, 0] });
		hb.add(rbox(0.1, 0.13, 0.84, 0.02, 2), m.steel, { p: [0, 0, 0] });
		hb.add(rbox(0.035, 0.05, 0.82, 0.008, 1), m.recess, { p: [0, -0.08, 0] });
		for (const s of [-0.26, 0.26]) {
			hb.add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), m.steel, { p: [0, 0.78, s] });
		}
		this.head.add(hb.build('gantry-head'));
		this.head.position.y = 1.0;
		this.group.add(this.head);

		const sign = new Batch();
		sign.add(extrude(roundedRect(1.46, 0.42, 0.13), 0.1, 0.026, 3, 10), m.creamLight, { p: [0, H + 0.42, REAR] });
		sign.add(rbox(0.12, 0.2, 0.08, 0.03, 2), m.steel, { p: [0, H + 0.2, REAR] });
		this.group.add(sign.build('gantry-sign'));
		const front = new Label('Tokenizer', 0.21, { weight: 700 });
		front.mesh.position.set(-0.08, H + 0.416, REAR + 0.053);
		this.group.add(front.mesh);

		this.lamp = new Lamp(rbox(0.09, 0.09, 0.03, 0.03, 3), color.amber, 1.5);
		this.lamp.mesh.position.set(0.56, H + 0.416, REAR + 0.054);
		this.group.add(this.lamp.mesh);
	}

	/** drop: 0 raised, 1 stamp on the paper. */
	update(drop: number, active: boolean) {
		this.head.position.y = THREE.MathUtils.lerp(0.72, 0.13, drop);
		this.lamp.set(active ? color.green : color.amber, active ? 2 : 0.6);
	}
}

/**
 * The first safety check, standing over the path where it leaves the island. Small classifiers, not the model,
 * read every token on its way out. It comes down from above as the row sets off, legs either side of the path.
 */
export class SafetyArch {
	group = new THREE.Group();
	private body = new THREE.Group();
	private bar: Lamp;
	private sign: THREE.Group;
	private shadows: THREE.Object3D[] = [];

	/** faceCamera turns the sign back towards the reader, whichever way the path happens to run here. */
	constructor(faceCamera: number) {
		const m = mats();
		const b = new Batch();
		const Z = 0.92;
		const H = 1.06;
		const SIGN_Z = 0.55;
		for (const s of [-1, 1]) {
			b.add(rbox(0.5, 0.1, 0.5, 0.03, 2), m.steelSoft, { p: [0, 0.05, s * Z] });
			b.add(rbox(0.3, H, 0.3, 0.07, 3), m.cream, { p: [0, H / 2 + 0.06, s * Z] });
			this.shadows.push(shadowOn(this.group, 0, 0, s * Z, 0.5, 0.5, 0.3));
		}
		b.add(rbox(0.46, 0.34, Z * 2 + 0.46, 0.09, 4), m.cream, { p: [0, H + 0.22, 0] });
		b.add(rbox(0.02, 0.14, Z * 2 - 0.1, 0.008, 1), m.recess, { p: [0.232, H + 0.22, 0] });
		b.add(rbox(0.1, 0.24, 0.1, 0.02, 1), m.steelSoft, { p: [0, H + 0.5, -SIGN_Z] });
		this.body.add(b.build('safety-arch'));

		this.bar = new Lamp(rbox(0.02, 0.06, Z * 2 - 0.26, 0.008, 1), color.amber, 0.5);
		this.bar.mesh.position.set(0.244, H + 0.22, 0);
		this.body.add(this.bar.mesh);

		this.sign = createSign('Safety check', 0.19);
		this.sign.position.set(0, H + 0.82, -SIGN_Z);
		this.sign.rotation.y = faceCamera;
		this.body.add(this.sign);
		this.group.add(this.body);
	}

	/**
	 * fall: 0 still up in the sky, 1 landed. land: 0 to 1 over the squash and the small bounce that follow.
	 * named: its sign. seen: 0 before the first token gets here, 1 after. reading: 1 while tokens pass under it.
	 */
	update(fall: number, land: number, named: number, seen: number, reading: number, time: number) {
		this.group.visible = fall > 0;
		if (fall <= 0) return;
		const squash = bell(land, 0, 0.45) * 0.09;
		const bounce = bell(land, 0.35, 1) * 0.1;
		this.body.position.y = (1 - fall) * (1 - fall) * 6.5 + bounce;
		this.body.scale.set(1 + squash * 0.3, 1 - squash, 1 + squash * 0.3);
		// Its shadow gathers under it as it nears the ground.
		const near = Math.max(0.001, fall * fall * fall);
		this.shadows.forEach((s) => s.scale.setScalar(near));
		this.sign.visible = named > 0;
		if (named > 0) this.sign.scale.setScalar(Math.max(0.001, named));
		this.bar.mix(color.amber, color.green, seen, 0.5 + seen * 0.3 + reading * (1 + Math.sin(time * 11) * 0.4));
	}
}

/** Takes the decrypted request and lays it out as one long string, the strip that leaves its slot. */
export function createChatTemplate() {
	const m = mats();
	const b = new Batch();
	const W = 2.0;
	const H = 1.5;
	const D = 1.9;
	b.add(rbox(W + 0.24, 0.12, D + 0.24, 0.05, 3), m.steelSoft, { p: [0, 0.06, 0] });
	b.add(extrude(roundedRect(W, H, 0.14), D, 0.05, 4, 10), m.cream, { p: [0, 0.12 + H / 2, 0] });
	b.add(extrude(roundedRect(1.62, 0.44, 0.14), 0.07, 0.022, 3, 10), m.creamLight, { p: [0, 1.06, D / 2 + 0.03] });
	b.add(rbox(0.1, 0.3, 1.2, 0.05, 3), m.steel, { p: [W / 2 + 0.03, 0.5, 0] });
	b.add(rbox(0.11, 0.13, 0.98, 0.02, 2), m.recess, { p: [W / 2 + 0.04, 0.5, 0] });
	ventZ(b, 0, 0.5, D / 2 + 0.002, 1.2, 0.34, 4);
	const group = b.build('chat-template');
	const label = new Label('Chat template', 0.19, { weight: 700 });
	label.mesh.position.set(0, 1.056, D / 2 + 0.068);
	group.add(label.mesh);
	return group;
}
