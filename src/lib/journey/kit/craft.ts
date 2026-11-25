import * as THREE from 'three';
import { Batch } from './batch';
import { extrude, rbox, roundedRect } from './geometry';
import { mats } from './materials';

/*
 * The parts that make a machine look made rather than modelled: chrome bezels round its windows and glass in them,
 * fans that turn, heat sinks, copper heat pipes, coolant runs in clamps, guards on its corners, screws at its corners.
 * Every machine inside the cluster is built from the same set, so they read as one family, as the brain does.
 */

type V3 = [number, number, number];

let cache: ReturnType<typeof create> | undefined;

function create() {
	return {
		chrome: new THREE.MeshStandardMaterial({ color: '#eef2f7', metalness: 0.86, roughness: 0.2 }),
		/** Brushed and darker: the frames that carry things, so the bright chrome reads as trim. */
		gunmetal: new THREE.MeshStandardMaterial({ color: '#5d6678', metalness: 0.7, roughness: 0.38 }),
		glass: new THREE.MeshPhysicalMaterial({ color: '#d8ecff', transparent: true, opacity: 0.16, roughness: 0.04, clearcoat: 1, depthWrite: false }),
		copper: new THREE.MeshStandardMaterial({ color: '#e8915a', metalness: 0.82, roughness: 0.28 }),
		coolant: new THREE.MeshPhysicalMaterial({ color: '#5fb4ff', roughness: 0.12, clearcoat: 1, emissive: '#1f6fff', emissiveIntensity: 0.45 }),
		fan: new THREE.MeshStandardMaterial({ color: '#202a3e', metalness: 0.3, roughness: 0.5 }),
		board: new THREE.MeshStandardMaterial({ map: circuit(), roughness: 0.55, metalness: 0.15 })
	};
}

/** The finishes only crafted parts use. */
export function craft() {
	return (cache ??= create());
}

/** A circuit board's face: deep navy, gold traces and pads, tiled. */
function circuit() {
	const c = document.createElement('canvas');
	c.width = c.height = 256;
	const g = c.getContext('2d')!;
	g.fillStyle = '#0e1a33';
	g.fillRect(0, 0, 256, 256);
	let seed = 5;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	g.lineCap = 'round';
	for (let i = 0; i < 46; i++) {
		g.strokeStyle = rand() > 0.3 ? 'rgba(214,170,82,0.55)' : 'rgba(120,170,255,0.35)';
		g.lineWidth = rand() > 0.7 ? 3 : 1.6;
		let x = Math.floor(rand() * 16) * 16 + 8;
		let y = Math.floor(rand() * 16) * 16 + 8;
		g.beginPath();
		g.moveTo(x, y);
		for (let k = 0; k < 3; k++) {
			if (rand() > 0.5) x += (rand() > 0.5 ? 1 : -1) * 16 * (1 + Math.floor(rand() * 4));
			else y += (rand() > 0.5 ? 1 : -1) * 16 * (1 + Math.floor(rand() * 4));
			g.lineTo(x, y);
		}
		g.stroke();
		g.fillStyle = 'rgba(232,190,100,0.75)';
		g.beginPath();
		g.arc(x, y, 3, 0, Math.PI * 2);
		g.fill();
	}
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** A frame round an opening on a face that looks along +Z: rounded, as thick as `t`, standing `depth` proud. */
export function bezel(b: Batch, w: number, h: number, at: V3, { t = 0.12, r = 0.14, depth = 0.08, mat = craft().chrome } = {}) {
	const s = roundedRect(w + t * 2, h + t * 2, r + t);
	const hole = roundedRect(w, h, r);
	s.holes.push(new THREE.Path(hole.getPoints(24)));
	b.add(extrude(s, depth, Math.min(0.025, depth / 3), 2, 16), mat, { p: [at[0], at[1], at[2] + depth / 2] });
}

/** A pane of glass over an opening, on a face that looks along +Z. Kept apart from the batch: it draws after. */
export function pane(w: number, h: number, at: V3, r = 0.14) {
	const mesh = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(w, h, r), 8), craft().glass);
	mesh.position.set(...at);
	mesh.renderOrder = 3;
	return mesh;
}

/**
 * A fan in a round housing, looking along +Y (lying on a top face): its ring, a grille over it, and the rotor under
 * the grille, which the caller turns. at is the centre of its top.
 */
export function fan(b: Batch, r: number, at: V3) {
	const c = craft();
	const [x, y, z] = at;
	b.add(new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.14, 40, 1, true), c.chrome, { p: [x, y - 0.07, z] });
	b.add(new THREE.TorusGeometry(r + 0.06, 0.035, 8, 40), c.chrome, { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
	b.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.02, 40), c.fan, { p: [x, y - 0.13, z] });
	// The grille: two rings and four spokes, over the blades.
	for (const k of [0.45, 0.8]) b.add(new THREE.TorusGeometry(r * k, 0.014, 6, 32), c.chrome, { p: [x, y + 0.005, z], r: [Math.PI / 2, 0, 0] });
	for (let i = 0; i < 4; i++) b.add(rbox(r * 2, 0.02, 0.025, 0.008, 1), c.chrome, { p: [x, y + 0.005, z], r: [0, (i * Math.PI) / 4, 0] });
	const rotor = new THREE.Group();
	rotor.position.set(x, y - 0.06, z);
	const rb = new Batch();
	rb.add(new THREE.CylinderGeometry(r * 0.24, r * 0.24, 0.06, 20), c.chrome);
	for (let i = 0; i < 7; i++) rb.add(rbox(r * 0.82, 0.012, r * 0.3, 0.006, 1), c.fan, { p: [Math.cos((i / 7) * Math.PI * 2) * r * 0.55, 0, Math.sin((i / 7) * Math.PI * 2) * r * 0.55], r: [0.4, -(i / 7) * Math.PI * 2, 0] });
	rotor.add(rb.build('fan-rotor'));
	return rotor;
}

/** A heat sink lying on a top face: a base plate and fins along x, as tall as h. at is the centre of its foot. */
export function fins(b: Batch, w: number, d: number, h: number, n: number, at: V3, mat: THREE.Material = craft().chrome) {
	const [x, y, z] = at;
	b.add(rbox(w, 0.06, d, 0.02, 1), craft().gunmetal, { p: [x, y + 0.03, z] });
	const fin = rbox(0.035, h, d - 0.04, 0.012, 1);
	for (let i = 0; i < n; i++) b.add(fin, mat, { p: [x - w / 2 + (w * (i + 0.5)) / n, y + 0.06 + h / 2, z] });
}

/** Chrome guards down the two front corners of a body w wide whose front face is at z, from y0 to y1. */
export function guards(b: Batch, w: number, z: number, y0: number, y1: number, r = 0.07) {
	const c = craft();
	const h = y1 - y0;
	for (const s of [-1, 1]) {
		b.add(new THREE.CylinderGeometry(r, r, h, 16), c.chrome, { p: [s * (w / 2), y0 + h / 2, z] });
		for (const y of [y0, y1]) b.add(new THREE.SphereGeometry(r * 1.05, 14, 8), c.chrome, { p: [s * (w / 2), y, z] });
	}
}

/** Screw heads at the four corners of a rectangle on a face that looks along +Z. */
export function screws(b: Batch, w: number, h: number, at: V3) {
	const g = new THREE.CylinderGeometry(0.035, 0.04, 0.02, 12).rotateX(Math.PI / 2);
	for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.add(g, craft().chrome, { p: [at[0] + (sx * w) / 2, at[1] + (sy * h) / 2, at[2] + 0.01] });
}

/** A run of pipe along points, and a clamp round it every `every` of its length. */
export function pipe(b: Batch, points: V3[], r: number, mat: THREE.Material, every = 0.9) {
	const curve = new THREE.CatmullRomCurve3(
		points.map((p) => new THREE.Vector3(...p)),
		false,
		'catmullrom',
		0.2
	);
	const len = curve.getLength();
	b.add(new THREE.TubeGeometry(curve, Math.max(12, Math.ceil(len / 0.12)), r, 10), mat);
	const n = Math.floor(len / every);
	const clamp = new THREE.TorusGeometry(r + 0.012, 0.018, 6, 16);
	const q = new THREE.Quaternion();
	const e = new THREE.Euler();
	for (let i = 1; i < n; i++) {
		const u = i / n;
		const p = curve.getPointAt(u);
		q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(u));
		e.setFromQuaternion(q);
		b.add(clamp, craft().chrome, { p: [p.x, p.y, p.z], r: [e.x, e.y, e.z] });
	}
	return curve;
}

/** A plate on a face that looks along +Z, in a chrome bezel: where a machine's name or a reading goes. */
export function plate(b: Batch, w: number, h: number, at: V3, mat: THREE.Material = mats().creamLight) {
	b.add(extrude(roundedRect(w + 0.08, h + 0.08, Math.min(w, h) * 0.22 + 0.04), 0.04, 0.012, 2, 10), craft().chrome, { p: [at[0], at[1], at[2] + 0.02] });
	b.add(extrude(roundedRect(w, h, Math.min(w, h) * 0.22), 0.03, 0.01, 2, 10), mat, { p: [at[0], at[1], at[2] + 0.05] });
	// The front of the plate, for whatever is printed on it.
	return at[2] + 0.067;
}

/** A louvred vent on a side face, looking along +X (side 1) or -X (side -1): a dark recess and slanted slats in a frame. */
export function louvre(b: Batch, side: 1 | -1, at: V3, h: number, d: number, n: number) {
	const [x, y, z] = at;
	const c = craft();
	b.add(rbox(0.03, h + 0.1, d + 0.1, 0.012, 1), mats().recess, { p: [x - side * 0.01, y, z] });
	const pitch = h / n;
	const slat = rbox(0.05, pitch * 0.55, d, 0.01, 1);
	for (let i = 0; i < n; i++) b.add(slat, c.chrome, { p: [x + side * 0.012, y - h / 2 + pitch * (i + 0.5), z], r: [0, 0, side * -0.35] });
	const frame = new THREE.Shape();
	frame.moveTo(-(d + 0.18) / 2, -(h + 0.18) / 2);
	frame.lineTo((d + 0.18) / 2, -(h + 0.18) / 2);
	frame.lineTo((d + 0.18) / 2, (h + 0.18) / 2);
	frame.lineTo(-(d + 0.18) / 2, (h + 0.18) / 2);
	frame.closePath();
	const hole = new THREE.Path();
	hole.moveTo(-(d + 0.04) / 2, -(h + 0.04) / 2);
	hole.lineTo((d + 0.04) / 2, -(h + 0.04) / 2);
	hole.lineTo((d + 0.04) / 2, (h + 0.04) / 2);
	hole.lineTo(-(d + 0.04) / 2, (h + 0.04) / 2);
	hole.closePath();
	frame.holes.push(hole);
	b.add(extrude(frame, 0.04, 0.01, 1, 2), c.chrome, { p: [x + side * 0.01, y, z], r: [0, side * (Math.PI / 2), 0] });
}

/** A chip's face: a grid of cores in a dark die, with a bright rim. Use it as both map and emissive map, so it lights up. */
export function cores(cols = 6, rows = 5, core = '#6fb6ff', base = '#0b1838') {
	const c = document.createElement('canvas');
	c.width = 192;
	c.height = 160;
	const g = c.getContext('2d')!;
	g.fillStyle = base;
	g.fillRect(0, 0, 192, 160);
	const pw = (192 - 20) / cols;
	const ph = (160 - 20) / rows;
	for (let r = 0; r < rows; r++)
		for (let k = 0; k < cols; k++) {
			g.fillStyle = core;
			g.globalAlpha = 0.55 + ((r * 7 + k * 3) % 5) * 0.09;
			g.fillRect(10 + k * pw + 3, 10 + r * ph + 3, pw - 6, ph - 6);
		}
	g.globalAlpha = 1;
	g.strokeStyle = 'rgba(200,225,255,0.85)';
	g.lineWidth = 4;
	g.strokeRect(4, 4, 184, 152);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/**
 * A hood: a loaf as wide as w (along x) and as deep as d, h tall, flat-fronted, its top front and back edges rounded by
 * r. Its foot is at y = 0, centred.
 */
export function loaf(w: number, d: number, h: number, r: number) {
	const s = new THREE.Shape();
	s.moveTo(-d / 2, 0);
	s.lineTo(d / 2, 0);
	s.lineTo(d / 2, h - r);
	s.quadraticCurveTo(d / 2, h, d / 2 - r, h);
	s.lineTo(-d / 2 + r, h);
	s.quadraticCurveTo(-d / 2, h, -d / 2, h - r);
	s.closePath();
	return extrude(s, w, 0.07, 3, 16).rotateY(Math.PI / 2);
}

/** Chrome beads along a loaf's two rounded top edges, where the light catches them. */
export function loafBeads(b: Batch, w: number, d: number, top: number, r: number, at: V3 = [0, 0, 0]) {
	const bead = r * (1 - Math.SQRT1_2);
	for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.03, 0.03, w - 0.12, 10).rotateZ(Math.PI / 2), craft().chrome, { p: [at[0], at[1] + top - bead, at[2] + s * (d / 2 - bead)] });
}
