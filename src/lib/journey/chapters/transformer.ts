import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { arcPoint, curve, tube } from '../kit/machines';
import { canvasTexture, contactShadow, font, Label } from '../kit/print';
import { createSign } from '../kit/parts';
import { bell, hash, inOut, lerp, outBack, seg, smooth } from '../kit/math';
import { createPad } from '../props/board';
import { Tile, TILE_H } from '../props/tokenizer';
import { TOKENS } from '../content';
import { ORIGIN, PAD_Y, RAIL_Y, RAIL_Z } from '../layout';
import type { Shot } from '../rig';

/*
 * The forward pass, as what it does rather than how it is wired. Every word has a place on a map of
 * meaning. The embedding puts each one where its dictionary meaning sits, so "job" lands among careers.
 * Then each layer lets tokens look back at the ones before them and move, until the sentence has gathered
 * in one neighbourhood. The stack of layers is a stack of those maps, and the threads between them are the
 * tokens' paths through it.
 */

export const PRE = 168;
const WHEEL = 200;

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (x: number, y: number, z: number): [number, number, number] => [ORIGIN.x + PRE + x, ORIGIN.y + y, ORIGIN.z + z];
const TALL = box(0, 0.06, 1, 0.47);

const W = 17;
const D = 10.4;
const CZ = -1.6; // the map's centre, so its front edge stops short of the belt
const PLATES = [PAD_Y + 0.4, 7.1, 13.5, 19.9, 30];
const NAMES = ['Embedding', 'Layer 1', 'Layer 2', 'Layer 3', 'Layer 80'];
const TS = 1.6; // tiles are drawn larger on the map, because the words are the point
const ON = (TILE_H * TS) / 2 + 0.03; // a tile resting on a map

/* ---------------------------------------------------------------- the map ---- */

interface Region {
	name: string;
	x: number;
	z: number;
	rx: number;
	rz: number;
	fill: string;
	words: string[];
}

/** Illustrative, and the page says so: a real embedding has thousands of dimensions. */
const REGIONS: Region[] = [
	{ name: 'Concurrent code', x: 0.7, z: 0, rx: 3.8, rz: 2, fill: '#8fe3bd', words: ['thread', 'mutex', 'deadlock', 'worker', 'queue', 'lock'] },
	{ name: 'Sports', x: -6, z: -3.1, rx: 2.3, rz: 1.95, fill: '#bfe3a0', words: ['sprint', 'marathon', 'lap'] },
	{ name: 'Health', x: -1.2, z: -3.75, rx: 2.3, rz: 1.35, fill: '#f6c0c0', words: ['illness', 'symptom'] },
	{ name: 'Careers', x: 4.8, z: -3.75, rx: 2.5, rz: 1.35, fill: '#f7d694', words: ['salary', 'hiring'] },
	{ name: 'Calendars', x: 6.6, z: 1.7, rx: 1.9, rz: 2, fill: '#cfc6f5', words: ['agenda', 'meeting'] },
	{ name: 'Repairs', x: -6.8, z: 0.9, rx: 1.65, rz: 1.5, fill: '#b7d6f2', words: ['patch', 'mend'] },
	{ name: 'Small words', x: -3.3, z: 3.7, rx: 3.3, rz: 1.5, fill: '#dfe2e8', words: [] },
	{ name: 'Chat markers', x: 2.8, z: 3.75, rx: 2.5, rz: 1.4, fill: '#b9cdf7', words: [] }
];

let mapTexture: THREE.CanvasTexture | undefined;

/** One printed map, shared by every layer: same words, same places. */
export function meaningMap() {
	if (mapTexture) return mapTexture;
	const TW = 2048;
	const TH = Math.round((TW * D) / W);
	const canvas = document.createElement('canvas');
	canvas.width = TW;
	canvas.height = TH;
	const c = canvas.getContext('2d')!;
	const px = (x: number) => ((x + W / 2) / W) * TW;
	const py = (z: number) => ((z + D / 2) / D) * TH;
	const u = TW / W;
	c.fillStyle = '#f8f5ee';
	c.fillRect(0, 0, TW, TH);
	const blob = (r: Region, grow: number) => {
		c.beginPath();
		for (let i = 0; i <= 72; i++) {
			const a = (i / 72) * Math.PI * 2;
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
		c.strokeStyle = 'rgba(40,60,100,.2)';
		c.lineWidth = 3;
		c.stroke();
	});
	REGIONS.forEach((r, n) => {
		c.fillStyle = 'rgba(17,26,46,.5)';
		c.font = `500 ${0.2 * u}px ${font.mono}`;
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		r.words.forEach((w, i) => {
				c.fillText(w, px(r.x + (i % 2 ? 1 : -1) * r.rx * (n === 0 ? 0.5 + hash(i) * 0.3 : 0.68)), py(r.z - r.rz * (n === 0 ? -0.2 - i * 0.14 : 0.42 - i * 0.3)));
		});
		c.fillStyle = '#16233f';
		c.font = `800 ${(n === 0 ? 0.56 : 0.44) * u}px ${font.display}`;
		c.fillText(r.name, px(r.x), py(n === 0 ? r.z - r.rz + 0.56 : r.z + r.rz - 0.48));
	});
	mapTexture = canvasTexture(canvas);
	return mapTexture;
}

function ringShape(w: number, d: number, rim: number) {
	const shape = roundedRect(w, d, 0.42);
	const hole = new THREE.Path();
	roundedRect(w - rim * 2, d - rim * 2, 0.26)
		.getPoints(6)
		.reverse()
		.forEach((p, i) => (i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y)));
	hole.closePath();
	shape.holes.push(hole);
	return shape;
}

/** A map in its frame: what one layer of the stack looks like, at any size. */
export function createMapPlate(w: number, d: number, rim = 0.24, opacity = 1) {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	b.add(extrude(ringShape(w + rim * 2, d + rim * 2, rim), 0.2, 0.05, 3, 8), m.cobalt, { r: [-Math.PI / 2, 0, 0] });
	const frame = b.build('map-frame');
	frame.traverse((o) => (o.castShadow = false));
	group.add(frame);
	const material = new THREE.MeshStandardMaterial({
		map: meaningMap(),
		emissive: '#ffffff',
		emissiveMap: meaningMap(),
		emissiveIntensity: 0.3,
		roughness: 0.82,
		transparent: true,
		opacity,
		side: THREE.DoubleSide,
		depthWrite: false
	});
	const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
	sheet.rotation.x = -Math.PI / 2;
	sheet.renderOrder = 1;
	group.add(sheet);
	return { group, material };
}

/* ------------------------------------------------------------ the journey ---- */

type XZ = [number, number];
const n = TOKENS.length;
const JOB = 7;

/** Where each token is on the map: in the dictionary, with its position mixed in, after layer 1, 2, 3 and 80. */
const P: XZ[][] = [
	[[1.5, 3.4], [-6.8, 0.4], [-3.6, 3.3], [-6, -3.4], [-1.2, -4.05], [-1.4, 3.4], [-3.6, 3.3], [4.8, -4.05], [6.5, 1.05], [-5.5, 3.4], [3.9, 3.4]],
	[[1.5, 3.4], [-6.8, 0.4], [-4.05, 3.1], [-6, -3.4], [-1.2, -4.05], [-1.4, 3.4], [-2.75, 3.5], [4.8, -4.05], [6.5, 1.05], [-5.5, 3.4], [3.9, 3.4]],
	[[1.5, 3.4], [-5.7, 0.4], [-4, 2.8], [-5.1, -2.8], [-0.6, -3], [-1.5, 3], [-2.7, 3.1], [3.3, -1.1], [5.6, 0.9], [-5.3, 3.2], [3.6, 3]],
	[[1.5, 3.4], [-4.7, 0.5], [-3.7, 2.6], [-4.4, -2.2], [-0.2, -1.9], [-1.3, 2.8], [-2.5, 2.8], [3, -0.9], [4.8, 0.8], [-4.9, 3], [3, 2.6]],
	[[1.5, 3.4], [-3.9, 0.3], [-3.4, 2.3], [-3.7, -1.6], [0, -1.3], [-1, 2.4], [-2.2, 2.4], [2.7, -0.7], [4.1, 0.7], [0, 2.8], [2.4, 2.1]],
	[[1.5, 3.4], [-2.6, -0.35], [-2.9, 1.2], [-2.9, -1.7], [-0.2, -1.4], [-0.2, 1.5], [-1.5, 1.4], [2.1, -1.2], [3.2, 0.2], [1, 1.65], [2.3, 1.75]]
];
/** How well each earlier token matches the query of "job". Illustrative. */
const MATCH = [0.02, 0.1, 0.01, 0.3, 0.42, 0.05, 0.02];

/* ---- timeline ---- */
const BELT: [number, number] = [14, 14.055];
const HOPS: [number, number] = [14.06, 14.17];
const LEGS: [number, number][] = [
	[14.18, 14.205], // position signal
	[14.24, 14.295], // up to layer 1
	[14.56, 14.605], // layer 1 (job goes earlier)
	[14.645, 14.69], // up to layer 2, gathering as it goes
	[14.7, 14.745],
	[14.755, 14.82]
];
const JOB_SLIDE: [number, number] = [14.495, 14.535];
const Q_ON: [number, number] = [14.31, 14.33];
const K_ON: [number, number] = [14.33, 14.355];
const ARCS: [number, number] = [14.36, 14.405];
const VALUES: [number, number] = [14.41, 14.49];
const WEBS: [number, number][] = [
	[14.55, 14.61],
	[14.688, 14.716],
	[14.743, 14.772],
	[14.818, 14.85]
];
/** Floors come down from above just before they are needed, so the frame only ever holds what matters. */
const DROPS: [number, number][] = [
	[0, 0],
	[14.185, 14.235],
	[14.605, 14.645],
	[14.615, 14.655],
	[14.625, 14.665]
];
const SINK: [number, number] = [14.85, 14.88];
const BARS: [number, number] = [14.875, 14.95];
const PICKS: [number, number] = [14.93, 14.975];
const PULSE: [number, number] = [14.975, 15.06];

const MAP_SHOT = { el: 42, radius: 9.3, ry: 5.6, wide: box(0.43, 0.07, 0.57, 0.86), tall: TALL };
const S0: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 9, target: at(0, PLATES[0] + 0.4, CZ + 0.6) };
const S1: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 5, target: at(0, PLATES[1] + 0.6, CZ) };
const STOWER: Omit<Shot, 'T'> = { az: 32, el: 15, target: at(0, 16.2, CZ - 1), radius: 14, ry: 17.4, wide: box(0.44, 0.03, 0.56, 0.93), tall: TALL };
const STOP: Omit<Shot, 'T'> = { ...MAP_SHOT, az: 11, el: 38, target: at(0, PLATES[4] + 1, CZ + 0.3), ry: 5.8 };

export const TRANSFORMER_SHOTS: Shot[] = [
	{ T: 13.99, ...S0, az: 20, el: 30 },
	{ T: 14.06, ...S0 },
	{ T: 14.205, ...S0, az: 8 },
	{ T: 14.295, ...S1 },
	{ T: 14.61, ...S1, az: 3 },
	{ T: 14.67, ...STOWER },
	{ T: 14.84, ...STOWER, az: 22 },
	{ T: 14.885, ...STOP },
	{ T: 14.99, ...STOP, az: 8 }
];

/** A path through the stack: sliding on a map, rounding a corner, rising to the next. Walked by arc length. */
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

function buildTrack(i: number) {
	const t = new Track();
	const v = (xz: XZ, y: number) => new THREE.Vector3(xz[0], y + ON, CZ + xz[1]);
	t.add(v(P[0][i], PLATES[0]));
	t.stop();
	// The position signal, on the embedding's own map.
	t.add(v(P[1][i], PLATES[0]));
	t.stop();
	// Straight up to layer 1.
	t.add(v(P[1][i], PLATES[1]));
	t.stop();
	// Layer 1 is where we watch it happen, so the move is along the map.
	t.add(v(P[2][i], PLATES[1]));
	t.stop();
	// After that the tokens gather as they rise: long smooth strands, not stairs.
	for (let k = 3; k < P.length; k++) {
		const from = v(P[k - 1][i], PLATES[k - 2]);
		const to = v(P[k][i], PLATES[k - 1]);
		const h = (to.y - from.y) * 0.46;
		const q = new THREE.CubicBezierCurve3(from, from.clone().setY(from.y + h), to.clone().setY(to.y - h), to);
		for (let j = 1; j <= 36; j++) t.add(q.getPoint(j / 36));
		t.stop();
	}
	return t;
}

/** One line from a token back to an earlier one. */
class Tether {
	mesh: THREE.Mesh;
	path: THREE.QuadraticBezierCurve3;
	count: number;
	bead: THREE.Mesh;
	constructor(
		from: XZ,
		to: XZ,
		y: number,
		public weight: number,
		material: THREE.Material,
		beadMat: THREE.Material
	) {
		const a = new THREE.Vector3(from[0], y + 0.6, CZ + from[1]);
		const b = new THREE.Vector3(to[0], y + 0.6, CZ + to[1]);
		const ctrl = a.clone().lerp(b, 0.5);
		ctrl.y += 1 + a.distanceTo(b) * 0.2;
		this.path = new THREE.QuadraticBezierCurve3(a, ctrl, b);
		const geo = new THREE.TubeGeometry(this.path, 60, 0.024 + weight * 0.22, 8);
		this.mesh = new THREE.Mesh(geo, material);
		this.mesh.castShadow = false;
		this.count = geo.index!.count;
		geo.setDrawRange(0, 0);
		this.mesh.visible = false;
		this.bead = new THREE.Mesh(rbox(1, 1, 1, 0.14, 2), beadMat);
		this.bead.visible = false;
	}
}

interface Pick {
	text: string;
	score: number;
	x: number;
	z: number;
}
/** The same candidates as the logits board that comes next, placed on the map. */
const CANDIDATES: Pick[] = [
	{ text: 'The', score: 3.6, x: 0.4, z: 0.2 },
	{ text: 'I', score: 2.3, x: -0.8, z: 2.5 },
	{ text: 'Let', score: 1.9, x: 1, z: 3.4 },
	{ text: 'First', score: 1.4, x: 4.1, z: 2.6 },
	{ text: 'To', score: 1.05, x: 4.1, z: 0.8 },
	{ text: 'Sorry', score: 0.4, x: -6.3, z: 1.6 },
	{ text: 'Cat', score: 0.2, x: 5.6, z: -2.6 }
];

export class Transformer {
	group = new THREE.Group();

	private tiles = TOKENS.map((t) => new Tile(t));
	private rowX: number[] = [];
	private tracks: Track[] = [];
	private contacts: THREE.Mesh[] = [];
	private threads: { mesh: THREE.Mesh; count: number }[] = [];
	private sheets: THREE.MeshStandardMaterial[] = [];
	private tethers: Tether[] = [];
	private keys: { group: THREE.Group; bar: THREE.Mesh; mat: THREE.MeshPhysicalMaterial }[] = [];
	private query = new THREE.Group();
	private webs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
	private kv: { k: THREE.InstancedMesh; v: THREE.InstancedMesh }[] = [];
	private lamps: Lamp[] = [];
	private bars!: THREE.InstancedMesh;
	private barSpots: { x: number; z: number; h: number; hue: number }[] = [];
	private picks: { group: THREE.Group; bar: THREE.Mesh; h: number }[] = [];
	private pipe!: THREE.CatmullRomCurve3;
	private pulse!: THREE.Mesh;
	private headSign!: THREE.Group;
	private floors: THREE.Group[] = [];
	private frame!: THREE.Object3D;
	private ghostRims!: THREE.InstancedMesh;
	private pipeMesh!: THREE.Mesh;
	private pipeCount = 0;
	private baseColor = TOKENS.map((t) => new THREE.Color(t.special ? color.cobalt : color.amber));
	private dimColor = new THREE.Color('#77839c');
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private d = new THREE.Object3D();
	private c = new THREE.Color();

	constructor() {
		this.group.position.x = PRE;
		const pad = createPad(18.6, 12.8);
		pad.position.set(0, PAD_Y, CZ);
		this.group.add(pad);
		this.buildStack();
		this.buildTokens();
		this.buildLookBack();
		this.buildScores();
	}

	/* ---- the stack: the same map, floor after floor ---- */
	private buildStack() {
		const m = mats();
		const hw = W / 2 + 0.12;
		const hd = D / 2 + 0.12;
		PLATES.forEach((y, i) => {
			const floor = new THREE.Group();
			floor.position.y = y;
			this.floors.push(floor);
			this.group.add(floor);
			const { group, material } = createMapPlate(W, D);
			group.position.z = CZ;
			floor.add(group);
			this.sheets.push(material);
			const sign = createSign(NAMES[i], 0.32);
			sign.position.set(-W / 2 + 1.6, 0, CZ + D / 2 + 0.34);
			floor.add(sign);
			const lamp = new Lamp(rbox(0.2, 0.1, 0.05, 0.03, 2), color.amber, 0.1);
			lamp.mesh.position.set(-W / 2 + 3.4, 0, CZ + D / 2 + 0.28);
			floor.add(lamp.mesh);
			this.lamps.push(lamp);
		});

		// Four steel columns, which grow as floors arrive.
		const frame = new Batch();
		const H = PLATES[4] + 0.9 - PAD_Y;
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				frame.add(new THREE.CylinderGeometry(0.13, 0.13, H, 16), m.steel, { p: [sx * hw, H / 2, CZ + sz * hd] });
			}
		}
		this.frame = frame.build('stack-frame');
		this.frame.position.y = PAD_Y;
		this.frame.traverse((o) => (o.castShadow = false));
		this.group.add(this.frame);
		const feet = new Batch();
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) feet.add(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 20), m.steelSoft, { p: [sx * hw, PAD_Y + 0.07, CZ + sz * hd] });
		this.group.add(feet.build('stack-feet'));

		// The floors nobody could draw, between layer 3 and layer 80.
		this.ghostRims = new THREE.InstancedMesh(extrude(ringShape(W + 0.48, D + 0.48, 0.2), 0.08, 0.02, 2, 6), new THREE.MeshStandardMaterial({ color: '#2a56b8', roughness: 0.6 }), 11);
		this.ghostRims.frustumCulled = false;
		for (let i = 0; i < this.ghostRims.count; i++) {
			this.d.position.set(0, lerp(PLATES[3] + 1.2, PLATES[4] - 1.2, i / (this.ghostRims.count - 1)), CZ);
			this.d.rotation.set(-Math.PI / 2, 0, 0);
			this.d.updateMatrix();
			this.ghostRims.setMatrixAt(i, this.d.matrix);
		}
		this.d.rotation.set(0, 0, 0);
		this.group.add(this.ghostRims);

		// A shelf along the front of each layer: the KV cache, filling as the row goes through.
		const vMat = new THREE.MeshPhysicalMaterial({ color: '#3fd2dc', roughness: 0.3, clearcoat: 0.9, emissive: '#129aa6', emissiveIntensity: 0.5 });
		for (let f = 1; f < PLATES.length; f++) {
			const shelf = new Batch();
			shelf.add(rbox(12.6, 0.1, 0.62, 0.03, 2), m.steelSoft, { p: [1.4, -0.04, CZ + D / 2 + 0.56] });
			const built = shelf.build('kv-shelf');
			built.traverse((o) => (o.castShadow = false));
			this.floors[f].add(built);
			const k = new THREE.InstancedMesh(rbox(0.36, 0.3, 0.36, 0.05, 2), m.hbm, n);
			const v = new THREE.InstancedMesh(rbox(0.36, 0.3, 0.36, 0.05, 2), vMat, n);
			k.frustumCulled = v.frustumCulled = false;
			this.floors[f].add(k, v);
			this.kv.push({ k, v });
		}
		const shelfSign = createSign('KV cache: a key and a value per token, per layer', 0.22);
		shelfSign.position.set(1.4, -0.46, CZ + D / 2 + 0.72);
		this.floors[1].add(shelfSign);
	}

	/* ---- the row ---- */
	private buildTokens() {
		let cursor = 0;
		const total = TOKENS.reduce((sum, t) => sum + t.width + 0.07, -0.07);
		this.tiles.forEach((tile, i) => {
			this.rowX.push(-total / 2 + cursor + tile.width / 2);
			cursor += tile.width + 0.07;
			this.group.add(tile.group);
			// A soft patch under each tile, which only exists while the tile is resting on a map.
			const contact = contactShadow(tile.width * TS + 0.34, 0.8 * TS + 0.3, 0.14, 0.5);
			contact.renderOrder = 1;
			contact.visible = false;
			this.group.add(contact);
			this.contacts.push(contact);
			const track = buildTrack(i);
			this.tracks.push(track);
			const focus = i === JOB;
			const material = focus
				? new THREE.MeshStandardMaterial({ color: color.amber, emissive: '#ff9600', emissiveIntensity: 0.7, roughness: 0.35 })
				: TOKENS[i].special
					? new THREE.MeshStandardMaterial({ color: '#3f7bf0', emissive: '#1f5fe0', emissiveIntensity: 0.4, roughness: 0.4 })
					: new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#c07a10', emissiveIntensity: 0.32, roughness: 0.4 });
			const geo = new THREE.TubeGeometry(track, 320, focus ? 0.1 : 0.06, 7);
			const mesh = new THREE.Mesh(geo, material);
			mesh.frustumCulled = false;
			geo.setDrawRange(0, 0);
			this.group.add(mesh);
			this.threads.push({ mesh, count: geo.index!.count });
		});
	}

	/* ---- "job" looks back ---- */
	private buildLookBack() {
		const m = mats();
		const y = PLATES[1];
		const from = P[1];
		const arcMat = new THREE.MeshStandardMaterial({ color: '#ff8a1e', emissive: '#ff6a00', emissiveIntensity: 0.55, roughness: 0.4 });
		const valMat = new THREE.MeshPhysicalMaterial({ color: '#3fd2dc', roughness: 0.3, clearcoat: 0.8, emissive: '#129aa6', emissiveIntensity: 0.7 });
		MATCH.forEach((w, i) => {
			const t = new Tether(from[JOB], from[i], y, w, arcMat, valMat);
			this.tethers.push(t);
			this.group.add(t.mesh, t.bead);
			const group = new THREE.Group();
			const mat = (m.hbm as THREE.MeshPhysicalMaterial).clone();
			const geo = rbox(0.56, 0.4, 0.14, 0.05, 2);
			geo.translate(0, 0.2, 0);
			const bar = new THREE.Mesh(geo, mat);
			bar.castShadow = true;
			group.add(bar);
			const letter = new Label('K', 0.28, { color: '#06351c', weight: 800 });
			letter.mesh.position.set(0, 0.2, 0.076);
			group.add(letter.mesh);
			group.position.set(from[i][0], y + TILE_H * TS + 0.02, CZ + from[i][1] - 0.5);
			group.scale.setScalar(0.0001);
			this.group.add(group);
			this.keys.push({ group, bar, mat });
		});
		const qGeo = rbox(0.74, 0.66, 0.16, 0.08, 3);
		qGeo.translate(0, 0.33, 0);
		const q = new THREE.Mesh(qGeo, m.amber);
		q.castShadow = true;
		this.query.add(q);
		const letter = new Label('Q', 0.42, { color: color.ink, weight: 800 });
		letter.mesh.position.set(0, 0.33, 0.086);
		this.query.add(letter.mesh);
		this.query.position.set(from[JOB][0], y + TILE_H * TS + 0.02, CZ + from[JOB][1] - 0.5);
		this.query.scale.setScalar(0.0001);
		this.group.add(this.query);

		// Then every token at once, on every layer.
		WEBS.forEach((_, f) => {
			const pos = f === 0 ? P[1].map((p, i) => (i === JOB ? P[2][JOB] : p)) : P[f + 2];
			const yy = PLATES[f + 1] + 0.5;
			const parts: THREE.BufferGeometry[] = [];
			for (let j = 1; j < n; j++) {
				for (let i = 0; i < j; i++) {
					if (hash(i * 13.1 + j * 7.7 + f * 3.3) < 0.5) continue;
					const a = new THREE.Vector3(pos[j][0], yy, CZ + pos[j][1]);
					const b = new THREE.Vector3(pos[i][0], yy, CZ + pos[i][1]);
					const c = a.clone().lerp(b, 0.5);
					c.y += 0.6 + a.distanceTo(b) * 0.22;
					parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), 20, 0.012 + hash(i + j * 3.3) * 0.03, 5));
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

	/* ---- one score for every word ---- */
	private buildScores() {
		const m = mats();
		const floor = this.floors[4];
		const last = P[5][n - 1];
		const geo = rbox(0.24, 1, 0.24, 0.04, 2);
		geo.translate(0, 0.5, 0);
		for (let ix = 0; ix < 22; ix++) {
			for (let iz = 0; iz < 13; iz++) {
				const x = -W / 2 + 0.6 + ((W - 1.2) * ix) / 21 + (hash(ix * 3.3 + iz) - 0.5) * 0.16;
				const z = -D / 2 + 0.6 + ((D - 1.2) * iz) / 12 + (hash(iz * 5.1 + ix) - 0.5) * 0.16;
				if (Math.hypot(x - last[0], z - last[1]) < 1.2) continue;
				if (CANDIDATES.some((p) => Math.hypot(x - p.x, z - p.z) < 0.55)) continue;
				const dist = Math.hypot(x - last[0], (z - last[1]) * 1.2);
				const near = Math.exp(-(dist * dist) / 20);
				this.barSpots.push({ x, z, h: 0.03 + near * 0.8 + hash(ix * 7.1 + iz * 2.7) * 0.14 * near, hue: near });
			}
		}
		this.bars = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.34, clearcoat: 0.6 }), this.barSpots.length);
		this.bars.frustumCulled = false;
		this.bars.castShadow = true;
		// Most of the vocabulary barely scores: it should read as the floor, not as a crowd.
		const cold = new THREE.Color('#c9d4e8');
		const warm = new THREE.Color('#2f6fe8');
		this.barSpots.forEach((s, i) => {
			this.d.position.set(s.x, 0.01, CZ + s.z);
			this.d.scale.set(1, 0.0001, 1);
			this.d.updateMatrix();
			this.bars.setMatrixAt(i, this.d.matrix);
			this.bars.setColorAt(i, this.c.copy(cold).lerp(warm, Math.min(1, s.hue * 1.7)));
		});
		this.d.scale.set(1, 1, 1);
		floor.add(this.bars);

		const big = rbox(0.6, 1, 0.6, 0.06, 2);
		big.translate(0, 0.5, 0);
		CANDIDATES.forEach((p) => {
			const group = new THREE.Group();
			group.position.set(p.x, 0.01, CZ + p.z);
			const bar = new THREE.Mesh(big, m.amber);
			bar.castShadow = true;
			bar.scale.y = 0.0001;
			group.add(bar);
			floor.add(group);
			const sign = createSign(p.text, 0.36);
			sign.scale.setScalar(0.0001);
			group.add(sign);
			this.picks.push({ group, bar, h: p.score * 0.82 });
		});
		this.headSign = createSign('LM head: one score for every word', 0.32, '#ffffff', m.cobalt);
		this.headSign.position.set(2.4, 0.02, CZ + D / 2 + 0.34);
		this.headSign.scale.setScalar(0.0001);
		floor.add(this.headSign);

		const y = PLATES[4];
		// The scores leave for the sampler.
		const X = W / 2 + 0.28;
		const Zf = CZ + D / 2 + 0.3;
		this.pipe = curve([
			[X - 0.3, y, Zf - 1],
			[X + 0.3, y - 0.2, Zf - 1],
			[X + 0.42, y - 1.2, Zf - 1],
			[X + 0.42, 14, Zf - 1],
			[X + 0.42, 3, Zf - 1],
			[X + 0.9, PAD_Y + 1.6, Zf - 1.1],
			[WHEEL - PRE - 11, PAD_Y + 1.6, -3.4],
			[WHEEL - PRE - 8.9, PAD_Y + 1.8, -1],
			[WHEEL - PRE - 8.6, PAD_Y + 1.8, -0.8]
		]);
		this.pipeMesh = tube(this.pipe, 0.1, m.orangeGlow, 160);
		this.pipeCount = this.pipeMesh.geometry.index!.count;
		this.pipeMesh.visible = false;
		this.group.add(this.pipeMesh);
		this.pulse = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: color.amber, emissiveIntensity: 3 }));
		this.pulse.visible = false;
		this.group.add(this.pulse);
	}

	/** How far along its track a token is at T. */
	private along(i: number, T: number) {
		const stops = this.tracks[i].stops;
		let s = stops[0];
		LEGS.forEach((leg, l) => {
			const w = i === JOB && l === 2 ? JOB_SLIDE : leg;
			const to = stops[l + 1];
			if (to === undefined) return;
			s = lerp(s, to, inOut(seg(T, w[0], w[1])));
		});
		return s;
	}

	update(T: number, time: number) {
		const belt = inOut(seg(T, BELT[0], BELT[1]));
		const sink = inOut(seg(T, SINK[0], SINK[1]));
		// "Later" tokens stay dark while job is looking back: it cannot see them.
		const dim = smooth(seg(T, Q_ON[0], Q_ON[1])) * (1 - smooth(seg(T, WEBS[0][0] - 0.012, WEBS[0][0])));

		this.tiles.forEach((tile, i) => {
			const delay = (i / n) * 0.78;
			const hop = seg(T, lerp(HOPS[0], HOPS[1], delay), lerp(HOPS[0], HOPS[1], delay + 0.22));
			const onMap = hop >= 1;
			tile.update(1, 1 - smooth(hop));
			tile.group.scale.setScalar(lerp(1, TS, inOut(hop)));
			const track = this.tracks[i];
			const s = this.along(i, T);
			const thread = this.threads[i];
			const shown = onMap ? s / track.total : 0;
			thread.mesh.visible = onMap && s > track.stops[0] + 0.01;
			if (thread.mesh.visible) thread.mesh.geometry.setDrawRange(0, Math.floor(shown * 320) * 7 * 6);

			const gone = i !== n - 1 && sink >= 1;
			tile.group.visible = T > 13.985 && !gone;
			if (!tile.group.visible) return;
			if (onMap) {
				track.getPoint(shown, this.a);
				// The two "the" tiles share one place, so one lies on the other until they are told apart.
				if (i === 6) this.a.y += (1 - inOut(seg(T, LEGS[0][0], LEGS[0][1]))) * TILE_H * TS;
				if (i !== n - 1) this.a.y -= sink * 0.8;
			} else {
				this.a.set(lerp(-46, 0, belt) + this.rowX[i], RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
				if (hop > 0) {
					this.b.set(P[0][i][0], PLATES[0] + ON + (i === 6 ? TILE_H * TS : 0), CZ + P[0][i][1]);
					arcPoint(this.a, this.b, 1.8, inOut(hop), this.a);
				}
			}
			tile.group.position.copy(this.a);
			const contact = this.contacts[i];
			let rest = Infinity;
			let on = 0;
			PLATES.forEach((y, f) => {
				const gap = Math.abs(this.a.y - ON - y);
				if (gap < rest) {
					rest = gap;
					on = f;
				}
			});
			contact.visible = onMap && rest < 0.7 && sink === 0;
			if (contact.visible) {
				contact.position.set(this.a.x, PLATES[on] + 0.015, this.a.z);
				(contact.material as THREE.Material).opacity = 0.5 * (1 - rest / 0.7);
			}
			const mat = tile.body.material;
			const later = i > JOB ? dim : 0;
			mat.color.copy(this.baseColor[i]).lerp(this.dimColor, later);
			mat.emissiveIntensity = 0.4 * (1 - later);
		});

		/* ---- the floors arrive, and one map at a time is lit ---- */
		const landed = DROPS.map((w, f) => (f === 0 ? 1 : inOut(seg(T, w[0], w[1]))));
		this.floors.forEach((floor, f) => {
			floor.visible = landed[f] > 0;
			floor.position.y = PLATES[f] + (1 - landed[f]) * 44;
		});
		const stackTop = lerp(lerp(PLATES[0], PLATES[1], landed[1]), PLATES[4], inOut(seg(T, DROPS[2][0], DROPS[4][1])));
		this.frame.scale.y = Math.max(0.001, (stackTop + 0.9 - PAD_Y) / (PLATES[4] + 0.9 - PAD_Y));
		this.ghostRims.visible = landed[4] >= 0.999;
		const sheet = (a: number, b: number, c: number, d: number, peak = 1, floor = 0.1) => lerp(floor, peak, smooth(seg(T, a, b)) * (1 - smooth(seg(T, c, d))));
		this.sheets[0].opacity = lerp(0.16, 1, 1 - smooth(seg(T, 14.245, 14.28)));
		this.sheets[1].opacity = sheet(14.26, 14.295, 14.645, 14.67);
		this.sheets[2].opacity = sheet(14.675, 14.69, 14.72, 14.735, 0.8);
		this.sheets[3].opacity = sheet(14.73, 14.745, 14.775, 14.79, 0.8);
		this.sheets[4].opacity = sheet(14.8, 14.825, 16, 17);
		// A lit map is a solid object, so the occlusion pass must not see the floors under it.
		this.sheets.forEach((mat) => {
			const solid = mat.opacity >= 0.995;
			if (solid === mat.transparent) {
				mat.transparent = !solid;
				mat.depthWrite = solid;
				mat.needsUpdate = true;
			}
		});
		this.lamps.forEach((lamp, i) => {
			const lit = i === 0 ? seg(T, HOPS[0], HOPS[1]) : seg(T, WEBS[i - 1][0], WEBS[i - 1][1]);
			lamp.mix(color.amber, color.green, lit, 0.1 + lit * 0.5);
		});

		/* ---- job looks back ---- */
		const live = T > Q_ON[0] - 0.01 && T < WEBS[0][1];
		const leave = smooth(seg(T, JOB_SLIDE[0] - 0.008, JOB_SLIDE[0] + 0.012));
		this.query.visible = live;
		if (live) this.query.scale.setScalar(Math.max(0.0001, outBack(seg(T, Q_ON[0], Q_ON[1]), 1.8) * (1 - leave)));
		const grow = smooth(seg(T, ARCS[0] + 0.015, ARCS[1]));
		this.keys.forEach((k, i) => {
			k.group.visible = live;
			if (!live) return;
			const a = outBack(seg(T, K_ON[0] + i * 0.002, K_ON[0] + i * 0.002 + 0.012), 1.8);
			k.group.scale.setScalar(Math.max(0.0001, a * (1 - leave)));
			k.bar.scale.y = 1 + MATCH[i] * 10 * grow;
			k.mat.emissiveIntensity = 0.3 + MATCH[i] * 3 * grow;
		});
		this.tethers.forEach((t, i) => {
			const order = (MATCH.length - 1 - i) / MATCH.length;
			const on = smooth(seg(T, ARCS[0] + order * 0.02, ARCS[0] + order * 0.02 + 0.024));
			const off = smooth(seg(T, VALUES[1] - 0.004, JOB_SLIDE[0] + 0.012));
			t.mesh.visible = on > 0 && off < 1;
			if (t.mesh.visible) {
				const geo = t.mesh.geometry;
				// Reaches out from job to the earlier token, then lets go at job's end.
				const start = Math.floor(off * t.count);
				geo.setDrawRange(start - (start % 3), Math.floor(on * t.count) - start);
			}
			const v = seg(T, VALUES[0] + order * 0.02, VALUES[1] - (1 - order) * 0.02);
			t.bead.visible = v > 0 && v < 1;
			if (t.bead.visible) {
				t.path.getPoint(1 - inOut(v), t.bead.position);
				t.bead.scale.setScalar(0.14 + t.weight * 1.05);
			}
		});

		/* ---- everyone at once, and what they store ---- */
		this.webs.forEach((web, f) => {
			const w = WEBS[f];
			const k = bell(T, w[0], w[1]);
			web.mesh.visible = k > 0.01;
			web.mat.opacity = k * 0.85;
			const set = this.kv[f];
			const d = this.d;
			for (let i = 0; i < n; i++) {
				const s = outBack(seg(T, lerp(w[0], w[1], (i / n) * 0.6), lerp(w[0], w[1], (i / n) * 0.6 + 0.4)), 1.6);
				const x = 1.4 - 5.6 + (i / (n - 1)) * 11.2;
				const z = CZ + D / 2 + 0.56;
				const sc = Math.max(0.0001, s);
				d.scale.setScalar(sc);
				d.position.set(x - 0.2, 0.16, z);
				d.updateMatrix();
				set.k.setMatrixAt(i, d.matrix);
				d.position.set(x + 0.2, 0.16, z);
				d.updateMatrix();
				set.v.setMatrixAt(i, d.matrix);
			}
			d.scale.setScalar(1);
			set.k.instanceMatrix.needsUpdate = true;
			set.v.instanceMatrix.needsUpdate = true;
		});

		/* ---- the scores ---- */
		const rise = seg(T, BARS[0], BARS[1]);
		this.bars.visible = rise > 0;
		if (this.bars.visible && rise < 1.0001) {
			const d = this.d;
			const last = P[5][n - 1];
			this.barSpots.forEach((b, i) => {
				const dist = Math.hypot(b.x - last[0], b.z - last[1]);
				const k = outBack(seg(rise, Math.min(0.6, dist * 0.055), Math.min(0.6, dist * 0.055) + 0.4), 1.2);
				d.position.set(b.x, 0.01, CZ + b.z);
				d.scale.set(1, Math.max(0.0001, b.h * k), 1);
				d.updateMatrix();
				this.bars.setMatrixAt(i, d.matrix);
			});
			d.scale.set(1, 1, 1);
			this.bars.instanceMatrix.needsUpdate = true;
		}
		this.picks.forEach((p, i) => {
			const k = outBack(seg(T, PICKS[0] + i * 0.004, PICKS[0] + i * 0.004 + 0.022), 1.3);
			const h = Math.max(0.0001, p.h * Math.max(0, k));
			p.bar.scale.y = h;
			const sign = p.group.children[1];
			sign.scale.setScalar(Math.max(0.0001, Math.min(1, k * 1.2)));
			sign.position.set(0, h + 0.42, 0.32);
		});
		this.headSign.scale.setScalar(Math.max(0.0001, outBack(seg(T, BARS[0], BARS[0] + 0.02), 1.4)));

		// The pipe lays itself up from the floor as the stack goes up, so it is not there before anything can use it.
		const laid = inOut(seg(T, 14.62, 14.7));
		this.pipeMesh.visible = laid > 0;
		if (laid > 0) {
			const skip = Math.floor(((1 - laid) * this.pipeCount) / 84) * 84;
			this.pipeMesh.geometry.setDrawRange(skip, this.pipeCount - skip);
		}
		const pulse = seg(T, PULSE[0], PULSE[1]);
		this.pulse.visible = pulse > 0 && pulse < 1;
		if (this.pulse.visible) this.pulse.position.copy(this.pipe.getPointAt(inOut(pulse)));
		void time;
	}
}
