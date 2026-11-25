import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox, sharedRbox } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { createSign, plinth } from '../kit/parts';
import { arcPoint, panel, shadowOn } from '../kit/machines';
import { font, Label, Surface } from '../kit/print';
import { bezel, cores, craft, fan, fins, guards, loaf, loafBeads, louvre, pane, pipe } from '../kit/craft';
import { bell, inOut, outBack, outCubic, seg, smooth } from '../kit/math';

const W = 5.6;
const D = 3;
const X = 5.8;
const WIN_Y = 2.61;
/** The two rows of chips behind the window, either side of its middle. */
const ROW = 0.42;
const MOUTH_Y = 0.86;
/** The mouth's opening, a little lower than the tiles' line, so they slide in over its sill. */
const MOUTH = { y: 0.82, h: 0.6 };
/** How deep the tunnel into a pool's base goes, that its prompt tiles or its answer go in or come out of. */
const TUNNEL = 1.1;
/** The three parts of a pool, bottom to top: its cream base, its glass case, and its rounded cobalt hood. */
const BASE_TOP = 1.72;
const CASE = { y0: 1.76, y1: 3.46, front: D / 2 - 0.05, back: -D / 2 + 0.3 };
const HOOD = { y0: 3.46, y1: 5.1, r: 0.55 };
/** The port in a pool's inner side the KV cache crosses through: its top, and half its width; and the sleeve behind it. */
const PORT = { y1: 2.78, z: 0.6 };
const SLEEVE = 1.3;
/** Where the chips stand inside the case, and the board behind them. */
const CHIP_Z = D / 2 - 0.4;
/** The top of the hood, where the fans are. */
const TOP = HOOD.y1;
const RUN_Z = 3.1; // where the answer runs along, in front of everything
const RUN_END = -1.55;
const STRIP_Y = 1.4;
const BAR_LEN = 1.42;
const TABLE_Z = D / 2 + 0.98;
/** The first thing the model will write, in this story. Each piece is one token, leaving when its step is done. */
const WORDS = ['The', 'user', 'wants', 'the', 'race', 'condition', 'fixed', '.'];
const MEM_COLS = 8;
const MEM_ROWS = 3;

/**
 * A pool: three parts one over another. Its cream base carries the mouth or the slot and the gauges, in chrome bezels,
 * with guards on its corners and a chrome kick plate; on it a glass case in a chrome frame, the chips inside lit and
 * seen in depth; over that a rounded cobalt hood with its name, and what cools it on its roof. Coolant climbs its outer
 * side in clamps to the hood, and the fabric's cable comes up out of the floor into its back. On the side that faces
 * the other pool the case has a port, not glass: that's where the KV cache crosses. side: which side is its outer.
 */
function shell(name: string, strap: string, side: -1 | 1) {
	const m = mats();
	const c = craft();
	const group = new THREE.Group();
	const b = new Batch();
	plinth(b, W + 0.34, D + 0.34, 0.14);
	b.add(rbox(W + 0.4, 0.04, D + 0.4, 0.015, 1), c.chrome, { p: [0, 0.15, 0] });
	// The base, built round its opening: a tunnel TUNNEL deep, lined dark, that what goes in disappears into.
	const open = side < 0 ? { w: W - 0.6, y0: MOUTH.y - MOUTH.h / 2, y1: MOUTH.y + MOUTH.h / 2 } : { w: 1.2, y0: 0.53, y1: 1.05 };
	const back = D / 2 - TUNNEL;
	b.add(rbox(W, BASE_TOP - 0.14, back + D / 2, 0.12, 3), m.cream, { p: [0, (BASE_TOP + 0.14) / 2, (back - D / 2) / 2] });
	b.add(rbox(W, open.y0 - 0.14, TUNNEL + 0.1, 0.08, 2), m.cream, { p: [0, (open.y0 + 0.14) / 2, D / 2 - (TUNNEL + 0.1) / 2] });
	b.add(rbox(W, BASE_TOP - open.y1, TUNNEL + 0.1, 0.08, 2), m.cream, { p: [0, (BASE_TOP + open.y1) / 2, D / 2 - (TUNNEL + 0.1) / 2] });
	for (const s of [-1, 1]) b.add(rbox((W - open.w) / 2, open.y1 - open.y0, TUNNEL + 0.1, 0.06, 2), m.cream, { p: [s * (W / 2 - (W - open.w) / 4), (open.y0 + open.y1) / 2, D / 2 - (TUNNEL + 0.1) / 2] });
	b.add(rbox(open.w, open.y1 - open.y0, 0.04, 0.01, 1), m.recess, { p: [0, (open.y0 + open.y1) / 2, back + 0.03] });
	b.add(rbox(open.w, 0.02, TUNNEL, 0.005, 1), m.recess, { p: [0, open.y0 + 0.012, D / 2 - TUNNEL / 2] });
	b.add(rbox(open.w, 0.02, TUNNEL, 0.005, 1), m.recess, { p: [0, open.y1 - 0.012, D / 2 - TUNNEL / 2] });
	b.add(rbox(W + 0.04, 0.1, D + 0.04, 0.03, 2), c.chrome, { p: [0, 0.22, 0] });
	b.add(rbox(W + 0.06, 0.06, D + 0.06, 0.02, 1), c.chrome, { p: [0, BASE_TOP - 0.01, 0] });
	bezel(b, W - 0.6, 0.34, [0, STRIP_Y, D / 2], { t: 0.045, r: 0.06, depth: 0.05 });
	guards(b, W, D / 2, 0.36, BASE_TOP - 0.12, 0.06);
	// The case: a dark back and floor and ceiling, a board on the back, a strip of light along its top, and a chrome
	// frame along every edge.
	const cw = W - 0.2;
	const ch = CASE.y1 - CASE.y0;
	const cd = CASE.front - CASE.back;
	const cz = (CASE.front + CASE.back) / 2;
	const cy = (CASE.y0 + CASE.y1) / 2;
	b.add(rbox(cw, ch, 0.06, 0.02, 1), m.recess, { p: [0, cy, CASE.back + 0.03] });
	b.add(rbox(cw, 0.04, cd, 0.01, 1), m.recess, { p: [0, CASE.y0 + 0.02, cz] });
	b.add(new THREE.PlaneGeometry(cw - 0.3, ch - 0.2), c.board, { p: [0, cy, CHIP_Z - 0.05] });
	b.add(rbox(0.05, ch - 0.2, 0.06, 0.02, 1), c.gunmetal, { p: [-(cw - 0.3) / 2, cy, CHIP_Z - 0.07] });
	b.add(rbox(0.05, ch - 0.2, 0.06, 0.02, 1), c.gunmetal, { p: [(cw - 0.3) / 2, cy, CHIP_Z - 0.07] });
	b.add(rbox(cw - 0.3, 0.04, 0.06, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#d6e8ff' }), { p: [0, CASE.y1 - 0.06, CASE.front - 0.12] });
	const bar = 0.07;
	for (const x of [-cw / 2, cw / 2]) for (const z of [CASE.front, CASE.back]) b.add(rbox(bar, ch + bar, bar, 0.02, 1), c.chrome, { p: [x, cy, z] });
	for (const y of [CASE.y0, CASE.y1]) {
		for (const z of [CASE.front, CASE.back]) b.add(rbox(cw + bar, bar, bar, 0.02, 1), c.chrome, { p: [0, y, z] });
		for (const x of [-cw / 2, cw / 2]) b.add(rbox(bar, bar, cd, 0.02, 1), c.chrome, { p: [x, y, cz] });
	}
	// The inner side: a dark wall with a port in a chrome frame, the KV cache's way across, and behind the port a dark
	// sleeve the crates go into.
	const ix = -side * (cw / 2 - 0.02);
	b.add(rbox(0.04, CASE.y1 - PORT.y1, cd, 0.01, 1), m.recess, { p: [ix, (CASE.y1 + PORT.y1) / 2, cz] });
	b.add(rbox(0.04, PORT.y1 - CASE.y0, CASE.front - PORT.z, 0.01, 1), m.recess, { p: [ix, (PORT.y1 + CASE.y0) / 2, (CASE.front + PORT.z) / 2] });
	b.add(rbox(0.04, PORT.y1 - CASE.y0, -PORT.z - CASE.back, 0.01, 1), m.recess, { p: [ix, (PORT.y1 + CASE.y0) / 2, (CASE.back - PORT.z) / 2] });
	const sx = -side * (cw / 2 - SLEEVE / 2);
	b.add(rbox(SLEEVE, 0.04, PORT.z * 2, 0.01, 1), m.recess, { p: [sx, PORT.y1, 0] });
	for (const z of [-PORT.z, PORT.z]) b.add(rbox(SLEEVE, PORT.y1 - CASE.y0, 0.04, 0.01, 1), m.recess, { p: [sx, (PORT.y1 + CASE.y0) / 2, z] });
	b.add(rbox(0.04, PORT.y1 - CASE.y0, PORT.z * 2, 0.01, 1), m.recess, { p: [-side * (cw / 2 - SLEEVE), (PORT.y1 + CASE.y0) / 2, 0] });
	const pf = new THREE.Shape();
	pf.moveTo(-PORT.z - 0.1, CASE.y0);
	pf.lineTo(PORT.z + 0.1, CASE.y0);
	pf.lineTo(PORT.z + 0.1, PORT.y1 + 0.1);
	pf.lineTo(-PORT.z - 0.1, PORT.y1 + 0.1);
	pf.closePath();
	const ph = new THREE.Path();
	ph.moveTo(-PORT.z, CASE.y0);
	ph.lineTo(PORT.z, CASE.y0);
	ph.lineTo(PORT.z, PORT.y1);
	ph.lineTo(-PORT.z, PORT.y1);
	ph.closePath();
	pf.holes.push(ph);
	b.add(new THREE.ExtrudeGeometry(pf, { depth: 0.05, bevelEnabled: false }).rotateY(Math.PI / 2), c.chrome, { p: [-side * (cw / 2 + 0.045), 0, 0] });
	// The hood: its chrome lip where it meets the case, a chrome bead along each rounded top edge, its name in a
	// framed panel on its front, and louvres in its ends.
	b.add(loaf(W, D, HOOD.y1 - HOOD.y0, HOOD.r), m.cobalt, { p: [0, HOOD.y0, 0] });
	b.add(rbox(W + 0.06, 0.05, D + 0.06, 0.02, 1), c.chrome, { p: [0, HOOD.y0 + 0.02, 0] });
	loafBeads(b, W, D, HOOD.y1, HOOD.r);
	bezel(b, W - 0.7, 0.98, [0, 4.02, D / 2], { t: 0.05, r: 0.16, depth: 0.04 });
	for (const s of [-1, 1] as const) louvre(b, s, [s * (W / 2 + 0.035), 4.0, 0], 0.7, D - 1.2, 6);
	// The base: two side panels with vents, and a seam where its front panel meets its sides.
	for (const s of [-1, 1] as const) louvre(b, s, [s * (W / 2 + 0.005), 0.95, 0], 0.7, D - 1.0, 5);
	for (const s of [-1, 1]) b.add(rbox(0.03, BASE_TOP - 0.5, 0.03, 0.01, 1), m.recess, { p: [s * (W / 2 - 0.22), (BASE_TOP + 0.3) / 2, D / 2 + 0.005] });
	// Coolant up the outer side, into the hood.
	const ox = side * (W / 2 + 0.16);
	for (const z of [-0.55, -0.9]) pipe(b, [[ox, 0.2, z], [ox, 2.6, z], [ox, HOOD.y0 + 0.3, z], [ox - side * 0.12, HOOD.y0 + 0.6, z], [ox - side * 0.17, HOOD.y0 + 0.7, z]], 0.07, c.coolant, 0.8);
	// The fabric's cable, out of the floor and into its back.
	pipe(b, [[0.6, 0.02, -D / 2 - 1.6], [0.6, 0.12, -D / 2 - 0.8], [0.6, 0.9, -D / 2 - 0.2], [0.6, 1.1, -D / 2 + 0.05]], 0.09, m.orangeGlow, 9);
	group.add(b.build(`pool-${name}`));
	group.add(pane(cw, ch, [0, cy, CASE.front + 0.04], 0.02));
	const sideGlass = pane(cd, ch, [0, 0, 0], 0.02);
	sideGlass.position.set(side * (cw / 2 + 0.04), cy, cz);
	sideGlass.rotation.y = side * (Math.PI / 2);
	group.add(sideGlass);
	// Fitted: there's no room between the hood's top and the line printed under it.
	const sign = createSign(name, 0.34, undefined, undefined, true);
	sign.position.set(-0.05, 4.24, D / 2 + 0.04);
	group.add(sign);
	const l = new Label(strap, 0.24, { color: '#ffffff', weight: 700, font: font.sans });
	l.mesh.position.set(0, 3.7, D / 2 + 0.006);
	group.add(l.mesh);
	return group;
}

/** Two gauges on the front of a pool: what's holding it back is the one that hits the end. */
function gauges(parent: THREE.Object3D) {
	const m = mats();
	const b = new Batch();
	b.add(rbox(W - 0.6, 0.34, 0.03, 0.04, 2), m.recess, { p: [0, STRIP_Y, D / 2 + 0.012] });
	for (const x of [-1.5, 0.86]) b.add(rbox(BAR_LEN, 0.12, 0.012, 0.02, 1), m.steelSoft, { p: [x + BAR_LEN / 2, STRIP_Y, D / 2 + 0.026] });
	parent.add(b.build('gauges'));
	const bar = rbox(1, 0.12, 0.02, 0.02, 1).clone();
	bar.translate(0.5, 0, 0);
	const fill = (x: number, hex: string) => {
		const mesh = new THREE.Mesh(bar, new THREE.MeshBasicMaterial({ color: hex }));
		mesh.position.set(x, STRIP_Y, D / 2 + 0.046);
		mesh.scale.x = 0.001;
		parent.add(mesh);
		return mesh;
	};
	([['Compute', -2.36], ['Memory', 0.04]] as const).forEach(([text, x]) => {
		const l = new Label(text, 0.15, { color: '#ffffff', weight: 700, font: font.sans, align: 'left' });
		l.mesh.position.set(x, STRIP_Y, D / 2 + 0.03);
		parent.add(l.mesh);
	});
	return { compute: fill(-1.5, '#7cc4ff'), memory: fill(0.86, '#3fe583') };
}

/** One token of the answer: a block with its text on the front, since from this low you can't read a top. */
function wordBlock(text: string) {
	const m = mats();
	const width = Math.max(0.6, Math.min(1.1, text.length * 0.125 + 0.2));
	const group = new THREE.Group();
	const body = new THREE.Mesh(rbox(width, 0.34, 0.42, 0.05, 3), m.amber);
	body.castShadow = true;
	group.add(body);
	const H = 100;
	const s = new Surface(Math.round((H * (width - 0.06)) / 0.28), H);
	s.draw((c, w, h) => {
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillStyle = color.ink;
		let size = 58;
		c.font = `600 ${size}px ${font.mono}`;
		while (c.measureText(text).width > w - 12) c.font = `600 ${--size}px ${font.mono}`;
		c.fillText(text, w / 2, h * 0.52);
	});
	const face = panel(width - 0.06, 0.28, s);
	face.position.z = 0.212;
	group.add(face);
	group.visible = false;
	return { group, width };
}

/** Reading the prompt and writing the answer are different jobs, so they get different machines. */
export class Pools {
	group = new THREE.Group();
	private dies: THREE.MeshStandardMaterial;
	/** The fans on the crowns: the prefill's two, then the decode's one. */
	private fans: THREE.Object3D[] = [];
	private spin = [0, 0, 0];
	private lastTime = 0;
	/** The decode's reading head: a bar of light that sweeps through all of its memory, once per token. */
	private head: THREE.Mesh;
	private decodeFan: THREE.Object3D;
	private readLamp: Lamp;
	private feed: THREE.InstancedMesh;
	private feedNext: THREE.InstancedMesh;
	private feedFrom: THREE.Vector3[] = [];
	private feedTo: THREE.Vector3[] = [];
	private crates: THREE.Group[] = [];
	private memory: THREE.InstancedMesh;
	private memoryMat: THREE.MeshPhysicalMaterial;
	private words: { group: THREE.Group; x: number }[] = [];
	private writeLamp: Lamp;
	private readGauge: ReturnType<typeof gauges>;
	private writeGauge: ReturnType<typeof gauges>;
	private yours: THREE.Group;
	private d = new THREE.Object3D();
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();

	constructor() {
		const m = mats();

		/* ---- prefill: wide open, full of compute ---- */
		const pre = shell('Prefill pool', 'All at once. Limited by compute.', -1);
		pre.position.x = -X;
		this.group.add(pre);
		shadowOn(this.group, -X, 0, 0, W + 0.4, D + 0.4);
		const pb = new Batch();
		// A mouth as wide as the machine, in a chrome bezel with a sill the tiles slide in over.
		bezel(pb, W - 0.6, MOUTH.h, [0, MOUTH.y, D / 2], { t: 0.07, r: 0.06, depth: 0.06 });
		// The crown: two fans over the chips, which spin up as every chip fires at once.
		for (const fx of [-1.25, 1.25]) this.fans.push(fan(pb, 0.62, [fx, TOP + 0.28, 0]));
		// The table the whole prompt waits on.
		pb.add(rbox(W - 0.5, 0.1, 1.7, 0.03, 2), m.steelSoft, { p: [0, MOUTH_Y - 0.36, TABLE_Z] });
		for (const s of [-1, 1]) pb.add(rbox(0.14, MOUTH_Y - 0.36, 0.14, 0.03, 2), m.steelSoft, { p: [s * (W / 2 - 0.5), (MOUTH_Y - 0.36) / 2, TABLE_Z + 0.6] });
		// Chips: big compute dies, each with a little memory beside it.
		const hbm = new Batch();
		// Each die is a grid of cores, dark until it fires, and then every core lights.
		const coreMap = cores();
		this.dies = new THREE.MeshStandardMaterial({ map: coreMap, emissiveMap: coreMap, color: '#ffffff', emissive: '#8fd0ff', emissiveIntensity: 0.05, roughness: 0.25, metalness: 0.2 });
		const die = rbox(0.82, 0.66, 0.05, 0.05, 2);
		const dieMesh = new THREE.InstancedMesh(die, this.dies, 8);
		for (let r = 0; r < 2; r++) {
			for (let c = 0; c < 4; c++) {
				const x = (c - 1.5) * 1.22 - 0.1;
				const y = WIN_Y + (r === 0 ? ROW : -ROW);
				this.d.position.set(x, y, CHIP_Z);
				this.d.updateMatrix();
				dieMesh.setMatrixAt(r * 4 + c, this.d.matrix);
				hbm.add(rbox(0.16, 0.66, 0.05, 0.03, 2), m.hbm, { p: [x + 0.53, y, CHIP_Z] });
				// Each chip on its own package, with a row of tiny capacitors under it.
				hbm.add(rbox(1.16, 0.76, 0.03, 0.02, 1), craft().gunmetal, { p: [x + 0.08, y, CHIP_Z - 0.035] });
				for (let k = 0; k < 5; k++) hbm.add(rbox(0.06, 0.03, 0.03, 0.008, 1), m.gold, { p: [x - 0.3 + k * 0.15, y - 0.36, CHIP_Z] });
			}
		}
		pre.add(pb.build('prefill-parts'), dieMesh, hbm.build('prefill-hbm'), ...this.fans);
		this.readLamp = new Lamp(sharedRbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.2);
		this.readLamp.mesh.position.set(W / 2 - 0.4, 4.14, D / 2 + 0.03);
		pre.add(this.readLamp.mesh);
		this.readGauge = gauges(pre);

		// Your prompt, as many tiles as fit. They arrive together and go in together.
		const tile = rbox(0.5, 0.12, 0.42, 0.04, 2);
		this.feed = new THREE.InstancedMesh(tile, m.amber, 8 * 3);
		this.feed.frustumCulled = false;
		this.feed.castShadow = true;
		// And then somebody else's, which is the whole reason for having two machines.
		this.feedNext = new THREE.InstancedMesh(tile, new THREE.MeshPhysicalMaterial({ color: '#9fb2d6', roughness: 0.34, clearcoat: 0.7 }), 8 * 3);
		this.feedNext.frustumCulled = false;
		this.feedNext.castShadow = true;
		for (let r = 0; r < 3; r++) {
			for (let c = 0; c < 8; c++) {
				this.feedTo.push(new THREE.Vector3(-X + (c - 3.5) * 0.62, MOUTH_Y - 0.25, TABLE_Z + (r - 1) * 0.5));
				this.feedFrom.push(new THREE.Vector3(-X - 14 + c * 0.55 + r * 4.4, 0.26 + 0.06, 6.3));
			}
		}
		this.group.add(this.feed, this.feedNext);
		// Fitted: it lies in the pool's mouth, which has no room for a bigger one.
		this.yours = createSign('Your prompt is in here', 0.2, undefined, undefined, true);
		this.yours.position.set(-X, MOUTH_Y - 0.08, TABLE_Z);
		this.yours.visible = false;
		this.group.add(this.yours);

		/* ---- the bridge: KV blocks crossing over RDMA ---- */
		const rail = new Batch();
		const gap = X - W / 2;
		rail.add(rbox(gap * 2 + 0.2, 0.12, 1.1, 0.04, 2), m.steelSoft, { p: [0, 1.72, 0] });
		for (const s of [-1, 1]) rail.add(rbox(gap * 2 + 0.2, 0.12, 0.08, 0.03, 2), m.steel, { p: [0, 1.82, s * 0.56] });
		for (const s of [-1, 1]) rail.add(rbox(0.2, 1.62, 0.2, 0.05, 2), m.steelSoft, { p: [s * 1.5, 0.81, 0] });
		this.group.add(rail.build('rdma'));
		for (const s of [-1, 1]) shadowOn(this.group, s * 1.5, 0, 0, 0.5, 0.5, 0.3);
		const bridge = createSign('KV cache, over RDMA', 0.24, undefined, undefined, true);
		// Bolted to the front of the bridge, overlapping its edge.
		bridge.position.set(0, 1.31, 0.59);
		this.group.add(bridge);
		const crateGeo = rbox(1.1, 0.74, 0.86, 0.08, 3);
		for (let i = 0; i < 3; i++) {
			const crate = new THREE.Group();
			const body = new THREE.Mesh(crateGeo, m.hbm);
			body.castShadow = true;
			crate.add(body);
			const label = new Label('KV', 0.32, { color: '#06351c', weight: 800 });
			label.mesh.position.z = 0.436;
			crate.add(label.mesh);
			crate.visible = false;
			this.group.add(crate);
			this.crates.push(crate);
		}

		/* ---- decode: full of memory, one narrow way out ---- */
		const dec = shell('Decode pool', 'One at a time. Limited by memory.', 1);
		dec.position.x = X;
		this.group.add(dec);
		shadowOn(this.group, X, 0, 0, W + 0.4, D + 0.4);
		this.memoryMat = (m.hbm as THREE.MeshPhysicalMaterial).clone();
		// Memory, printed as rows of cells, so the head's sweep reads as reading it.
		const cellMap = cores(8, 6, '#7dffb4', '#0c3a26');
		this.memoryMat.map = cellMap;
		this.memoryMat.emissiveMap = cellMap;
		this.memoryMat.color.set('#ffffff');
		this.memoryMat.emissive.set('#5cffa4');
		this.memory = new THREE.InstancedMesh(rbox(0.54, 0.46, 0.05, 0.05, 2), this.memoryMat, MEM_COLS * MEM_ROWS);
		this.memory.frustumCulled = false;
		dec.add(this.memory);
		const db = new Batch();
		// A slot one token wide, in a chrome bezel, and a run of track leading away from it, back toward the middle where
		// it's in plain sight.
		bezel(db, 1.2, 0.52, [0, 0.79, D / 2], { t: 0.07, r: 0.06, depth: 0.06 });
		// The crown: one fan, and a tall heat sink over the memory, which runs warm.
		this.decodeFan = fan(db, 0.55, [-1.3, TOP + 0.28, 0]);
		fins(db, 2.0, D - 0.9, 0.42, 16, [1.05, TOP + 0.14, 0]);
		dec.add(db.build('decode-parts'), this.decodeFan);
		// The head: a lit bar on a chrome carriage, in front of the memory, behind the glass.
		this.head = new THREE.Mesh(rbox(W - 0.9, 0.05, 0.04, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#c8ffe0' }));
		this.head.position.set(0, WIN_Y, CHIP_Z + 0.12);
		dec.add(this.head);
		this.writeGauge = gauges(dec);
		const track = new Batch();
		track.add(rbox(1.2, 0.06, RUN_Z + 0.45 - D / 2, 0.02, 1), m.rubber, { p: [X, 0.62, (RUN_Z + 0.45 + D / 2) / 2] });
		const runLen = X + 0.6 - RUN_END;
		track.add(rbox(runLen, 0.06, 0.9, 0.02, 1), m.rubber, { p: [RUN_END + runLen / 2, 0.62, RUN_Z] });
		for (const x of [RUN_END + 0.5, 1.4, 4.2, X]) track.add(rbox(0.16, 0.6, 0.16, 0.03, 2), m.steelSoft, { p: [x, 0.3, RUN_Z] });
		track.add(rbox(0.16, 0.6, 0.16, 0.03, 2), m.steelSoft, { p: [X, 0.3, D / 2 + 0.3] });
		this.group.add(track.build('decode-track'));
		this.writeLamp = new Lamp(sharedRbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.2);
		this.writeLamp.mesh.position.set(W / 2 - 0.4, 4.14, D / 2 + 0.03);
		dec.add(this.writeLamp.mesh);
		let x = RUN_END + 0.2;
		for (const text of WORDS) {
			const { group, width } = wordBlock(text);
			this.group.add(group);
			this.words.push({ group, x: x + width / 2 });
			x += width + 0.05;
		}
	}

	/** Tiles leave the belt from the front of the line first, so none has to pass over one still waiting. */
	private runFeed(mesh: THREE.InstancedMesh, k: number) {
		const d = this.d;
		this.feedTo.forEach((to, i) => {
			const delay = (1 - i / 23) * 0.2;
			const fly = seg(k, delay, delay + 0.3);
			const inside = inOut(seg(k, 0.5, 0.68));
			// Each row flies at its own height, so no two can meet in the air.
			arcPoint(this.feedFrom[i], to, 2.2 + Math.floor(i / 8) * 0.55, inOut(fly), this.a);
			this.a.z -= inside * (TUNNEL + 0.1);
			d.position.copy(this.a);
			d.scale.setScalar(k > 0 && inside < 1 ? 1 : 0.0001);
			d.updateMatrix();
			mesh.setMatrixAt(i, d.matrix);
		});
		d.scale.setScalar(1);
		mesh.instanceMatrix.needsUpdate = true;
	}

	/** read: your prompt goes in, every chip fires. cross: KV blocks move across. write: decode ticks. next: someone else's prompt, while decode carries on. here: where we go next. */
	update(read: number, cross: number, write: number, next: number, here: number, time: number) {
		const d = this.d;
		this.runFeed(this.feed, read);
		this.runFeed(this.feedNext, next);

		// Every chip, at the same moment. Whichever prompt it is, it's compute that runs out.
		const firing = Math.max(bell(read, 0.62, 1.02), bell(next, 0.62, 1.02));
		this.dies.emissiveIntensity = 0.05 + firing * (1.5 + Math.sin(time * 16) * 0.35) + smooth(here) * 0.55;
		this.readLamp.mix(color.amber, color.green, smooth(seg(read, 0.65, 1)), 0.2 + firing);
		this.readGauge.compute.scale.x = Math.max(0.001, BAR_LEN * (0.06 + 0.94 * firing));
		this.readGauge.memory.scale.x = Math.max(0.001, BAR_LEN * (0.05 + 0.2 * firing));
		this.yours.visible = here > 0;
		if (here > 0) this.yours.scale.setScalar(Math.max(0.001, outBack(here, 2)));

		this.crates.forEach((crate, i) => {
			const u = seg(cross, i * 0.22, i * 0.22 + 0.5);
			crate.visible = u > 0 && u < 1;
			if (!crate.visible) return;
			// Out of the prefill's sleeve, across the bridge, and into the decode's, where it's gone in the dark.
			const end = X - (W - 0.2) / 2 + 0.7;
			crate.position.set(-end + inOut(u) * end * 2, 2.2, 0);
		});

		// The shelves fill as the crates arrive.
		const filled = cross * (MEM_COLS * MEM_ROWS);
		for (let r = 0; r < MEM_ROWS; r++) {
			for (let c = 0; c < MEM_COLS; c++) {
				const idx = r * MEM_COLS + c;
				const s = smooth(seg(filled, idx - 4, idx + 1));
				d.position.set((c - (MEM_COLS - 1) / 2) * 0.62, WIN_Y + (1 - r) * 0.54, CHIP_Z);
				d.scale.setScalar(Math.max(0.0001, s));
				d.updateMatrix();
				this.memory.setMatrixAt(idx, d.matrix);
			}
		}
		d.scale.setScalar(1);
		this.memory.instanceMatrix.needsUpdate = true;

		// One token per tick, and every tick reads the whole of memory.
		const p = write * WORDS.length;
		const tick = p % 1;
		const ticking = write > 0 && write < 1;
		const read1 = ticking ? bell(tick, 0, 0.6) : 0;
		this.memoryMat.emissiveIntensity = 0.3 + read1 * 1.1;
		this.writeLamp.mix(color.amber, color.green, write > 0 ? 1 : 0, 0.2 + read1);
		this.writeGauge.memory.scale.x = Math.max(0.001, BAR_LEN * (0.06 + (cross > 0.9 ? 0.14 : 0) + 0.8 * read1));
		this.writeGauge.compute.scale.x = Math.max(0.001, BAR_LEN * (0.05 + (ticking ? 0.22 : 0)));

		// The prefill's fans spin up while its chips fire; the decode's turns steadily while it works. The head sweeps down
		// through all of the memory once for every token.
		const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
		this.lastTime = time;
		this.spin[0] += dt * (1.2 + firing * 22);
		this.spin[1] += dt * (1.3 + firing * 21);
		this.spin[2] += dt * (1.2 + (ticking ? 7 : 0));
		this.fans[0].rotation.y = this.spin[0];
		this.fans[1].rotation.y = this.spin[1];
		this.decodeFan.rotation.y = this.spin[2];
		this.head.visible = ticking;
		this.head.position.y = WIN_Y + 0.8 - smooth(Math.min(1, tick / 0.6)) * 1.5;
		const toRun = RUN_Z - (D / 2 - 0.3);
		this.words.forEach(({ group, x }, i) => {
			group.visible = p > i;
			if (!group.visible) return;
			// Out of the slot, round the corner, along the run, up to the one before it.
			const along = X - x;
			const dist = outCubic(seg(p, i, i + 0.9)) * (toRun + along);
			if (dist < toRun) group.position.set(X, 0.82, D / 2 - 0.3 + dist);
			else group.position.set(X - (dist - toRun), 0.82, RUN_Z);
		});
	}
}
