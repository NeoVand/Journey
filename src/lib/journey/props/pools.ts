import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { createSign, plinth, ventX } from '../kit/parts';
import { arcPoint, panel, shadowOn } from '../kit/machines';
import { font, Label, Surface } from '../kit/print';
import { bell, inOut, outBack, outCubic, seg, smooth } from '../kit/math';

const W = 5.6;
const H = 4.7;
const D = 3;
const X = 5.8;
const WIN_Y = 2.55;
const WIN_H = 1.94;
const MOUTH_Y = 0.86;
const RUN_Z = 3.1; // where the answer runs along, in front of everything
const RUN_END = -1.55;
const STRIP_Y = 1.38;
const BAR_LEN = 1.42;
const TABLE_Z = D / 2 + 0.98;
/** The first thing the model will write, in this story. Each piece is one token, leaving when its step is done. */
const WORDS = ['The', 'user', 'wants', 'the', 'race', 'condition', 'fixed', '.'];
const MEM_COLS = 8;
const MEM_ROWS = 3;

function shell(name: string, strap: string) {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	plinth(b, W + 0.34, D + 0.34, 0.14);
	b.add(extrude(chamferRect(W, H, 0.42, 0.14), D, 0.09, 6, 10), m.cobalt, { p: [0, 0.14 + H / 2, 0] });
	// A window onto what is inside, because that is the whole difference between them.
	b.add(extrude(roundedRect(W - 0.6, WIN_H, 0.14), 0.05, 0.016, 2, 8), m.recess, { p: [0, WIN_Y, D / 2 + 0.012] });
	group.add(b.build(`pool-${name}`));
	const sign = createSign(name, 0.34);
	sign.position.set(-0.05, 4.16, D / 2 + 0.04);
	group.add(sign);
	const l = new Label(strap, 0.25, { color: '#ffffff', weight: 700, font: font.sans });
	l.mesh.position.set(0, 3.68, D / 2 + 0.006);
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
		mesh.position.set(x, STRIP_Y, D / 2 + 0.036);
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
		const pre = shell('Prefill pool', 'All at once. Limited by compute.');
		pre.position.x = -X;
		this.group.add(pre);
		shadowOn(this.group, -X, 0, 0, W + 0.4, D + 0.4);
		const pb = new Batch();
		// A mouth as wide as the machine.
		pb.add(rbox(W - 0.6, 0.64, 0.05, 0.03, 2), m.recess, { p: [0, MOUTH_Y, D / 2 + 0.006] });
		// The table the whole prompt waits on.
		pb.add(rbox(W - 0.5, 0.1, 1.7, 0.03, 2), m.steelSoft, { p: [0, MOUTH_Y - 0.36, TABLE_Z] });
		for (const s of [-1, 1]) pb.add(rbox(0.14, MOUTH_Y - 0.36, 0.14, 0.03, 2), m.steelSoft, { p: [s * (W / 2 - 0.5), (MOUTH_Y - 0.36) / 2, TABLE_Z + 0.6] });
		// Chips: big compute dies, each with a little memory beside it.
		const hbm = new Batch();
		this.dies = new THREE.MeshStandardMaterial({ color: '#2a5fd8', emissive: '#6fc0ff', emissiveIntensity: 0.05, roughness: 0.4 });
		const die = rbox(0.82, 0.66, 0.05, 0.05, 2);
		const dieMesh = new THREE.InstancedMesh(die, this.dies, 8);
		for (let r = 0; r < 2; r++) {
			for (let c = 0; c < 4; c++) {
				const x = (c - 1.5) * 1.22 - 0.1;
				const y = WIN_Y + (0.5 - r) * 0.9;
				this.d.position.set(x, y, D / 2 + 0.07);
				this.d.updateMatrix();
				dieMesh.setMatrixAt(r * 4 + c, this.d.matrix);
				hbm.add(rbox(0.16, 0.66, 0.05, 0.03, 2), m.hbm, { p: [x + 0.53, y, D / 2 + 0.07] });
			}
		}
		pre.add(pb.build('prefill-parts'), dieMesh, hbm.build('prefill-hbm'));
		this.readLamp = new Lamp(rbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.2);
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
		this.yours = createSign('Your prompt is in here', 0.2);
		this.yours.position.set(-X, MOUTH_Y - 0.08, TABLE_Z);
		this.yours.visible = false;
		this.group.add(this.yours);

		/* ---- the bridge: KV blocks crossing over RDMA ---- */
		const rail = new Batch();
		const gap = X - W / 2;
		rail.add(rbox(gap * 2 + 0.2, 0.12, 1.1, 0.04, 2), m.steelSoft, { p: [0, 1.6, 0] });
		for (const s of [-1, 1]) rail.add(rbox(gap * 2 + 0.2, 0.12, 0.08, 0.03, 2), m.steel, { p: [0, 1.7, s * 0.56] });
		for (const s of [-1, 1]) rail.add(rbox(0.2, 1.5, 0.2, 0.05, 2), m.steelSoft, { p: [s * 1.5, 0.75, 0] });
		this.group.add(rail.build('rdma'));
		for (const s of [-1, 1]) shadowOn(this.group, s * 1.5, 0, 0, 0.5, 0.5, 0.3);
		const bridge = createSign('KV cache, over RDMA', 0.24);
		bridge.position.set(0, 1.18, 0.62);
		this.group.add(bridge);
		const mouths = new Batch();
		for (const s of [-1, 1]) mouths.add(rbox(0.05, 0.98, 1.2, 0.03, 2), m.recess, { p: [s * gap, 2.16, 0] });
		this.group.add(mouths.build('rdma-mouths'));
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
		const dec = shell('Decode pool', 'One at a time. Limited by memory.');
		dec.position.x = X;
		this.group.add(dec);
		shadowOn(this.group, X, 0, 0, W + 0.4, D + 0.4);
		this.memoryMat = (m.hbm as THREE.MeshPhysicalMaterial).clone();
		this.memory = new THREE.InstancedMesh(rbox(0.54, 0.5, 0.05, 0.05, 2), this.memoryMat, MEM_COLS * MEM_ROWS);
		this.memory.frustumCulled = false;
		dec.add(this.memory);
		const db = new Batch();
		ventX(db, W / 2 + 0.002, 2.4, 0, 2, 1.7, 9);
		// A slot one token wide, and a run of track leading away from it, back toward the middle where it's in plain sight.
		db.add(rbox(1.2, 0.52, 0.05, 0.03, 2), m.recess, { p: [0, 0.79, D / 2 + 0.006] });
		dec.add(db.build('decode-parts'));
		this.writeGauge = gauges(dec);
		const track = new Batch();
		track.add(rbox(1.2, 0.06, RUN_Z + 0.45 - D / 2, 0.02, 1), m.rubber, { p: [X, 0.62, (RUN_Z + 0.45 + D / 2) / 2] });
		const runLen = X + 0.6 - RUN_END;
		track.add(rbox(runLen, 0.06, 0.9, 0.02, 1), m.rubber, { p: [RUN_END + runLen / 2, 0.62, RUN_Z] });
		for (const x of [RUN_END + 0.5, 1.4, 4.2, X]) track.add(rbox(0.16, 0.6, 0.16, 0.03, 2), m.steelSoft, { p: [x, 0.3, RUN_Z] });
		track.add(rbox(0.16, 0.6, 0.16, 0.03, 2), m.steelSoft, { p: [X, 0.3, D / 2 + 0.3] });
		this.group.add(track.build('decode-track'));
		this.writeLamp = new Lamp(rbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.2);
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
			arcPoint(this.feedFrom[i], to, 2.2, inOut(fly), this.a);
			this.a.z -= inside * 3.2;
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
			crate.position.set(-(X - W / 2) + inOut(u) * (X - W / 2) * 2, 2.08, 0);
		});

		// The shelves fill as the crates arrive.
		const filled = cross * (MEM_COLS * MEM_ROWS);
		for (let r = 0; r < MEM_ROWS; r++) {
			for (let c = 0; c < MEM_COLS; c++) {
				const idx = r * MEM_COLS + c;
				const s = smooth(seg(filled, idx - 4, idx + 1));
				d.position.set((c - (MEM_COLS - 1) / 2) * 0.62, WIN_Y + (1 - r) * 0.58, D / 2 + 0.07);
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
