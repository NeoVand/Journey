import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { createSign, plinth, ventX } from '../kit/parts';
import { arcPoint, shadowOn } from '../kit/machines';
import { font, Label } from '../kit/print';
import { bell, hash, inOut, seg, smooth } from '../kit/math';

const W = 5.6;
const H = 4.7;
const D = 3;
const X = 5.8;
const WIN_Y = 2.55;
const WIN_H = 1.94;
const MOUTH_Y = 0.86;
const TOKENS_X = 9;
const TOKENS_Z = 3;
const TABLE_Z = D / 2 + 0.98;
const OUT = 8;
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

/** Reading the prompt and writing the answer are different jobs, so they get different machines. */
export class Pools {
	group = new THREE.Group();
	private dies: THREE.MeshStandardMaterial;
	private readLamp: Lamp;
	private feed: THREE.InstancedMesh;
	private feedFrom: THREE.Vector3[] = [];
	private feedTo: THREE.Vector3[] = [];
	private crates: THREE.Group[] = [];
	private memory: THREE.InstancedMesh;
	private memoryMat: THREE.MeshPhysicalMaterial;
	private out: THREE.Mesh[] = [];
	private writeLamp: Lamp;
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
		ventX(pb, -W / 2 - 0.002 + W + 0.004, 2.4, 0, 2, 1.7, 9);
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

		// Your prompt, as many tiles as fit. They arrive together and go in together.
		const tile = rbox(0.5, 0.12, 0.42, 0.04, 2);
		this.feed = new THREE.InstancedMesh(tile, m.amber, 8 * 3);
		this.feed.frustumCulled = false;
		this.feed.castShadow = true;
		for (let r = 0; r < 3; r++) {
			for (let c = 0; c < 8; c++) {
				this.feedTo.push(new THREE.Vector3(-X + (c - 3.5) * 0.62, MOUTH_Y - 0.25, TABLE_Z + (r - 1) * 0.5));
				this.feedFrom.push(new THREE.Vector3(-X - 14 + c * 0.55 + r * 4.4, 0.26 + 0.06, TOKENS_Z + 3.3));
			}
		}
		this.group.add(this.feed);

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
		// A slot one tile wide, and a narrow run of track leading away from it.
		db.add(rbox(0.86, 0.42, 0.05, 0.03, 2), m.recess, { p: [0, MOUTH_Y - 0.14, D / 2 + 0.006] });
		dec.add(db.build('decode-parts'));
		const track = new Batch();
		track.add(rbox(0.9, 0.06, 1.7, 0.02, 1), m.rubber, { p: [X, 0.62, D / 2 + 0.85] });
		track.add(rbox(3.2, 0.06, 0.9, 0.02, 1), m.rubber, { p: [X + 1.15, 0.62, TOKENS_Z + 0.1] });
		for (const [x, z] of [[X - 0.3, TOKENS_Z + 0.1], [X + 2.5, TOKENS_Z + 0.1]] as const) track.add(rbox(0.16, 0.6, 0.16, 0.03, 2), m.steelSoft, { p: [x, 0.3, z] });
		track.add(rbox(0.16, 0.6, 0.16, 0.03, 2), m.steelSoft, { p: [X, 0.3, D / 2 + 0.3] });
		this.group.add(track.build('decode-track'));
		this.writeLamp = new Lamp(rbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.2);
		this.writeLamp.mesh.position.set(W / 2 - 0.4, 4.14, D / 2 + 0.03);
		dec.add(this.writeLamp.mesh);
		const one = rbox(0.62, 0.14, 0.5, 0.04, 2);
		for (let i = 0; i < OUT; i++) {
			const mesh = new THREE.Mesh(one, m.amber);
			mesh.castShadow = true;
			mesh.visible = false;
			this.group.add(mesh);
			this.out.push(mesh);
		}
		void TOKENS_X;
	}

	/** read: the prompt goes in, every chip fires. cross: KV blocks move across. write: decode ticks. */
	update(read: number, cross: number, write: number, time: number) {
		const d = this.d;
		this.feedTo.forEach((to, i) => {
			const delay = hash(i * 1.7) * 0.5;
			const k = seg(read, delay * 0.4, delay * 0.4 + 0.3);
			const inside = inOut(seg(read, 0.5, 0.68));
			arcPoint(this.feedFrom[i], to, 1.4, inOut(k), this.a);
			this.a.z -= inside * 3.2;
			d.position.copy(this.a);
			d.scale.setScalar(read > 0 && inside < 1 ? 1 : 0.0001);
			d.updateMatrix();
			this.feed.setMatrixAt(i, d.matrix);
		});
		d.scale.setScalar(1);
		this.feed.instanceMatrix.needsUpdate = true;

		// Every chip, at the same moment.
		const firing = bell(read, 0.62, 1.02);
		this.dies.emissiveIntensity = 0.05 + firing * (1.5 + Math.sin(time * 16) * 0.35);
		this.readLamp.mix(color.amber, color.green, smooth(seg(read, 0.65, 1)), 0.2 + firing);

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

		// One tile per tick, and every tick reads the whole of memory.
		const p = write * OUT;
		const tick = p % 1;
		this.memoryMat.emissiveIntensity = 0.3 + (write > 0 && write < 1 ? bell(tick, 0, 0.6) * 1.1 : 0);
		this.writeLamp.mix(color.amber, color.green, write > 0 ? 1 : 0, 0.2 + (write > 0 && write < 1 ? bell(tick, 0, 0.6) : 0));
		this.out.forEach((mesh, i) => {
			const k = Math.min(1, Math.max(0, (p - i) / (OUT - i)));
			mesh.visible = p > i;
			if (!mesh.visible) return;
			// Out of the slot, round the corner, along the run. Each stops behind the one before.
			const end = 1 - i / OUT;
			const u = Math.min(end, k * 1.0 + (p - i > 1 ? 0.14 : 0.14 * (p - i)));
			const turn = 0.32;
			if (u < turn) this.b.set(X, 0.72, D / 2 + 0.05 + (u / turn) * (TOKENS_Z + 0.1 - D / 2 - 0.05));
			else this.b.set(X + ((u - turn) / (1 - turn)) * 2.6, 0.72, TOKENS_Z + 0.1);
			mesh.position.copy(this.b);
		});
	}
}
