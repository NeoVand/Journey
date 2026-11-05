import * as THREE from 'three';
import { Batch } from './batch';
import { chamferRect, extrude, paper, rbox, sweep } from './geometry';
import { color, Lamp, mats } from './materials';
import { contactShadow, Surface } from './print';
import { createSign, plinth, SIGN_PHONE, ventX } from './parts';
import { createIsland } from '../props/island';

export type Finish = 'cream' | 'cobalt' | 'enamel';

export interface MachineOptions {
	w: number;
	h: number;
	d: number;
	finish?: Finish;
	name?: string;
	signH?: number;
	vent?: boolean;
}

/** The silhouette every machine in the journey shares. Stands at y = 0, front faces +Z. */
export function machine({ w, h, d, finish = 'cream', name, signH = 0.26, vent = true }: MachineOptions) {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	plinth(b, w + 0.34, d + 0.34, 0.14);
	const skin = finish === 'cobalt' ? m.cobalt : finish === 'enamel' ? m.enamelCool : m.cream;
	b.add(extrude(chamferRect(w, h, Math.min(0.42, h * 0.12), 0.1), d, 0.085, 6, 10), skin, { p: [0, 0.14 + h / 2, 0] });
	if (vent && h > 1.6) ventX(b, w / 2 + 0.002, 0.14 + h * 0.46, 0, h * 0.5, d * 0.62, Math.round(h * 2.8));
	group.add(b.build('machine'));
	if (name) {
		// Kept inside the face: a short machine keeps its desktop-sized sign on a phone, and sits it clear of the plinth.
		const fit = 2 * signH * SIGN_PHONE > h - 0.3;
		const sign = createSign(name, signH, undefined, undefined, fit);
		const half = fit ? signH : signH * SIGN_PHONE;
		sign.position.set(0, Math.max(0.14 + h - Math.max(0.5, signH * 2), 0.14 + half + 0.08), d / 2 + 0.03);
		group.add(sign);
	}
	return group;
}

interface BlockOptions {
	/** Along the belt, along the arch, and height. */
	w: number;
	d: number;
	h: number;
	/** Where the arch runs, as an offset in z from the block's centre, and how big it is. */
	archZ: number;
	archD: number;
	archH: number;
	/** Close the left end instead of plugging the middle, so things can only come out of the right. */
	closedLeft?: boolean;
}

/**
 * A block a belt really runs into. The arch is cut out of one solid profile and lined in dark, so its mouth has depth.
 * Its base sits at y = 0 and its belt runs along x.
 */
export function archBlock({ w, d, h, archZ, archD, archH, closedLeft = false }: BlockOptions) {
	const m = mats();
	const r = 0.16;
	const a = -archZ - archD / 2;
	const b = -archZ + archD / 2;
	// Drawn in (-z, y), so that extruding along local z and turning a quarter lays it along x.
	const s = new THREE.Shape();
	s.moveTo(-d / 2, 0);
	s.lineTo(a, 0);
	s.lineTo(a, archH);
	s.lineTo(b, archH);
	s.lineTo(b, 0);
	s.lineTo(d / 2, 0);
	s.lineTo(d / 2, h - r);
	s.quadraticCurveTo(d / 2, h, d / 2 - r, h);
	s.lineTo(-d / 2 + r, h);
	s.quadraticCurveTo(-d / 2, h, -d / 2, h - r);
	s.closePath();
	const batch = new Batch();
	batch.add(extrude(s, w, 0.05, 4, 8), m.cream, { r: [0, Math.PI / 2, 0] });
	// The lining: everything you can see once you look into the mouth.
	const t = 0.02;
	const inner = w - 0.12;
	batch.add(new THREE.BoxGeometry(inner, t, archD), m.recess, { p: [0, archH - t / 2, archZ] });
	for (const sz of [-1, 1]) batch.add(new THREE.BoxGeometry(inner, archH, t), m.recess, { p: [0, archH / 2, archZ + (sz * (archD - t)) / 2] });
	if (closedLeft) {
		batch.add(rbox(0.14, archH + 0.04, archD + 0.04, 0.03, 2), m.cream, { p: [-w / 2 + 0.07, (archH + 0.04) / 2, archZ] });
		batch.add(new THREE.BoxGeometry(t, archH, archD), m.recess, { p: [-w / 2 + 0.15, archH / 2, archZ] });
	} else {
		batch.add(new THREE.BoxGeometry(0.04, archH, archD), m.recess, { p: [0, archH / 2, archZ] });
	}
	return batch.build('arch-block');
}

/** A floating porcelain island centred on its own origin, with its top at y = 0. */
export function islandAt(w: number, d: number, thickness = 0.6) {
	const n = 12;
	const pts: [number, number][] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const c = Math.cos(a);
		const s = Math.sin(a);
		// A superellipse: flat enough to build on, soft enough to read as the same islands as before.
		pts.push([Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (w / 2), Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (d / 2)]);
	}
	return createIsland(pts, thickness);
}

/** A sheet of paper with something printed on it. Faces +Z, centred. */
export class Card {
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	surface: Surface;

	constructor(
		public w: number,
		public h: number,
		density = 330,
		curl = 0.03
	) {
		this.surface = new Surface(Math.round(w * density), Math.round(h * density));
		this.mesh = new THREE.Mesh(
			paper(w, h, curl, 0.012),
			new THREE.MeshStandardMaterial({ map: this.surface.texture, roughness: 0.76, side: THREE.DoubleSide })
		);
		this.mesh.castShadow = true;
	}

	draw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
		this.surface.draw((c, w, h) => {
			c.fillStyle = color.paper;
			c.fillRect(0, 0, w, h);
			fn(c, w, h);
		});
	}
}

/** A flat printed panel, for screens and face plates. */
export function panel(w: number, h: number, surface: Surface, emissive = 0) {
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(w, h),
		emissive
			? new THREE.MeshBasicMaterial({ map: surface.texture })
			: new THREE.MeshStandardMaterial({ map: surface.texture, roughness: 0.6, transparent: true, depthWrite: false })
	);
	mesh.renderOrder = 2;
	return mesh;
}

export function curve(points: [number, number, number][]) {
	const c = new THREE.CatmullRomCurve3(
		points.map((p) => new THREE.Vector3(...p)),
		false,
		'centripetal'
	);
	c.arcLengthDivisions = 400;
	return c;
}

export function tube(path: THREE.Curve<THREE.Vector3>, radius: number, material: THREE.Material, segments = 90) {
	const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segments, radius, 14), material);
	mesh.castShadow = true;
	return mesh;
}

export function shadowOn(parent: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, opacity = 0.42) {
	const s = contactShadow(w, d, 0.16, opacity);
	s.position.set(x, y + 0.006, z);
	parent.add(s);
	return s;
}

let hazardTex: THREE.CanvasTexture | undefined;
/** Yellow and black, for anything that controls whether work may proceed. */
export function hazard(repeat = 2) {
	if (!hazardTex) {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 128;
		const c = canvas.getContext('2d')!;
		c.fillStyle = '#ffc21f';
		c.fillRect(0, 0, 128, 128);
		c.fillStyle = '#1b2233';
		for (let i = -128; i < 256; i += 64) {
			c.beginPath();
			c.moveTo(i, 128);
			c.lineTo(i + 32, 128);
			c.lineTo(i + 160, 0);
			c.lineTo(i + 128, 0);
			c.closePath();
			c.fill();
		}
		hazardTex = new THREE.CanvasTexture(canvas);
		hazardTex.colorSpace = THREE.SRGBColorSpace;
		hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
		hazardTex.anisotropy = 8;
	}
	const t = hazardTex.clone();
	t.repeat.set(repeat, 1);
	t.needsUpdate = true;
	return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
}

/** Candy stripes, for barrier arms. */
export function stripes(a = '#f0473c', b = '#fbfaf5', repeat = 4) {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 32;
	const c = canvas.getContext('2d')!;
	c.fillStyle = b;
	c.fillRect(0, 0, 128, 32);
	c.fillStyle = a;
	c.beginPath();
	c.moveTo(0, 32);
	c.lineTo(32, 0);
	c.lineTo(96, 0);
	c.lineTo(64, 32);
	c.closePath();
	c.fill();
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = THREE.RepeatWrapping;
	t.repeat.set(repeat, 1);
	return new THREE.MeshStandardMaterial({ map: t, roughness: 0.42 });
}

export { Lamp };

/** A soft flat burst of light for moments of contact. */
export function arcPoint(a: THREE.Vector3, b: THREE.Vector3, lift: number, k: number, out: THREE.Vector3) {
	out.lerpVectors(a, b, k);
	out.y += Math.sin(k * Math.PI) * lift;
	return out;
}

export const unit = rbox(1, 1, 1, 0.08, 2);

/** The open orange channel tokens have ridden since the sky. Its floor sits `drop` below the curve. */
export function channel(path: THREE.Curve<THREE.Vector3>, drop: number, segments = 240) {
	const W = 0.5;
	const down = -drop - 0.015;
	const rail = 0.17;
	const profile: [number, number][] = [
		[-W, down + rail],
		[-W + 0.025, down + rail + 0.03],
		[-W + 0.06, down + rail],
		[-W + 0.07, down + 0.055],
		[-W + 0.11, down + 0.02],
		[W - 0.11, down + 0.02],
		[W - 0.07, down + 0.055],
		[W - 0.06, down + rail],
		[W - 0.025, down + rail + 0.03],
		[W, down + rail],
		[W - 0.03, down - 0.02],
		[W - 0.12, down - 0.055],
		[-W + 0.12, down - 0.055],
		[-W + 0.03, down - 0.02]
	];
	const material = (mats().orangeGlow as THREE.MeshPhysicalMaterial).clone();
	material.side = THREE.DoubleSide;
	const mesh = new THREE.Mesh(sweep(path, profile, segments), material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}
