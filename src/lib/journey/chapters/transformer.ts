import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { color, mats } from '../kit/materials';
import { arcPoint } from '../kit/machines';
import { canvasTexture, contactShadow, font, Label } from '../kit/print';
import { createSign } from '../kit/parts';
import { bell, hash, inOut, lerp, outBack, seg, smooth } from '../kit/math';
import { Tile, TILE_H } from '../props/tokenizer';
import { TOKENS } from '../content';
import { ORIGIN, RAIL_Y, RAIL_Z } from '../layout';
import type { Shot } from '../rig';

/*
 * The transformer, as what it does rather than how it is wired. Every word has a place on a map of
 * meaning, and each layer of the model is that same map. A token lands where its dictionary meaning
 * sits, looks back at the tokens before it, and moves. Layer after layer the sentence gathers, and the
 * threads are the paths the tokens took. Plates float like the islands in the sky, one is lit at a time,
 * and the rest sink back into the dark so the threads can be seen.
 */

export const PRE = 168;

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (x: number, y: number, z: number): [number, number, number] => [ORIGIN.x + PRE + x, ORIGIN.y + y, ORIGIN.z + z];
const TALL = box(0, 0.06, 1, 0.47);

export const MAP_W = 17;
export const MAP_D = 10.4;
const W = MAP_W;
const D = MAP_D;
const CZ = -1.6; // the map's centre, so its front edge stops short of the belt
const BASE = 2.2;
const GAP = 8.2;
const FLOORS = [BASE, BASE + GAP, BASE + 2 * GAP, BASE + 3 * GAP, BASE + 3 * GAP + 11];
const NAMES = ['Embedding', 'Layer 1', 'Layer 2', 'Layer 3', 'Layer 80'];
const TS = 1.6; // tiles are drawn larger on the map, because the words are the point
const ON = (TILE_H * TS) / 2 + 0.02; // a tile resting on a map
const PLATE = 0.34; // how thick each map is
const DRAW_IN = 1.1; // how far under a floor a climbing tile starts drawing into its thread
const FINS: [number, number] = [FLOORS[3] + 1.5, FLOORS[4] - 1.5];

/* ---------------------------------------------------------------- the map ---- */

interface Region {
	name: string;
	x: number;
	z: number;
	rx: number;
	rz: number;
	fill: string;
	words: [string, number, number][];
}

/** Illustrative, and the page says so: a real embedding has thousands of dimensions. */
const REGIONS: Region[] = [
	{ name: 'Concurrent code', x: 0.7, z: 0, rx: 3.8, rz: 2, fill: '#8fe3bd', words: [['thread', -2, -0.5], ['mutex', -0.1, -0.7], ['worker', -2.1, 0.6], ['deadlock', 0.2, 1.3], ['queue', 1.9, 0.6], ['lock', 2.7, 1.1]] },
	{ name: 'Sports', x: -6, z: -3.1, rx: 2.3, rz: 1.95, fill: '#bfe3a0', words: [['sprint', -7.4, -2.4], ['marathon', -4.6, -2.5], ['lap', -7.2, -4.3]] },
	{ name: 'Health', x: -1.2, z: -3.75, rx: 2.3, rz: 1.35, fill: '#f6c0c0', words: [['illness', -2.9, -3.3], ['symptom', 0.5, -3.3]] },
	{ name: 'Careers', x: 4.8, z: -3.75, rx: 2.5, rz: 1.35, fill: '#f7d694', words: [['salary', 3.1, -3.4], ['hiring', 6.5, -3.4]] },
	{ name: 'Calendars', x: 6.6, z: 1.7, rx: 1.9, rz: 2, fill: '#cfc6f5', words: [['agenda', 6.6, 2.4], ['meeting', 6.5, 0]] },
	{ name: 'Repairs', x: -6.8, z: 0.9, rx: 1.65, rz: 1.5, fill: '#b7d6f2', words: [] },
	{ name: 'Small words', x: -3.3, z: 3.7, rx: 3.3, rz: 1.5, fill: '#dfe2e8', words: [] },
	{ name: 'Chat markers', x: 2.8, z: 3.75, rx: 2.5, rz: 1.4, fill: '#b9cdf7', words: [] }
];

let mapCanvas: HTMLCanvasElement | undefined;
let mapTexture: THREE.CanvasTexture | undefined;
let plainTexture: THREE.CanvasTexture | undefined;
let mapPixels: Uint8ClampedArray | undefined;

function paintMap() {
	const TW = 2048;
	const TH = Math.round((TW * D) / W);
	const canvas = document.createElement('canvas');
	canvas.width = TW;
	canvas.height = TH;
	const c = canvas.getContext('2d', { willReadFrequently: true })!;
	const px = (x: number) => ((x + W / 2) / W) * TW;
	const py = (z: number) => ((z + D / 2) / D) * TH;
	const u = TW / W;
	c.fillStyle = '#f8f5ee';
	c.fillRect(0, 0, TW, TH);
	const blob = (r: Region, grow: number) => {
		c.beginPath();
		for (let i = 0; i <= 96; i++) {
			const a = (i / 96) * Math.PI * 2;
			const ca = Math.cos(a);
			const sa = Math.sin(a);
			const x = r.x + Math.sign(ca) * Math.pow(Math.abs(ca), 0.72) * (r.rx + grow);
			const z = r.z + Math.sign(sa) * Math.pow(Math.abs(sa), 0.72) * (r.rz + grow);
			if (i) c.lineTo(px(x), py(z));
			else c.moveTo(px(x), py(z));
		}
		c.closePath();
	};
	// Contours first, so the map reads as a landscape with neighbourhoods, not a diagram with boxes.
	REGIONS.forEach((r) => {
		c.strokeStyle = 'rgba(70,90,130,.1)';
		c.lineWidth = 2;
		[0.36, 0.2].forEach((g) => {
			blob(r, g);
			c.stroke();
		});
		c.fillStyle = r.fill;
		blob(r, 0);
		c.fill();
	});
	mapPixels = c.getImageData(0, 0, TW, TH).data;
	const plain = document.createElement('canvas');
	plain.width = TW;
	plain.height = TH;
	plain.getContext('2d')!.drawImage(canvas, 0, 0);
	plainTexture = canvasTexture(plain);
	REGIONS.forEach((r, n) => {
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillStyle = 'rgba(17,26,46,.5)';
		c.font = `500 ${0.2 * u}px ${font.mono}`;
		r.words.forEach(([w, x, z]) => c.fillText(w, px(x + (n === 0 ? r.x : 0)), py(z)));
		c.fillStyle = '#16233f';
		c.font = `800 ${(n === 0 ? 0.56 : 0.44) * u}px ${font.display}`;
		c.fillText(r.name, px(r.x), py(n === 0 ? r.z - r.rz + 0.56 : r.z + r.rz - 0.48));
	});
	mapCanvas = canvas;
	mapTexture = canvasTexture(canvas);
}

/** One printed map, shared by every layer: same words, same places. */
export function meaningMap(labelled = true) {
	if (!mapTexture) paintMap();
	return labelled ? mapTexture! : plainTexture!;
}

function mapColorAt(x: number, z: number, out: THREE.Color) {
	if (!mapPixels) paintMap();
	const TW = mapCanvas!.width;
	const TH = mapCanvas!.height;
	const i = Math.floor(((z + D / 2) / D) * (TH - 1)) * TW + Math.floor(((x + W / 2) / W) * (TW - 1));
	const p = mapPixels!;
	return out.setRGB(p[i * 4] / 255, p[i * 4 + 1] / 255, p[i * 4 + 2] / 255, THREE.SRGBColorSpace);
}

const DAY_BODY = new THREE.Color('#f3f6fb');
const NIGHT_BODY = new THREE.Color('#0d1a3e');
const DAY_PRINT = new THREE.Color('#ffffff');
const NIGHT_PRINT = new THREE.Color('#17244f');

/**
 * One layer: a floating slab of the same porcelain as the islands, with the map printed on top. There is
 * no frame and nothing holding it up. Lit, it is a bright place to read. Unlit, it goes dark rather than
 * see-through, because a darkened object sits back in the scene and a faded one turns to fog.
 */
export class MapPlate {
	group = new THREE.Group();
	private body: THREE.MeshPhysicalMaterial;
	private print: THREE.MeshStandardMaterial;
	private lit = -1;

	constructor(w: number, d: number, thick = 0.34, labelled = true) {
		const m = mats();
		const radius = Math.min(w, d) * 0.1;
		const bevel = Math.min(0.11, thick * 0.34);
		const shell = extrude(roundedRect(w, d, radius), thick, bevel, 5, 18);
		shell.rotateX(-Math.PI / 2);
		shell.translate(0, -thick / 2, 0);
		this.body = (m.porcelain as THREE.MeshPhysicalMaterial).clone();
		this.group.add(new THREE.Mesh(shell, this.body));

		const inset = bevel + 0.02;
		const top = new THREE.ShapeGeometry(roundedRect(w - inset * 2, d - inset * 2, radius - inset), 18);
		const pos = top.attributes.position as THREE.BufferAttribute;
		const uv = top.attributes.uv as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d);
		top.rotateX(-Math.PI / 2);
		this.print = new THREE.MeshStandardMaterial({
			map: meaningMap(labelled),
			emissive: '#ffffff',
			emissiveMap: meaningMap(labelled),
			roughness: 0.8,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		});
		const sheet = new THREE.Mesh(top, this.print);
		sheet.position.y = 0.004;
		this.group.add(sheet);
		this.setLit(0);
	}

	setLit(k: number) {
		if (k === this.lit) return;
		this.lit = k;
		this.body.color.copy(NIGHT_BODY).lerp(DAY_BODY, k);
		this.print.color.copy(NIGHT_PRINT).lerp(DAY_PRINT, k);
		this.print.emissiveIntensity = lerp(0.012, 0.3, k);
		// Polish is what turns a dark plate grey, so it goes with the light.
		this.body.clearcoat = lerp(0.08, 0.7, k);
		this.body.envMapIntensity = lerp(0.22, 1, k);
		this.print.envMapIntensity = lerp(0.1, 1, k);
	}
}

/** A row of little lights along a plate's front edge: one key and one value per token. This is the KV cache. */
export class KvRow {
	group = new THREE.Group();
	private k: THREE.InstancedMesh;
	private v: THREE.InstancedMesh;
	private d = new THREE.Object3D();

	constructor(
		private pairs: number,
		private x0: number,
		private x1: number,
		private size = 0.2
	) {
		const m = mats();
		const geo = rbox(size, size * 0.62, 0.05, 0.02, 2);
		const cyan = new THREE.MeshPhysicalMaterial({ color: '#3fd2dc', roughness: 0.3, clearcoat: 0.9, emissive: '#129aa6', emissiveIntensity: 0.9 });
		const green = (m.hbm as THREE.MeshPhysicalMaterial).clone();
		green.emissiveIntensity = 0.9;
		this.k = new THREE.InstancedMesh(geo, green, pairs);
		this.v = new THREE.InstancedMesh(geo, cyan, pairs);
		this.k.frustumCulled = this.v.frustumCulled = false;
		const slot = new THREE.Mesh(rbox(x1 - x0 + size * 3, size * 0.9, 0.02, 0.01, 1), m.recess);
		slot.position.x = (x0 + x1) / 2;
		this.group.add(slot, this.k, this.v);
	}

	/** shown(i): 0..1 how far pair i has come on. */
	set(shown: (i: number) => number) {
		const d = this.d;
		const pitch = (this.x1 - this.x0) / Math.max(1, this.pairs - 1);
		for (let i = 0; i < this.pairs; i++) {
			const s = Math.max(0.0001, shown(i));
			d.scale.setScalar(s);
			const x = this.x0 + pitch * i;
			d.position.set(x - this.size * 0.56, 0, 0.02);
			d.updateMatrix();
			this.k.setMatrixAt(i, d.matrix);
			d.position.set(x + this.size * 0.56, 0, 0.02);
			d.updateMatrix();
			this.v.setMatrixAt(i, d.matrix);
		}
		this.k.instanceMatrix.needsUpdate = true;
		this.v.instanceMatrix.needsUpdate = true;
	}
}

/* ------------------------------------------------------------ the journey ---- */

type XZ = [number, number];
const n = TOKENS.length;
const JOB = 7;
const LAST = n - 1;

/**
 * Where each token is on the map: in the dictionary, with its position mixed in, arriving on layer 1,
 * after layer 1, 2, 3 and 80. Arriving is not quite where it left, so no thread rises dead straight.
 */
export const TOKEN_PATHS: XZ[][] = [
	[[2.2, 3.5], [-7.4, 0.4], [-3.9, 3.35], [-6.7, -3.6], [-0.6, -4.05], [-1.3, 3.5], [-3.9, 3.35], [5.4, -4.05], [6.9, 1.2], [-5.6, 3.5], [4.3, 3.5]],
	[[2.2, 3.5], [-7.4, 0.4], [-3.9, 3.35], [-6.7, -3.6], [-0.6, -4.05], [-1.3, 3.5], [-2.6, 3.45], [5.4, -4.05], [6.9, 1.2], [-5.6, 3.5], [4.3, 3.5]],
	[[1.4, 3.4], [-6.5, 0.2], [-4, 3.1], [-5.7, -3.2], [-1.6, -3.95], [-1, 3.4], [-2.7, 3.5], [4.4, -3.95], [6.1, 0.95], [-5.3, 3.4], [3.7, 3.4]],
	[[1.4, 3.4], [-5.7, 0.4], [-4, 2.8], [-5.1, -2.8], [-0.6, -3], [-1.5, 3], [-2.7, 3.1], [3.3, -1.1], [5.6, 0.9], [-5.3, 3.2], [3.6, 3]],
	[[1.4, 3.4], [-4.7, 0.5], [-3.7, 2.6], [-4.4, -2.2], [-0.2, -1.9], [-1.3, 2.8], [-2.5, 2.8], [3, -0.9], [4.8, 0.8], [-4.9, 3], [3, 2.6]],
	[[1.4, 3.4], [-3.9, 0.3], [-3.4, 2.3], [-3.7, -1.6], [0, -1.3], [-1, 2.4], [-2.2, 2.4], [2.7, -0.7], [4.1, 0.7], [0, 2.8], [2.4, 2.1]],
	[[1.4, 3.4], [-2.6, -0.35], [-2.9, 1.2], [-2.9, -1.7], [-0.2, -1.4], [-0.2, 1.5], [-1.5, 1.4], [2.1, -1.2], [3.2, 0.2], [1, 1.65], [2.3, 1.75]]
];
const P = TOKEN_PATHS;

/** What "job" takes from each earlier token, as shares of 100. Illustrative, and the page says so. */
const SHARES = [0.02, 0.11, 0.01, 0.32, 0.46, 0.05, 0.03];

type Span = [number, number];
const BELT: Span = [14.03, 14.12];
const HOPS: Span = [14.165, 14.245];
const POSITION: Span = [14.25, 14.268];
const RISE: Span = [14.278, 14.318];
const Q_ON: Span = [14.33, 14.342];
const KV_ON: Span = [14.342, 14.358];
const COMPARE: Span = [14.362, 14.396];
const WEIGH: Span = [14.402, 14.424];
const MIX: Span = [14.432, 14.49];
const JOB_SLIDE: Span = [14.495, 14.53];
const OTHERS_SLIDE: Span = [14.562, 14.604];
const WEBS: Span[] = [
	[14.556, 14.612],
	[14.752, 14.778],
	[14.794, 14.82],
	[14.848, 14.872]
];
const NET_IN: Span = [14.628, 14.642];
const NET_RUN: Span = [14.644, 14.664];
const NET_VISIT: Span = [14.664, 14.686];
const NET_OUT: Span = [14.686, 14.697];
/** It works on "job" first, then visits every other token: the same network, one vector at a time. */
const NET_TOUR = [7, 8, 10, 0, 5, 6, 2, 9, 1, 3, 4];
const UP: Span[] = [
	[14.716, 14.754],
	[14.762, 14.796],
	[14.802, 14.85]
];
const SINK: Span = [14.868, 14.892];
const BARS: Span = [14.888, 14.946];
const PICKS: Span = [14.94, 14.976];

/** When each layer is the one being read. */
const LIT: [number, number, number, number, number][] = [
	[14.128, 14.158, 14.285, 14.318, 1],
	[14.292, 14.32, 14.698, 14.736, 1],
	[14.742, 14.756, 14.782, 14.798, 0.72],
	[14.784, 14.798, 14.824, 14.84, 0.72],
	[14.838, 14.872, 16, 17, 1]
];

const MAP_SHOT = { el: 31, radius: 9.3, ry: 5.2, wide: box(0.41, 0.07, 0.59, 0.84), tall: TALL };
const S_TOWER: Omit<Shot, 'T'> = { az: 32, el: 8, target: at(0, 19.6, CZ), radius: 12.5, ry: 20, wide: box(0.42, 0.1, 0.58, 0.87), tall: TALL };
const S_FLOOR0: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 9, el: 33, target: at(0, FLOORS[0] + 0.1, CZ + 1.2), ry: 5.6 };
const S_FLOOR1: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 5, target: at(0, FLOORS[1] + 0.5, CZ) };
const S_NET: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 8, el: 26, target: at(0, FLOORS[1] + 1.1, CZ), ry: 5.3 };
const S_TOP: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 11, el: 36, target: at(0, FLOORS[4] + 0.9, CZ), ry: 5, wide: box(0.41, 0.1, 0.59, 0.8) };

export const TRANSFORMER_SHOTS: Shot[] = [
	{ T: 13.99, ...S_TOWER, az: 40 },
	{ T: 14.125, ...S_TOWER, az: 27 },
	{ T: 14.168, ...S_FLOOR0 },
	{ T: 14.272, ...S_FLOOR0, az: 6 },
	{ T: 14.32, ...S_FLOOR1 },
	{ T: 14.62, ...S_FLOOR1, az: 2 },
	{ T: 14.645, ...S_NET },
	{ T: 14.694, ...S_NET, az: 5 },
	{ T: 14.738, ...S_TOWER, az: 34 },
	{ T: 14.856, ...S_TOWER, az: 24 },
	{ T: 14.892, ...S_TOP },
	{ T: 14.99, ...S_TOP, az: 8 }
];

/** A token's path up the stack, walked by arc length. It lies on each map and rises between them. */
class Track extends THREE.Curve<THREE.Vector3> {
	private pts: THREE.Vector3[] = [];
	private at: number[] = [0];
	stops: number[] = [];
	total = 0;

	constructor() {
		super();
	}

	add(p: THREE.Vector3) {
		const last = this.pts[this.pts.length - 1];
		if (last) {
			const d = last.distanceTo(p);
			if (d < 1e-5) return;
			this.total += d;
			this.at.push(this.total);
		}
		this.pts.push(p.clone());
	}

	stop() {
		this.stops.push(this.total);
	}

	getPoint(t: number, target = new THREE.Vector3()) {
		const s = THREE.MathUtils.clamp(t, 0, 1) * this.total;
		let lo = 0;
		let hi = this.at.length - 1;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (this.at[mid] <= s) lo = mid;
			else hi = mid;
		}
		const span = this.at[hi] - this.at[lo] || 1;
		return target.lerpVectors(this.pts[lo], this.pts[hi], (s - this.at[lo]) / span);
	}

	getPointAt(u: number, target?: THREE.Vector3) {
		return this.getPoint(u, target);
	}

	getUtoTmapping(u: number) {
		return u;
	}
}

function buildTrack(i: number, forThread = false) {
	const t = new Track();
	const v = (xz: XZ, y: number) => new THREE.Vector3(xz[0], y + 0.03, CZ + xz[1]);
	const rise = (from: THREE.Vector3, to: THREE.Vector3) => {
		const h = (to.y - from.y) * 0.5;
		const q = new THREE.CubicBezierCurve3(from, from.clone().setY(from.y + h), to.clone().setY(to.y - h), to);
		for (let j = 1; j <= 40; j++) t.add(q.getPoint(j / 40));
		t.stop();
	};
	if (!forThread) {
		t.add(v(P[0][i], FLOORS[0]));
		t.stop();
	}
	t.add(v(P[1][i], FLOORS[0])); // the position signal, on the embedding's own map
	t.stop();
	rise(v(P[1][i], FLOORS[0]), v(P[2][i], FLOORS[1]));
	t.add(v(P[3][i], FLOORS[1])); // what attention did to it, drawn on the map
	t.stop();
	for (let k = 4; k < P.length; k++) rise(v(P[k - 1][i], FLOORS[k - 3]), v(P[k][i], FLOORS[k - 2]));
	return t;
}

/**
 * A token cannot pass through a floor. As it climbs it draws into its own thread, slips through where the thread goes,
 * and swells back out on the other side. 1 is a whole tile, 0 is just thread.
 */
function wholeness(y: number) {
	const k = (v: number) => smooth(Math.min(1, Math.max(0, v)));
	let whole = 1;
	for (let f = 1; f < FLOORS.length; f++) {
		const top = FLOORS[f];
		whole = Math.min(whole, y < top ? k((top - PLATE - y) / DRAW_IN) : k((y - top) / ON));
	}
	if (y < FINS[0]) whole = Math.min(whole, k((FINS[0] - y) / DRAW_IN));
	else if (y > FINS[1]) whole = Math.min(whole, k((y - FINS[1]) / DRAW_IN));
	else whole = 0;
	return whole;
}

/** One line from "job" back to an earlier token, as thick as its share. */
class Tether {
	mesh: THREE.Mesh;
	path: THREE.QuadraticBezierCurve3;
	bead: THREE.Mesh;
	private rows = 60;
	constructor(from: THREE.Vector3, to: THREE.Vector3, share: number, material: THREE.Material, beadMat: THREE.Material) {
		const ctrl = from.clone().lerp(to, 0.5);
		ctrl.y += 1.1 + from.distanceTo(to) * 0.2;
		this.path = new THREE.QuadraticBezierCurve3(from, ctrl, to);
		this.mesh = new THREE.Mesh(new THREE.TubeGeometry(this.path, this.rows, 0.02 + share * 0.17, 8), material);
		this.mesh.visible = false;
		this.mesh.frustumCulled = false;
		this.bead = new THREE.Mesh(rbox(1, 1, 1, 0.14, 2), beadMat);
		this.bead.visible = false;
	}

	/** Reaches out from "job" over `on`, then lets go from its own end over `off`. */
	show(on: number, off: number) {
		this.mesh.visible = on > 0 && off < 1;
		if (!this.mesh.visible) return;
		const perRow = 8 * 6;
		const first = Math.floor(off * this.rows) * perRow;
		const last = Math.floor(on * this.rows) * perRow;
		this.mesh.geometry.setDrawRange(first, Math.max(0, last - first));
	}
}

/* ---- a fully connected network, drawn in the same thread as everything else ---- */
const NET = [4, 8, 4];
const netX = (l: number, i: number) => (i - (NET[l] - 1) / 2) * (l === 1 ? 0.44 : 0.74);
const netY = (l: number) => 0.85 + l * 1.05;

function netLines(l: number, radius: number) {
	const parts: THREE.BufferGeometry[] = [];
	for (let a = 0; a < NET[l]; a++) {
		for (let b = 0; b < NET[l + 1]; b++) {
			const line = new THREE.LineCurve3(new THREE.Vector3(netX(l, a), netY(l), 0), new THREE.Vector3(netX(l + 1, b), netY(l + 1), 0));
			parts.push(new THREE.TubeGeometry(line, 1, radius, 5));
		}
	}
	return mergeGeometries(parts)!;
}

interface Pick {
	text: string;
	score: number;
	x: number;
	z: number;
}
/** The same candidates as the logits board that comes next, placed on the map. */
const CANDIDATES: Pick[] = [
	{ text: 'The', score: 3.6, x: 0.5, z: 0.5 },
	{ text: 'I', score: 2.3, x: -0.5, z: 2.5 },
	{ text: 'Let', score: 1.9, x: 1, z: 3.5 },
	{ text: 'First', score: 1.4, x: 4.5, z: 3 },
	{ text: 'To', score: 1.05, x: 4.5, z: 1 },
	{ text: 'Sorry', score: 0.4, x: -6, z: 2 },
	{ text: 'Cat', score: 0.2, x: 6, z: -2.5 }
];

export class Transformer {
	group = new THREE.Group();

	private tiles = TOKENS.map((t) => new Tile(t));
	private rowX: number[] = [];
	private tracks: Track[] = [];
	private contacts: THREE.Mesh[] = [];
	private threads: THREE.Mesh[] = [];
	private plates: MapPlate[] = [];
	private signs: THREE.Group[] = [];
	private kvSign!: THREE.Group;
	private moreSign!: THREE.Group;
	private rows: KvRow[] = [];
	private tethers: Tether[] = [];
	private chips: { group: THREE.Group; share: THREE.Group }[] = [];
	private kChip!: THREE.MeshPhysicalMaterial;
	private vChip!: THREE.MeshPhysicalMaterial;
	private query = new THREE.Group();
	private webs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
	private net = new THREE.Group();
	private netNodes!: THREE.InstancedMesh;
	private netMats: THREE.MeshBasicMaterial[] = [];
	private netStops: THREE.Vector3[] = [];
	private bars!: THREE.InstancedMesh;
	private barSpots: { x: number; z: number; h: number }[] = [];
	private picks: { group: THREE.Group; bar: THREE.Mesh; sign: THREE.Group; h: number }[] = [];
	private headSign!: THREE.Group;
	private baseColor = TOKENS.map((t) => new THREE.Color(t.special ? color.cobalt : color.amber));
	private dimColor = new THREE.Color('#5d6b8c');
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private d = new THREE.Object3D();
	private c = new THREE.Color();
	private mapTint = new THREE.Color();

	constructor() {
		this.group.position.x = PRE;
		this.buildStack();
		this.buildTokens();
		this.buildLookBack();
		this.buildNetwork();
		this.buildScores();
	}

	private buildStack() {
		FLOORS.forEach((y, i) => {
			const plate = new MapPlate(W, D, 0.34, i < FLOORS.length - 1);
			plate.group.position.set(0, y, CZ);
			this.group.add(plate.group);
			this.plates.push(plate);
			const sign = createSign(NAMES[i], 0.42);
			sign.position.set(-W / 2 + 2, y - 0.17, CZ + D / 2 + 0.06);
			this.group.add(sign);
			this.signs.push(sign);
			if (i > 0) {
				const row = new KvRow(n, -4.4, 6);
				row.group.position.set(0, y - 0.17, CZ + D / 2 + 0.01);
				this.group.add(row.group);
				this.rows.push(row);
			}
		});
		this.kvSign = createSign('KV cache', 0.3);
		this.kvSign.position.set(W / 2 - 0.9, FLOORS[1] - 0.17, CZ + D / 2 + 0.06);
		this.group.add(this.kvSign);

		// The layers nobody could draw: the same plates, thin and dark, with the threads running through them.
		const fin = extrude(roundedRect(W, D, Math.min(W, D) * 0.1), 0.05, 0.015, 2, 14);
		fin.rotateX(-Math.PI / 2);
		const fins = new THREE.InstancedMesh(fin, new THREE.MeshStandardMaterial({ color: '#1a2d63', roughness: 0.7, envMapIntensity: 0.3, transparent: true, opacity: 0.42, depthWrite: false }), 14);
		fins.frustumCulled = false;
		fins.renderOrder = 3;
		for (let i = 0; i < fins.count; i++) {
			this.d.position.set(0, lerp(FLOORS[3] + 1.5, FLOORS[4] - 1.5, i / (fins.count - 1)), CZ);
			this.d.updateMatrix();
			fins.setMatrixAt(i, this.d.matrix);
		}
		this.group.add(fins);
		this.moreSign = createSign('74 more layers', 0.42);
		this.moreSign.position.set(-W / 2 + 2.6, (FLOORS[3] + FLOORS[4]) / 2, CZ + D / 2 + 0.2);
		this.group.add(this.moreSign);

		// A pool of shade on the board under the lowest plate, which is what makes the plate float.
		const under = contactShadow(W + 1, D + 1, 0.7, 0.55, '#020818');
		under.position.set(0, 0.32, CZ);
		this.group.add(under);
	}

	private buildTokens() {
		let cursor = 0;
		const total = TOKENS.reduce((sum, t) => sum + t.width + 0.07, -0.07);
		this.tiles.forEach((tile, i) => {
			this.rowX.push(-total / 2 + cursor + tile.width / 2);
			cursor += tile.width + 0.07;
			this.group.add(tile.group);
			// A soft patch under each tile, which only exists while the tile is resting on a map.
			const contact = contactShadow(tile.width * TS + 0.3, 0.8 * TS + 0.28, 0.14, 0.5);
			contact.visible = false;
			this.group.add(contact);
			this.contacts.push(contact);
			const track = buildTrack(i);
			this.tracks.push(track);
			const focus = i === JOB;
			const material = focus
				? new THREE.MeshStandardMaterial({ color: '#ffb31a', emissive: '#ff8a00', emissiveIntensity: 0.9, roughness: 0.35 })
				: TOKENS[i].special
					? new THREE.MeshStandardMaterial({ color: '#5a90ff', emissive: '#2a68f0', emissiveIntensity: 0.8, roughness: 0.4 })
					: new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#d88a1a', emissiveIntensity: 0.55, roughness: 0.4 });
			const geo = new THREE.TubeGeometry(buildTrack(i, true), 360, focus ? 0.085 : 0.05, 7);
			const mesh = new THREE.Mesh(geo, material);
			mesh.frustumCulled = false;
			geo.setDrawRange(0, 0);
			this.group.add(mesh);
			this.threads.push(mesh);
		});
	}

	/* ---- "job" looks back ---- */
	private buildLookBack() {
		const m = mats();
		const y = FLOORS[1] + TILE_H * TS + 0.04;
		const P1 = P[2];
		const arcMat = new THREE.MeshStandardMaterial({ color: '#ff8a1e', emissive: '#ff6a00', emissiveIntensity: 0.55, roughness: 0.4 });
		this.vChip = new THREE.MeshPhysicalMaterial({ color: '#3fd2dc', roughness: 0.3, clearcoat: 0.8, emissive: '#129aa6', emissiveIntensity: 0.4 });
		this.kChip = (m.hbm as THREE.MeshPhysicalMaterial).clone();
		const chipGeo = rbox(0.5, 0.42, 0.13, 0.05, 2);
		chipGeo.translate(0, 0.21, 0);
		const CHIP_Z = -0.42;
		const kLetter = new Label('K', 0.3, { color: '#06351c', weight: 800 });
		const vLetter = new Label('V', 0.3, { color: '#053a40', weight: 800 });
		const top = new THREE.Vector3(P1[JOB][0], y + 0.78, CZ + P1[JOB][1] + CHIP_Z);
		SHARES.forEach((share, i) => {
			const group = new THREE.Group();
			group.position.set(P1[i][0], y, CZ + P1[i][1] + CHIP_Z);
			const k = new THREE.Mesh(chipGeo, this.kChip);
			k.position.x = -0.28;
			k.castShadow = true;
			const kFace = kLetter.mesh.clone();
			kFace.position.set(0, 0.21, 0.07);
			k.add(kFace);
			const v = new THREE.Mesh(chipGeo, this.vChip);
			v.position.x = 0.28;
			v.castShadow = true;
			const vFace = vLetter.mesh.clone();
			vFace.position.set(0, 0.21, 0.07);
			v.add(vFace);
			group.add(k, v);
			const pct = createSign(`${Math.round(share * 100)}%`, 0.3);
			pct.position.set(0, 0.86, 0.02);
			pct.scale.setScalar(0.0001);
			group.add(pct);
			group.visible = false;
			this.group.add(group);
			this.chips.push({ group, share: pct });
			const to = new THREE.Vector3(P1[i][0] - 0.28, y + 0.44, CZ + P1[i][1] + CHIP_Z);
			const t = new Tether(top, to, share, arcMat, this.vChip);
			this.tethers.push(t);
			this.group.add(t.mesh, t.bead);
		});
		const qGeo = rbox(0.74, 0.66, 0.16, 0.08, 3);
		qGeo.translate(0, 0.33, 0);
		const q = new THREE.Mesh(qGeo, m.amber);
		q.castShadow = true;
		this.query.add(q);
		const letter = new Label('Q', 0.44, { color: color.ink, weight: 800 });
		letter.mesh.position.set(0, 0.33, 0.086);
		this.query.add(letter.mesh);
		this.query.position.set(P1[JOB][0], y, CZ + P1[JOB][1] + CHIP_Z);
		this.query.scale.setScalar(0.0001);
		this.group.add(this.query);

		// Then every token at once, on every layer.
		WEBS.forEach((_, f) => {
			const pos = P[f + 3];
			const yy = FLOORS[f + 1] + 0.5;
			const parts: THREE.BufferGeometry[] = [];
			for (let j = 1; j < n; j++) {
				for (let i = 0; i < j; i++) {
					if (hash(i * 13.1 + j * 7.7 + f * 3.3) < 0.5) continue;
					const a = new THREE.Vector3(pos[j][0], yy, CZ + pos[j][1]);
					const b = new THREE.Vector3(pos[i][0], yy, CZ + pos[i][1]);
					const c = a.clone().lerp(b, 0.5);
					c.y += 0.8 + a.distanceTo(b) * 0.24;
					parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), 24, 0.014 + hash(i + j * 3.3) * 0.032, 5));
				}
			}
			const mat = new THREE.MeshBasicMaterial({ color: '#ff9a2e', transparent: true, opacity: 0, depthWrite: false });
			const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
			mesh.visible = false;
			mesh.renderOrder = 2;
			this.group.add(mesh);
			this.webs.push({ mesh, mat });
		});
	}

	/* ---- feed-forward: a fully connected network, one token at a time ---- */
	private buildNetwork() {
		const m = mats();
		const net = this.net;
		net.position.set(P[3][JOB][0], FLOORS[1] + 0.3, CZ + P[3][JOB][1]);
		net.scale.setScalar(0.0001);
		NET.slice(0, -1).forEach((_, l) => {
			const mat = new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.4, depthWrite: false });
			this.netMats.push(mat);
			const lines = new THREE.Mesh(netLines(l, 0.017), mat);
			lines.renderOrder = 2;
			net.add(lines);
		});
		const count = NET.reduce((a, b) => a + b, 0);
		this.netNodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 18, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), count);
		this.netNodes.castShadow = true;
		let k = 0;
		NET.forEach((size, l) => {
			for (let i = 0; i < size; i++) {
				this.d.position.set(netX(l, i), netY(l), 0);
				this.d.updateMatrix();
				this.netNodes.setMatrixAt(k, this.d.matrix);
				this.netNodes.setColorAt(k, this.c.set(color.creamLight));
				k++;
			}
		});
		net.add(this.netNodes);
		const stem = rbox(0.06, 0.6, 0.06, 0.02, 1);
		stem.translate(0, 0.52, 0);
		net.add(new THREE.Mesh(stem, m.steel));
		const name = createSign('Feed-forward network', 0.26);
		name.position.set(0, netY(2) + 0.56, 0);
		net.add(name);
		this.group.add(net);

		this.netStops = NET_TOUR.map((i) => new THREE.Vector3(P[3][i][0], FLOORS[1] + TILE_H * TS + 0.42, CZ + P[3][i][1]));
	}

	/* ---- one score for every word ---- */
	private buildScores() {
		const m = mats();
		const y = FLOORS[4];
		const last = P[6][LAST];
		const pitch = 0.5;
		const geo = rbox(pitch - 0.07, 1, pitch - 0.07, 0.05, 2);
		geo.translate(0, 0.5, 0);
		for (let ix = -16; ix <= 16; ix++) {
			for (let iz = -9; iz <= 9; iz++) {
				const x = ix * pitch;
				const z = iz * pitch;
				if (Math.hypot(x - last[0], z - last[1]) < 1.15) continue;
				if (CANDIDATES.some((p) => Math.abs(x - p.x) < 0.1 && Math.abs(z - p.z) < 0.1)) continue;
				// Keep inside the plate's rounded corners.
				const cx = Math.max(0, Math.abs(x) - (W / 2 - 1.9));
				const cz = Math.max(0, Math.abs(z) - (D / 2 - 1.9));
				if (Math.hypot(cx, cz) > 1.4) continue;
				const dist = Math.hypot(x - last[0], (z - last[1]) * 1.15);
				this.barSpots.push({ x, z, h: 0.03 + 1.05 * Math.exp(-(dist * dist) / 9) });
			}
		}
		this.bars = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4, clearcoat: 0.5 }), this.barSpots.length);
		this.bars.frustumCulled = false;
		this.bars.castShadow = true;
		const amber = new THREE.Color(color.amber);
		this.barSpots.forEach((s, i) => {
			this.d.position.set(s.x, y + 0.01, CZ + s.z);
			this.d.scale.set(1, 0.0001, 1);
			this.d.updateMatrix();
			this.bars.setMatrixAt(i, this.d.matrix);
			// Each column starts as the colour of the map under it, and warms as it rises.
			mapColorAt(s.x, s.z, this.mapTint);
			this.bars.setColorAt(i, this.c.copy(this.mapTint).lerp(amber, smooth(seg(s.h, 0.1, 0.7))));
		});
		this.d.scale.set(1, 1, 1);
		this.group.add(this.bars);

		const big = rbox(pitch - 0.05, 1, pitch - 0.05, 0.06, 2);
		big.translate(0, 0.5, 0);
		CANDIDATES.forEach((p) => {
			const group = new THREE.Group();
			group.position.set(p.x, y + 0.01, CZ + p.z);
			const bar = new THREE.Mesh(big, m.amber);
			bar.castShadow = true;
			bar.scale.y = 0.0001;
			group.add(bar);
			this.group.add(group);
			const sign = createSign(p.text, 0.36);
			sign.scale.setScalar(0.0001);
			group.add(sign);
			this.picks.push({ group, bar, sign, h: p.score * 0.86 });
		});
		this.headSign = createSign('LM head: one score for every word', 0.34, '#ffffff', m.cobalt);
		this.headSign.position.set(3.6, y - 0.17, CZ + D / 2 + 0.08);
		this.headSign.scale.setScalar(0.0001);
		this.group.add(this.headSign);
	}

	/** How far along its track a token is at T. */
	private along(i: number, T: number) {
		const stops = this.tracks[i].stops;
		const legs = [POSITION, RISE, i === JOB ? JOB_SLIDE : OTHERS_SLIDE, UP[0], UP[1], UP[2]];
		let s = stops[0];
		legs.forEach((w, l) => {
			s = lerp(s, stops[l + 1], inOut(seg(T, w[0], w[1])));
		});
		return s;
	}

	update(T: number, time: number) {
		const belt = inOut(seg(T, BELT[0], BELT[1]));
		const sink = inOut(seg(T, SINK[0], SINK[1]));
		// Tokens after "job" stay dark while it looks back: it cannot see them.
		const dim = smooth(seg(T, Q_ON[0], Q_ON[1])) * (1 - smooth(seg(T, WEBS[0][0] - 0.012, WEBS[0][0])));

		this.tiles.forEach((tile, i) => {
			const delay = (i / n) * 0.78;
			const hop = seg(T, lerp(HOPS[0], HOPS[1], delay), lerp(HOPS[0], HOPS[1], delay + 0.22));
			const onMap = hop >= 1;
			tile.update(1, 1 - smooth(hop));
			tile.group.scale.setScalar(lerp(1, TS, inOut(hop)));
			const track = this.tracks[i];
			const s = this.along(i, T);
			const shown = onMap ? s / track.total : 0;
			const thread = this.threads[i];
			const climbed = (s - track.stops[1]) / (track.total - track.stops[1]);
			thread.visible = onMap && climbed > 0.0005;
			if (thread.visible) thread.geometry.setDrawRange(0, Math.floor(climbed * 360) * 7 * 6);

			const gone = i !== LAST && sink >= 1;
			tile.group.visible = T > 14.02 && !gone;
			const contact = this.contacts[i];
			contact.visible = false;
			if (!tile.group.visible) return;
			if (onMap) {
				track.getPoint(shown, this.a);
				this.a.y += ON - 0.03;
				// The two "the" tiles share one place, so one lies on the other until they are told apart. It only settles once it is clear.
				if (i === 6) this.a.y += (1 - inOut(seg(T, lerp(POSITION[0], POSITION[1], 0.62), POSITION[1]))) * TILE_H * TS;
				const slim = lerp(0.1, 1, wholeness(this.a.y));
				tile.group.scale.setScalar(TS * slim);
				// When only the last position matters, the others press flat into the map.
				if (i !== LAST) {
					tile.group.scale.y = Math.max(0.001, TS * slim * (1 - sink));
					this.a.y -= sink * (TILE_H * TS) * 0.5;
				}
			} else {
				this.a.set(lerp(-46, 0, belt) + this.rowX[i], RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
				if (hop > 0) {
					this.b.set(P[0][i][0], FLOORS[0] + ON + (i === 6 ? TILE_H * TS : 0), CZ + P[0][i][1]);
					arcPoint(this.a, this.b, 2.2, inOut(hop), this.a);
				}
			}
			tile.group.position.copy(this.a);
			let rest = Infinity;
			let on = 0;
			FLOORS.forEach((y, f) => {
				const gap = Math.abs(this.a.y - ON - y);
				if (gap < rest) {
					rest = gap;
					on = f;
				}
			});
			contact.visible = onMap && rest < 0.7 && sink === 0;
			if (contact.visible) {
				contact.position.set(this.a.x, FLOORS[on] + 0.016, this.a.z);
				(contact.material as THREE.Material).opacity = 0.5 * (1 - rest / 0.7);
			}
			const mat = tile.body.material;
			const later = i > JOB ? dim : 0;
			mat.color.copy(this.baseColor[i]).lerp(this.dimColor, later);
			mat.emissiveIntensity = 0.4 * (1 - later);
		});

		/* ---- one map lit at a time, and a wave up the stack to open with ---- */
		// The floors' names only come out when the whole stack is in view, or for the floor being read.
		const whole = 1 - smooth(seg(T, 14.125, 14.15)) + smooth(seg(T, 14.71, 14.735)) * (1 - smooth(seg(T, 14.86, 14.88)));
		this.plates.forEach((plate, f) => {
			const [a, b, c, d, peak] = LIT[f];
			const read = smooth(seg(T, a, b)) * (1 - smooth(seg(T, c, d))) * peak;
			const wave = bell(T, 14.035 + f * 0.012, 14.075 + f * 0.012) * 0.75;
			plate.setLit(Math.max(read, wave));
			this.signs[f].scale.setScalar(Math.max(0.0001, Math.max(whole, read)));
		});
		this.moreSign.scale.setScalar(Math.max(0.0001, whole));
		this.kvSign.scale.setScalar(Math.max(0.0001, smooth(seg(T, WEBS[0][0], WEBS[0][0] + 0.02)) * (1 - smooth(seg(T, 14.7, 14.72)))));

		/* ---- "job" looks back ---- */
		const live = T > Q_ON[0] - 0.006 && T < JOB_SLIDE[0] + 0.02;
		const leave = smooth(seg(T, JOB_SLIDE[0] - 0.006, JOB_SLIDE[0] + 0.014));
		this.query.visible = live;
		if (live) this.query.scale.setScalar(Math.max(0.0001, outBack(seg(T, Q_ON[0], Q_ON[1]), 1.8) * (1 - leave)));
		const comparing = bell(T, COMPARE[0] - 0.004, COMPARE[1] + 0.03);
		const mixing = bell(T, MIX[0] - 0.004, MIX[1] + 0.004);
		this.kChip.emissiveIntensity = 0.3 + comparing * 1.3;
		this.vChip.emissiveIntensity = 0.3 + mixing * 1.5;
		this.chips.forEach((chip, i) => {
			chip.group.visible = live;
			if (!live) return;
			const a = outBack(seg(T, KV_ON[0] + i * 0.002, KV_ON[0] + i * 0.002 + 0.008), 1.8);
			chip.group.scale.setScalar(Math.max(0.0001, a * (1 - leave)));
			chip.share.scale.setScalar(Math.max(0.0001, outBack(seg(T, WEIGH[0] + i * 0.001, WEIGH[0] + i * 0.001 + 0.012), 1.8)));
		});
		this.tethers.forEach((t, i) => {
			const order = (SHARES.length - 1 - i) / SHARES.length;
			const on = smooth(seg(T, COMPARE[0] + order * 0.014, COMPARE[0] + order * 0.014 + 0.02));
			const off = smooth(seg(T, MIX[1] - 0.004, JOB_SLIDE[0] + 0.012));
			t.show(on, off);
			const v = seg(T, MIX[0] + order * 0.012, MIX[1] - (1 - order) * 0.012);
			t.bead.visible = v > 0 && v < 1;
			if (t.bead.visible) {
				t.path.getPoint(1 - inOut(v), t.bead.position);
				// Each one is absorbed as it arrives, rather than piling up inside "job".
				t.bead.scale.setScalar((0.12 + SHARES[i] * 0.95) * Math.min(1, (1 - v) * 6));
			}
		});

		/* ---- everyone at once, and what they store ---- */
		this.webs.forEach((web, f) => {
			const w = WEBS[f];
			const k = bell(T, w[0], w[1]);
			web.mesh.visible = k > 0.01;
			web.mat.opacity = k * 0.8;
			this.rows[f].set((i) => outBack(seg(T, lerp(w[0], w[1], (i / n) * 0.6), lerp(w[0], w[1], (i / n) * 0.6 + 0.4)), 1.6));
		});

		/* ---- the small network ---- */
		const netIn = outBack(seg(T, NET_IN[0], NET_IN[1]), 1.1);
		const netOut = smooth(seg(T, NET_OUT[0], NET_OUT[1]));
		const visit = seg(T, NET_VISIT[0], NET_VISIT[1]) * (NET_TOUR.length - 1);
		const netK = netIn * (1 - netOut);
		this.net.visible = netK > 0.001;
		if (this.net.visible) {
			const hop = Math.min(NET_TOUR.length - 2, Math.floor(visit));
			const f = inOut(Math.min(1, visit - hop));
			arcPoint(this.netStops[hop], this.netStops[hop + 1], 0.5, f, this.net.position);
			this.net.scale.setScalar(Math.max(0.0001, netK * lerp(1, 0.62, smooth(Math.min(1, visit)))));
			// A pulse runs up through it: one long one for "job", then one per token it visits.
			const run = visit > 0 ? visit % 1 : seg(T, NET_RUN[0], NET_RUN[1]);
			const amber = this.mapTint.set('#ffae1a');
			let k = 0;
			NET.forEach((size, l) => {
				const on = bell(run, (l / 3) * 0.7, (l / 3) * 0.7 + 0.42);
				for (let i = 0; i < size; i++) {
					this.netNodes.setColorAt(k++, this.c.set(color.creamLight).lerp(amber, on));
				}
			});
			if (this.netNodes.instanceColor) this.netNodes.instanceColor.needsUpdate = true;
			this.netMats.forEach((mat, l) => {
				mat.opacity = 0.32 + bell(run, (l / 3) * 0.7 + 0.1, (l / 3) * 0.7 + 0.52) * 0.68;
			});
		}

		/* ---- the scores ---- */
		const rise = seg(T, BARS[0], BARS[1]);
		this.bars.visible = rise > 0;
		if (this.bars.visible && rise < 1.0001) {
			const d = this.d;
			const last = P[6][LAST];
			this.barSpots.forEach((b, i) => {
				const dist = Math.hypot(b.x - last[0], b.z - last[1]);
				const k = outBack(seg(rise, Math.min(0.62, dist * 0.06), Math.min(0.62, dist * 0.06) + 0.38), 1.2);
				d.position.set(b.x, FLOORS[4] + 0.01, CZ + b.z);
				d.scale.set(1, Math.max(0.0001, b.h * k), 1);
				d.updateMatrix();
				this.bars.setMatrixAt(i, d.matrix);
			});
			d.scale.set(1, 1, 1);
			this.bars.instanceMatrix.needsUpdate = true;
		}
		this.picks.forEach((p, i) => {
			const k = outBack(seg(T, PICKS[0] + i * 0.003, PICKS[0] + i * 0.003 + 0.018), 1.3);
			const h = Math.max(0.0001, p.h * Math.max(0, k));
			p.bar.scale.y = h;
			p.sign.scale.setScalar(Math.max(0.0001, Math.min(1, k * 1.2)));
			p.sign.position.set(0, h + 0.46, 0.3);
		});
		this.headSign.scale.setScalar(Math.max(0.0001, outBack(seg(T, BARS[0], BARS[0] + 0.016), 1.4)));
		void time;
	}
}
